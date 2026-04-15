import crypto from "crypto";
import dotenv from "dotenv";
import { Knock } from "@knocklabs/node";
import db from "./db.js";

dotenv.config();

const DEFAULT_TOKEN_TTL_HOURS = 24;

let verificationColumnsReady = false;
let verificationColumnsPromise = null;

function getEnvValue(name) {
  const value = process.env[name];
  if (typeof value !== "string") return "";
  return value.trim();
}

function getTokenTtlHours() {
  const configured = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS);
  if (!Number.isNaN(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_TOKEN_TTL_HOURS;
}

export function createEmailVerificationToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function getEmailVerificationExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + getTokenTtlHours());
  return expiresAt;
}

export function getAppBaseUrl(req) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/+$/, "");
  }

  if (req) {
    return `${req.protocol}://${req.get("host")}`;
  }

  return "http://localhost:8000";
}

export async function ensureEmailVerificationColumns() {
  if (verificationColumnsReady) return;
  if (verificationColumnsPromise) return verificationColumnsPromise;

  const requiredColumns = [
    {
      name: "email_verified",
      sql: "ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0",
    },
    {
      name: "email_verification_token",
      sql: "ADD COLUMN email_verification_token VARCHAR(128) NULL",
    },
    {
      name: "email_verification_expires_at",
      sql: "ADD COLUMN email_verification_expires_at DATETIME NULL",
    },
  ];

  verificationColumnsPromise = (async () => {
    for (const column of requiredColumns) {
      const [rows] = await db.query("SHOW COLUMNS FROM users LIKE ?", [column.name]);
      if (!rows.length) {
        await db.query(`ALTER TABLE users ${column.sql}`);
      }
    }
    verificationColumnsReady = true;
  })();

  try {
    await verificationColumnsPromise;
  } catch (err) {
    verificationColumnsPromise = null;
    throw err;
  }
}

export async function sendVerificationEmail({ email, name, token, req }) {
  const apiKey = getEnvValue("KNOCK_API_KEY");
  const workflowKey = getEnvValue("KNOCK_VERIFICATION_WORKFLOW_KEY");

  if (!apiKey || !workflowKey) {
    const missing = [];
    if (!apiKey) missing.push("KNOCK_API_KEY");
    if (!workflowKey) missing.push("KNOCK_VERIFICATION_WORKFLOW_KEY");
    throw new Error(`Knock email verification is not configured. Missing: ${missing.join(", ")}`);
  }

  const knock = new Knock(apiKey);
  const verificationUrl = `${getAppBaseUrl(req)}/verify-email?token=${encodeURIComponent(token)}`;

  const workflowRun = await knock.workflows.trigger(workflowKey, {
    recipients: [
      {
        id: email,
        email,
        name,
      },
    ],
    data: {
      user_name: name,
      verification_url: verificationUrl,
    },
  });

  console.log("Knock verification workflow triggered:", {
    workflowKey,
    recipientEmail: email,
    workflowRunId: workflowRun.workflow_run_id,
  });

  return workflowRun;
}
