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
const NIGHTLY_REMINDER_CRON = "0 22 * * *";
const REMINDER_WORKFLOW_FALLBACK = "reminder";

let reminderJobScheduled = false;

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
  const [rows] = await db.query(
    `SELECT
        u.id,
        u.email,
        u.full_name,
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
      HAVING has_general = 0
          OR has_mental = 0
          OR has_physical = 0`,
    [localDate, localDate, localDate]
  );

  return rows;
}

async function getReminderUserById(userId, localDate) {
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
    console.log(`No nightly check-in reminders needed for ${localDate}.`);
    return [];
  }

  const results = await Promise.allSettled(
    users.map((user) => sendReminder(knock, workflowKey, user))
  );

  const failedEmails = results
    .map((result, index) => ({ result, user: users[index] }))
    .filter(({ result }) => result.status === "rejected");

  failedEmails.forEach(({ result, user }) => {
    console.error(`Failed to send nightly reminder to ${user.email}:`, result.reason);
  });

  console.log(
    `Nightly check-in reminders processed for ${localDate}: ${users.length - failedEmails.length} sent, ${failedEmails.length} failed.`
  );

  return results;
}

export function scheduleNightlyCheckinReminderJob() {
  if (reminderJobScheduled) {
    return;
  }

  cron.schedule(
    NIGHTLY_REMINDER_CRON,
    async () => {
      try {
        await sendNightlyCheckinReminders();
      } catch (error) {
        console.error("Nightly check-in reminder job failed:", error);
      }
    },
    {
      timezone: PHOENIX_TIME_ZONE,
    }
  );

  reminderJobScheduled = true;
  console.log("Nightly check-in reminder job scheduled for 10:00 PM America/Phoenix.");
}

const currentFilePath = fileURLToPath(import.meta.url);
const entryFilePath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (entryFilePath && currentFilePath === entryFilePath) {
  scheduleNightlyCheckinReminderJob();
}
