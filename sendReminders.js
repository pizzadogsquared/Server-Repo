import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import cron from "node-cron";
import { Knock } from "@knocklabs/node";
import db from "./db.js";
import { getAppBaseUrl } from "./verification.js";
import {
  createUnsubscribeToken,
  getMissingCheckinSections,
} from "./utils/reminders.js";

dotenv.config();

const PHOENIX_TIME_ZONE = "America/Phoenix";
const REMINDER_ELIGIBILITY_CHECK_CRON = "0 * * * *";
const REMINDER_INTERVAL_HOURS = 72;
const REMINDER_WORKFLOW_FALLBACK = "reminder";

let reminderJobScheduled = false;
let reminderColumnsReady = false;
let reminderColumnsPromise = null;

function getEnvValue(name) {
  const value = process.env[name];
  if (typeof value !== "string") return "";
  return value.trim();
}

function getReminderConfig() {
  const apiKey = getEnvValue("KNOCK_API_KEY");
  const workflowKey =
    getEnvValue("KNOCK_CHECKIN_REMINDER_WORKFLOW_KEY") ||
    REMINDER_WORKFLOW_FALLBACK;

  if (!apiKey) {
    throw new Error("Knock check-in reminders are not configured. Missing: KNOCK_API_KEY");
  }

  return {
    apiKey,
    workflowKey,
  };
}

function getLocalDateString(date = new Date(), timeZone = PHOENIX_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function ensureReminderColumns() {
  if (reminderColumnsReady) return;
  if (reminderColumnsPromise) return reminderColumnsPromise;

  reminderColumnsPromise = (async () => {
    const [rows] = await db.query(
      "SHOW COLUMNS FROM users LIKE ?",
      ["last_checkin_reminder_sent_at"]
    );

    if (!rows.length) {
      await db.query(
        "ALTER TABLE users ADD COLUMN last_checkin_reminder_sent_at DATETIME NULL"
      );
    }

    reminderColumnsReady = true;
  })();

  try {
    await reminderColumnsPromise;
  } catch (err) {
    reminderColumnsPromise = null;
    throw err;
  }
}

function createReminderPayload(user, missingSections, options = {}) {
  const baseUrl = getAppBaseUrl();
  const unsubscribeToken = createUnsubscribeToken(user.id);
  const unsubscribeUrl =
    `${baseUrl}/unsubscribe?userId=${encodeURIComponent(String(user.id))}` +
    `&token=${encodeURIComponent(unsubscribeToken)}`;

  return {
    user_name: user.full_name,
    checkin_url: `${baseUrl}/checkin?section=choice`,
    unsubscribe_url: unsubscribeUrl,
    reminder_date: getLocalDateString(),
    missing_sections: missingSections,
    missing_sections_text: missingSections.join(", "),
    is_test_email: Boolean(options.isTestEmail),
  };
}

async function getUsersMissingCheckins(localDate) {
  await ensureReminderColumns();

  const [rows] = await db.query(
    `SELECT
        u.id,
        u.email,
        u.full_name,
        u.last_checkin_reminder_sent_at,
        EXISTS(
          SELECT 1
            FROM general_survey gs
           WHERE gs.user_id = u.id
             AND DATE(gs.created_at) = ?
        ) AS has_general,
        EXISTS(
          SELECT 1
            FROM mental_survey ms
           WHERE ms.user_id = u.id
             AND DATE(ms.created_at) = ?
        ) AS has_mental,
        EXISTS(
          SELECT 1
            FROM physical_survey ps
           WHERE ps.user_id = u.id
             AND DATE(ps.created_at) = ?
        ) AS has_physical
      FROM users u
      WHERE u.email_verified = 1
        AND COALESCE(u.unsubscribed, 0) = 0
        AND u.email IS NOT NULL
        AND TRIM(u.email) <> ""
        AND (
          u.last_checkin_reminder_sent_at IS NULL
          OR u.last_checkin_reminder_sent_at <= (NOW() - INTERVAL ? HOUR)
        )
      HAVING has_general = 0
          OR has_mental = 0
          OR has_physical = 0`,
    [localDate, localDate, localDate, REMINDER_INTERVAL_HOURS]
  );

  return rows;
}

async function getReminderUserById(userId, localDate) {
  await ensureReminderColumns();

  const [[user]] = await db.query(
    `SELECT
        u.id,
        u.email,
        u.full_name,
        u.email_verified,
        COALESCE(u.unsubscribed, 0) AS unsubscribed,
        EXISTS(
          SELECT 1
            FROM general_survey gs
           WHERE gs.user_id = u.id
             AND DATE(gs.created_at) = ?
        ) AS has_general,
        EXISTS(
          SELECT 1
            FROM mental_survey ms
           WHERE ms.user_id = u.id
             AND DATE(ms.created_at) = ?
        ) AS has_mental,
        EXISTS(
          SELECT 1
            FROM physical_survey ps
           WHERE ps.user_id = u.id
             AND DATE(ps.created_at) = ?
        ) AS has_physical
      FROM users u
      WHERE u.id = ?
      LIMIT 1`,
    [localDate, localDate, localDate, userId]
  );

  return user || null;
}

async function sendReminder(knock, workflowKey, user) {
  const missingSections = getMissingCheckinSections(user);

  if (!missingSections.length) {
    return null;
  }

  const workflowRun = await knock.workflows.trigger(workflowKey, {
    recipients: [
      {
        id: String(user.id),
        email: user.email,
        name: user.full_name,
      },
    ],
    data: createReminderPayload(user, missingSections),
  });

  console.log("Knock reminder workflow triggered:", {
    workflowKey,
    userId: user.id,
    recipientEmail: user.email,
    missingSections,
    workflowRunId: workflowRun.workflow_run_id,
  });

  await db.query(
    "UPDATE users SET last_checkin_reminder_sent_at = NOW() WHERE id = ?",
    [user.id]
  );

  return workflowRun;
}

export async function sendTestCheckinReminder(userId) {
  const { apiKey, workflowKey } = getReminderConfig();
  const knock = new Knock(apiKey);
  const localDate = getLocalDateString();
  const user = await getReminderUserById(userId, localDate);

  if (!user) {
    throw new Error("User not found.");
  }

  if (!user.email_verified) {
    throw new Error("Please verify your email before testing reminders.");
  }

  if (!user.email || !String(user.email).trim()) {
    throw new Error("No email address is available for this account.");
  }

  const actualMissingSections = getMissingCheckinSections(user);
  const missingSections = actualMissingSections.length
    ? actualMissingSections
    : ["general", "mental", "physical"];

  const workflowRun = await knock.workflows.trigger(workflowKey, {
    recipients: [
      {
        id: String(user.id),
        email: user.email,
        name: user.full_name,
      },
    ],
    data: createReminderPayload(user, missingSections, {
      isTestEmail: true,
    }),
  });

  console.log("Knock test reminder workflow triggered:", {
    workflowKey,
    userId: user.id,
    recipientEmail: user.email,
    missingSections,
    workflowRunId: workflowRun.workflow_run_id,
  });

  return workflowRun;
}

export async function sendNightlyCheckinReminders() {
  const { apiKey, workflowKey } = getReminderConfig();
  const knock = new Knock(apiKey);
  const localDate = getLocalDateString();
  const users = await getUsersMissingCheckins(localDate);

  if (!users.length) {
    console.log(`No 72-hour check-in reminders needed for ${localDate}.`);
    return [];
  }

  const results = await Promise.allSettled(
    users.map((user) => sendReminder(knock, workflowKey, user))
  );

  const failedEmails = results
    .map((result, index) => ({ result, user: users[index] }))
    .filter(({ result }) => result.status === "rejected");

  failedEmails.forEach(({ result, user }) => {
    console.error(`Failed to send 72-hour reminder to ${user.email}:`, result.reason);
  });

  console.log(
    `72-hour check-in reminders processed for ${localDate}: ${users.length - failedEmails.length} sent, ${failedEmails.length} failed.`
  );

  return results;
}

export function scheduleNightlyCheckinReminderJob() {
  if (reminderJobScheduled) {
    return;
  }

  cron.schedule(
    REMINDER_ELIGIBILITY_CHECK_CRON,
    async () => {
      try {
        await sendNightlyCheckinReminders();
      } catch (error) {
        console.error("72-hour check-in reminder job failed:", error);
      }
    },
    {
      timezone: PHOENIX_TIME_ZONE,
    }
  );

  reminderJobScheduled = true;
  console.log("72-hour check-in reminder job scheduled with hourly eligibility checks in America/Phoenix.");
}

const currentFilePath = fileURLToPath(import.meta.url);
const entryFilePath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (entryFilePath && currentFilePath === entryFilePath) {
  scheduleNightlyCheckinReminderJob();
}
