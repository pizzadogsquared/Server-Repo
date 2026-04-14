import express from "express";
import helmet from "helmet";
import session from "express-session";
import dotenv from "dotenv";
import { createRequire } from "module";
import bcrypt from "bcrypt";
import { handleLogin } from "./login.js";
import { handleSignup } from "./signup.js";
import db from "./db.js";
import cron from "node-cron";
import { adviceMap, questionMap } from "./advice.js";
// import { scheduleReminderJob } from "./sendReminders.js";
import { markDayComplete, getCurrentStreak } from "./streak.js";
import { getAdviceFor } from './advice.js';
import OpenAI from "openai";
import surveyData from "./surveyData.js";
import {
  createEmailVerificationToken,
  ensureEmailVerificationColumns,
  getEmailVerificationExpiryDate,
  sendVerificationEmail,
} from "./verification.js";
import {
  DEFAULT_BUDDY_NAME,
  BUDDY_COSTS,
  BUDDY_OPTIONS,
  normalizeBuddyProfile,
  buildBuddyStatusRedirect,
} from "./utils/buddy.js";
import { getLowestScoringQuestion } from "./utils/survey.js";
dotenv.config();
const require = createRequire(import.meta.url);
const app = express();
const PORT = process.env.PORT || 8000;
const isProduction = process.env.NODE_ENV === "production";

let trustProxySetting = 1;
if (process.env.TRUST_PROXY === "true") {
  trustProxySetting = true;
} else if (process.env.TRUST_PROXY === "false") {
  trustProxySetting = false;
} else if (process.env.TRUST_PROXY) {
  const parsedTrustProxy = Number(process.env.TRUST_PROXY);
  if (!Number.isNaN(parsedTrustProxy)) {
    trustProxySetting = parsedTrustProxy;
  }
}

let sessionCookieSecure = "auto";
if (process.env.SESSION_COOKIE_SECURE === "true") {
  sessionCookieSecure = true;
} else if (process.env.SESSION_COOKIE_SECURE === "false") {
  sessionCookieSecure = false;
} else if (!isProduction) {
  sessionCookieSecure = false;
}

const sessionStoreConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "my_database",
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: 24 * 60 * 60 * 1000,
  createDatabaseTable: true,
};

let sessionStore;
try {
  const MySQLStoreFactory = require("express-mysql-session");
  const MySQLStore = MySQLStoreFactory(session);
  sessionStore = new MySQLStore(sessionStoreConfig);
  console.log("MySQL session store enabled.");
} catch (err) {
  console.warn("express-mysql-session is not installed. Falling back to MemoryStore.");
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

app.set("trust proxy", trustProxySetting);
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: trustProxySetting !== false,
	cookie: {
		secure: sessionCookieSecure,
		httpOnly: true,
		sameSite: "lax",
		maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'"]
    }
  })
);
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "script-src 'self' 'unsafe-inline' https://cdn.plot.ly;");
  res.locals.user = req.session.user || null;
  next();
});

const calendarTimeline = {
  overall: [],
  mental: [],
  physical: []
};

const tableMap = {
  general: 'general_survey',
  mental: 'mental_survey',
  physical: 'physical_survey'
};

let buddyColumnsReady = false;
let buddyColumnsPromise = null;

async function ensureBuddyCustomizationColumns() {
  if (buddyColumnsReady) return;
  if (buddyColumnsPromise) return buddyColumnsPromise;

  const requiredColumns = [
    {
      name: "buddy_type",
      sql: "ADD COLUMN buddy_type VARCHAR(20) NOT NULL DEFAULT 'dog'",
    },
    {
      name: "buddy_name",
      sql: `ADD COLUMN buddy_name VARCHAR(100) NOT NULL DEFAULT '${DEFAULT_BUDDY_NAME}'`,
    },
    {
      name: "buddy_has_collar",
      sql: "ADD COLUMN buddy_has_collar TINYINT(1) NOT NULL DEFAULT 0",
    },
    {
      name: "owned_buddy_types",
      sql: "ADD COLUMN owned_buddy_types TEXT NULL",
    },
  ];

  buddyColumnsPromise = (async () => {
    for (const column of requiredColumns) {
      const [rows] = await db.query("SHOW COLUMNS FROM users LIKE ?", [column.name]);
      if (!rows.length) {
        await db.query(`ALTER TABLE users ${column.sql}`);
      }
    }
    buddyColumnsReady = true;
  })();

  try {
    await buddyColumnsPromise;
  } catch (err) {
    buddyColumnsPromise = null;
    throw err;
  }
}

function getLocalDateString() {
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

app.get("/", (req, res) => {
  res.redirect("/welcome");
});

app.get("/welcome", (req, res) => {
  res.render("welcome");
});

app.get("/login", (req, res) => {
  res.render("login", {
    error: null,
    message: req.query.message || null,
    verificationEmail: req.query.verificationEmail || null,
  });
});
app.post("/login", handleLogin);

app.get("/signup", (req, res) => res.render("signup"));
app.post("/signup", handleSignup);

app.get("/verify-email", async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== "string") {
    return res.render("login", {
      error: "Verification link is invalid.",
      message: null,
      verificationEmail: null,
    });
  }

  try {
    await ensureEmailVerificationColumns();

    const [[user]] = await db.query(
      `SELECT email, email_verification_expires_at, email_verified
         FROM users
        WHERE email_verification_token = ?`,
      [token]
    );

    if (!user) {
      return res.render("login", {
        error: "Verification link is invalid or has already been used.",
        message: null,
        verificationEmail: null,
      });
    }

    if (user.email_verified) {
      return res.render("login", {
        error: null,
        message: "Your email is already verified. You can log in now.",
        verificationEmail: null,
      });
    }

    const expiresAt = user.email_verification_expires_at
      ? new Date(user.email_verification_expires_at)
      : null;
    if (!expiresAt || expiresAt < new Date()) {
      return res.render("login", {
        error: "Your verification link has expired. Please resend verification below.",
        message: null,
        verificationEmail: user.email,
      });
    }

    await db.query(
      `UPDATE users
          SET email_verified = 1,
              email_verification_token = NULL,
              email_verification_expires_at = NULL
        WHERE email_verification_token = ?`,
      [token]
    );

    return res.render("login", {
      error: null,
      message: "Email verified successfully. You can now log in.",
      verificationEmail: null,
    });
  } catch (err) {
    console.error("Error verifying email:", err);
    return res.status(500).send("Internal Server Error");
  }
});

app.post("/resend-verification", async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  if (!email) {
    return res.render("login", {
      error: "Email is required to resend verification.",
      message: null,
      verificationEmail: null,
    });
  }

  try {
    await ensureEmailVerificationColumns();

    const [[user]] = await db.query(
      `SELECT id, full_name, email, email_verified
         FROM users
        WHERE email = ?`,
      [email]
    );

    if (!user) {
      return res.render("login", {
        error: "No account was found for that email address.",
        message: null,
        verificationEmail: null,
      });
    }

    if (user.email_verified) {
      return res.render("login", {
        error: null,
        message: "That email is already verified. You can log in now.",
        verificationEmail: null,
      });
    }

    const verificationToken = createEmailVerificationToken();
    const verificationExpiresAt = getEmailVerificationExpiryDate();

    await db.query(
      `UPDATE users
          SET email_verification_token = ?,
              email_verification_expires_at = ?
        WHERE id = ?`,
      [verificationToken, verificationExpiresAt, user.id]
    );

    await sendVerificationEmail({
      email: user.email,
      name: user.full_name,
      token: verificationToken,
      req,
    });

    return res.render("login", {
      error: null,
      message: "A new verification email has been sent.",
      verificationEmail: user.email,
    });
  } catch (err) {
    console.error("Error resending verification email:", err);
    return res.render("login", {
      error: "We could not resend verification right now. Please try again later.",
      message: null,
      verificationEmail: email,
    });
  }
});

app.get("/chatbot", (req, res) => {
  res.render("chatbot");
});

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// OpenAI API
app.post("/api/chatbot", async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    stream: true,
  });

  for await (const part of stream) {
    const chunk = part.choices[0]?.delta?.content || "";
    if (chunk) res.write(`data: ${chunk}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
});

// unsubscribe from email notifications
app.get("/unsubscribe", async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).send("Missing user ID.");
  }

  try {
    await db.query("UPDATE users SET unsubscribed = TRUE WHERE id = ?", [userId]);
    res.send("You have successfully unsubscribed from future Bee Balanced reminders.");
  } catch (err) {
    console.error("Error unsubscribing:", err);
    res.status(500).send("Error unsubscribing. Please try again later.");
  }
});

app.get("/admin/data-analysis", async (req, res) => {
  if (!req.session.user || !req.session.user.is_admin) {
    return res.status(403).send("Access denied");
  }

  try {
    // Query to get the user data categorized by country, gender, and age, excluding admin users
    const [userStats] = await db.query(`
      SELECT 
        u.country,
        u.gender,
        u.age,
        COUNT(DISTINCT u.id) AS userCount,
        ROUND(AVG(gs.score), 2) AS avgOverall,
        ROUND(AVG(ms.score), 2) AS avgMental,
        ROUND(AVG(ps.score), 2) AS avgPhysical
      FROM users u
      LEFT JOIN general_survey gs ON u.id = gs.user_id
      LEFT JOIN mental_survey ms ON u.id = ms.user_id
      LEFT JOIN physical_survey ps ON u.id = ps.user_id
      WHERE u.is_admin = 0
      GROUP BY u.country, u.gender, u.age;

    `);

    const [totalResult] = await db.query(`
      SELECT COUNT(*) AS total
      FROM users
      WHERE is_admin = 0;
    `);
    const totalUsers = totalResult[0].total;

    // Render the admin-dashboard view with the user statistics
    res.render("admin-dashboard", { userStats, totalUsers, user: req.session.user });
  } catch (err) {
    console.error("Error fetching user statistics:", err);
    res.status(500).send("Failed to load data analysis");
  }
});


app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

app.get("/edit-account", async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  try {
    const [user] = await db.query("SELECT * FROM users WHERE id = ?", [req.session.user.id]);

    if (!user || user.length === 0) {
      return res.redirect("/home");
    }

    res.render("edit-account", { user: user[0], error: null });
  } catch (err) {
    console.error("Database error:", err);
    res.render("edit-account", { user: req.session.user, error: "Failed to load account details" });
  }
});

app.post("/edit-account", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  let { full_name, email, gender, age, country } = req.body;
  full_name = full_name?.trim();
  email = email?.trim().toLowerCase();
  gender = gender?.trim();
  country = country?.trim();
  age = age ? parseInt(age) : null;

  if (!full_name || full_name.length < 2) {
    return res.render("edit-account", {
      user: req.session.user,
      error: "Full name must be at least 2 characters long."
    });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.render("edit-account", {
      user: req.session.user,
      error: "Please enter a valid email address."
    });
  }

  try {
    await db.query(
      "UPDATE users SET full_name = ?, email = ?, gender = ?, age = ?, country = ? WHERE id = ?",
      [full_name, email, gender, age, country, req.session.user.id]
    );

    // Also update session values
    req.session.user.full_name = full_name;
    req.session.user.email = email;
    req.session.user.gender = gender;
    req.session.user.age = age;
    req.session.user.country = country;

    res.redirect("/edit-account");
  } catch (err) {
    console.error("Account update error:", err);
    res.render("edit-account", { user: req.session.user, error: "Failed to update account" });
  }
});


async function buildTimeline(userId, section) {
  const sectionKey = section === "general" ? "overall" : section;
  const table = {
    overall: "general_survey",
    mental: "mental_survey",
    physical: "physical_survey"
  }[sectionKey];

  const [entries] = await db.query(`
    SELECT DATE(created_at) as day, AVG(score) as avgScore
    FROM ${table}
    WHERE user_id = ?
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at) DESC
    LIMIT 30;
  `, [userId]);

  calendarTimeline[sectionKey] = entries.map(({ day, avgScore }) => ({
    day: new Date(day).toISOString().split('T')[0],
    avgScore
  }));

}

app.get("/calendar", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const userId = req.session.user.id;
  const calendarView = req.query.calendarView || "overall";

  await buildTimeline(userId, "overall");
  await buildTimeline(userId, "mental");
  await buildTimeline(userId, "physical");

  res.render("calendar", {
    calendarView,
    timelineData: {
      overall: calendarTimeline.overall.slice(),
      mental: calendarTimeline.mental.slice(),
      physical: calendarTimeline.physical.slice()
    }
  });
});

/*
app.get("/home", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const userId = req.session.user.id;
  const [planted] = await db.query(`
    SELECT pf.spot_index, f.image FROM planted_flowers pf
    JOIN flowers f ON f.id = pf.flower_id
    WHERE pf.user_id = ?
  `, [userId]);

  res.render("home", {
    plantedFlowers: planted
  });
});
*/

async function getTodaySurveyContext(userId) {
  const today = getLocalDateString();

  const tables = ["general_survey", "mental_survey", "physical_survey"];
  const context = {};

  for (const table of tables) {
    const [rows] = await db.query(
      `SELECT question, score
         FROM ${table}
        WHERE user_id = ?
          AND DATE(created_at) = ?`,
      [userId, today]
    );

    if (!rows.length) continue;

    const short = table.split("_")[0]; // "general", "mental", "physical"

    context[short] = rows.map((r) => {
      // questionMap.general.q1, questionMap.mental.q3, etc.
      const text =
        (questionMap[short] && questionMap[short][r.question]) || r.question;
      return {
        id: r.question,   // q1, q2, etc.
        text,             // full question string
        score: r.score,   // 1–10
      };
    });
  }

  return context;
}

app.get("/home", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const userId = req.session.user.id;
  await ensureBuddyCustomizationColumns();

  let petMood = "neutral";
  let petThirsty = false;

  try {
    const [moodRows] = await db.query(
      "SELECT score FROM mental_survey WHERE user_id = ? AND question = ? ORDER BY created_at DESC LIMIT 1",
      [userId, "q5"]     // q5 = "I generally feel happy and emotionally balanced."
    );

    if (moodRows.length > 0) {
      const score = moodRows[0].score; // 1–10
      if (score >= 8) petMood = "happy";
      else if (score <= 3) petMood = "sad";
      else petMood = "neutral";
    }

    const [waterRows] = await db.query(
      "SELECT score FROM general_survey WHERE user_id = ? AND question = ? ORDER BY created_at DESC LIMIT 1",
      [userId, "q1"]     // q1 = "I drink 8 glasses of water daily."
    );

    if (waterRows.length > 0) {
      const waterScore = waterRows[0].score; // 1–10
      if (waterScore <= 6) petThirsty = true;
    }
  } catch (err) {
    console.error("Error loading pet state:", err);
  }

  let surveyContext = {};
  try {
    surveyContext = await getTodaySurveyContext(userId);
  } catch (err) {
    console.error("Error building survey context:", err);
  }

  const [planted] = await db.query(
    `SELECT pf.spot_index, f.image
       FROM planted_flowers pf
       JOIN flowers f ON f.id = pf.flower_id
      WHERE pf.user_id = ?`,
    [userId]
  );

  const [[userRow]] = await db.query(
    `SELECT coins, buddy_type, buddy_name, buddy_has_collar, owned_buddy_types
       FROM users
      WHERE id = ?`,
    [userId]
  );
  const streak = await getCurrentStreak(userId);
  const buddyProfile = normalizeBuddyProfile(userRow);

  let buddyCoins = 0;
  if (userRow && typeof userRow.coins !== "undefined") {
    buddyCoins = userRow.coins;
  }

  if (req.session.user) {
    req.session.user.coins = buddyCoins;
  }

  res.render("home", {
    user: req.session.user,
    petMood,
    petThirsty,
    plantedFlowers: planted,
    surveyContext,
    streak,
    buddyCoins,
    buddyProfile,
    buddyStatus: req.query.buddyStatus || null,
    buddyStatusType: req.query.buddyStatusType || "success",
    openBuddyModal: req.query.openBuddyModal === "1",
    buddyCosts: BUDDY_COSTS,
    buddyOptions: BUDDY_OPTIONS,
  });
});


app.get("/feedback", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const userId = req.session.user.id;
  const today = getLocalDateString();

  const sections = ["general_survey", "mental_survey", "physical_survey"];
  const progress = { general: false, mental: false, physical: false };
  const allAdvice = [];

  for (const section of sections) {
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS count FROM ${section} WHERE user_id = ? AND DATE(created_at) = ?`,
      [userId, today]
    );
  
    const shortName = section.split("_")[0];
    progress[shortName] = countRows[0].count > 0;
  
    if (countRows[0].count === 0) continue;
  
    const [rows] = await db.query(
      `SELECT * FROM ${section} WHERE user_id = ? AND DATE(created_at) = ?`,
      [userId, today]
    );
  
    if (rows.length > 0) {
      const lowestRow = rows.reduce((min, curr) =>
        curr.score < min.score ? curr : min
      );
  
      const shortSection = section.split("_")[0];
      const advice = getAdviceFor(shortSection, lowestRow.question);
      if (advice) {
        advice.section = section;
        allAdvice.push(advice);
      }

    }
  }
  

  res.render("feedback", { userProgress: progress, adviceList: allAdvice });
});

app.get("/chart", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const userId = req.session.user.id;

  const [general] = await db.query("SELECT * FROM general_survey WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  const [mental] = await db.query("SELECT * FROM mental_survey WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  const [physical] = await db.query("SELECT * FROM physical_survey WHERE user_id = ? ORDER BY created_at DESC", [userId]);

  function getRecentSurveyScores(entries) {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 13);

    const dailyScores = {};

    for (const entry of entries) {
      const rawDate = entry.created_at instanceof Date ? entry.created_at : new Date(entry.created_at);
      const dateObj = new Date(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate());
      const localDateStr = dateObj.toISOString().split("T")[0];

      if (dateObj >= start && dateObj <= now) {
        if (!dailyScores[localDateStr]) dailyScores[localDateStr] = [];
        dailyScores[localDateStr].push(entry.score);
      }
    }

    return Object.keys(dailyScores).sort().map(dateStr => {
      const scores = dailyScores[dateStr];
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return { date: dateStr, avgScore: Math.round(avg * 100) / 100 };
    });
  }

  const overallData = getRecentSurveyScores(general);
  const mentalData = getRecentSurveyScores(mental);
  const physicalData = getRecentSurveyScores(physical);

  res.render("chart", {
    overallData,
    mentalData,
    physicalData
  });
});

app.get("/survey", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const section = req.query.section;
  const userId = req.session.user.id;
  const today = getLocalDateString();

  try {
    const [[user]] = await db.query("SELECT coins FROM users WHERE id = ?", [userId]);
    const coins = user?.coins || 0;

    let advice = null;
    const feedback = req.session.feedback || null;
    if (feedback && feedback.question) {
      advice = getAdviceFor(feedback.section, feedback.question);
      if (advice) {
        advice.section = feedback.section;
      }
    }
    delete req.session.feedback;

    if (section === "completed") {
      const coinsEarned = req.session.coinsEarned || null;
      const calcTime = req.session.insightCalcTime || null;

      delete req.session.coinsEarned;
      delete req.session.insightCalcTime;

      return res.render("survey", { section: "completed", userId, coins, coinsEarned, advice, calcTime });
    }

    const surveySection = section || "choice";
    const questions = surveyData[surveySection];
    const [generalCount] = await db.query(
      `SELECT COUNT(*) AS count FROM general_survey WHERE user_id = ? AND DATE(created_at) = ?`,
      [userId, today]
    );
    const [mentalCount] = await db.query(
      `SELECT COUNT(*) AS count FROM mental_survey WHERE user_id = ? AND DATE(created_at) = ?`,
      [userId, today]
    );
    const [physicalCount] = await db.query(
      `SELECT COUNT(*) AS count FROM physical_survey WHERE user_id = ? AND DATE(created_at) = ?`,
      [userId, today]
    );

    const allCompletedToday =
      generalCount[0].count > 0 &&
      mentalCount[0].count > 0 &&
      physicalCount[0].count > 0;

    if (allCompletedToday) {
      const coinsEarned = req.session.coinsEarned || null;
      delete req.session.coinsEarned;
      return res.render("survey", { section: "completed", userId, coins, coinsEarned, advice });
    }

    const sectionTableMap = {
      general: generalCount,
      mental: mentalCount,
      physical: physicalCount
    };

    if (sectionTableMap[surveySection]?.[0]?.count > 0) {
      return res.redirect("/survey-choice");
    }

    res.render("survey", { section: surveySection, userId, coins, advice, questions: questions });
  } catch (err) {
    console.error("Survey section check error:", err);
    res.status(500).send("Error checking survey status");
  }
});

app.get("/survey-choice", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const userId = req.session.user.id;
  const today = getLocalDateString();

  try {
    const [[user]] = await db.query("SELECT coins FROM users WHERE id = ?", [userId]);
    const coins = user?.coins || 0;

    const sections = ["general_survey", "mental_survey", "physical_survey"];
    const progress = { general: false, mental: false, physical: false };

    for (const section of sections) {
      const [rows] = await db.query(
        `SELECT COUNT(*) AS count FROM ${section} WHERE user_id = ? AND DATE(created_at) = ?`,
        [userId, today]
      );
      const shortName = section.split("_")[0];
      progress[shortName] = rows[0].count > 0;
    }

    const coinsEarned = req.session.coinsEarned || null;
    delete req.session.coinsEarned;

    const feedback = req.session.feedback || null;
    let advice = null;

    if (feedback && feedback.question) {
      advice = getAdviceFor(feedback.section, feedback.question);
      if (advice) {
        advice.section = feedback.section;
      }  
    }
    delete req.session.feedback;

    res.render("survey-choice", { userProgress: progress, coinsEarned, coins, advice });
  } catch (err) {
    console.error("Survey-choice error:", err);
    res.status(500).send("Error loading survey choice page");
  }
});

app.post("/submit-survey", async (req, res) => {
		const startTime = Date.now();
		const localDate = getLocalDateString();

		const { section, clientCoinDelta, surveyResults } = req.body;

    if (!req.session.user) {
      return res.status(401).send("Not authenticated");
    }

    const userId = req.session.user.id;

		let responses;
	try {
		if (typeof surveyResults === "string") {
			responses = JSON.parse(surveyResults);
		} else if (surveyResults && typeof surveyResults === "object") {
			responses = surveyResults;
		} else {
			return res.status(400).send("Missing surveyResults");
		}
	} catch (err) {
    return res.status(400).send("Invalid survey data format");
  }

  try {
    const table = tableMap[section];
    const entries = Object.entries(responses);
    let total = 0;

    for (const [question, score] of entries) {
      total += parseInt(score);
      await db.query(
        `INSERT INTO ${table} (user_id, question, score, created_at) VALUES (?, ?, ?, ?)`, // add created_at and extra ?
        [userId, question, parseInt(score), localDate]
      );
    }
    await db.query(
        `INSERT IGNORE INTO daily_checkins (user_id, checkin_date)
        VALUES (?, ?)`,
        [userId, localDate]
    );
    const avgScore = Math.round(total / entries.length);

    const [generalCount] = await db.query(
        `SELECT COUNT(*) AS count FROM general_survey WHERE user_id = ? AND DATE(created_at) = ?`,
        [userId, localDate]
    );
    const [mentalCount] = await db.query(
      `SELECT COUNT(*) AS count FROM mental_survey WHERE user_id = ? AND DATE(created_at) = ?`,
      [userId, localDate]
    );
    const [physicalCount] = await db.query(
      `SELECT COUNT(*) AS count FROM physical_survey WHERE user_id = ? AND DATE(created_at) = ?`,
      [userId, localDate]
    );

    const allCompleted =
      generalCount[0].count > 0 &&
      mentalCount[0].count > 0 &&
      physicalCount[0].count > 0;

    if (allCompleted) {
      await markDayComplete(userId, localDate);
    }

    const coinsEarned = avgScore >= 8 ? 10 : avgScore >= 5 ? 5 : 2;
    await db.query("UPDATE users SET coins = coins + ? WHERE id = ?", [coinsEarned, userId]);
    // add any client-side accumulated coins (clientCoinDelta) to user's coins in DB
    const delta = parseInt(clientCoinDelta, 10) || 0;
    if (delta > 0) {
      await db.query("UPDATE users SET coins = coins + ? WHERE id = ?", [delta, userId]);
    }
    await db.query("UPDATE users SET survey_count = survey_count + 1 WHERE id = ?", [userId]);
    req.session.coinsEarned = coinsEarned;

    const feedbackData = {};
    for (const [question, score] of entries) {
      feedbackData[question] = parseInt(score);
    }

    const lowest = getLowestScoringQuestion(feedbackData);
    req.session.feedback = {
      question: lowest.key,
      score: lowest.value,
      reason: lowest.reason,
      section
    };
    

    // refresh user's coins in session if available
    try {
      const [[userRow]] = await db.query('SELECT coins FROM users WHERE id = ?', [userId]);
      if (req.session.user) req.session.user.coins = userRow.coins;
    } catch (e) {
      console.error('Failed to refresh session coins:', e);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    req.session.insightCalcTime = duration;

    console.log('Wellness insight processing time:', duration, 'ms');

    req.session.save((err) => {
      if (err) {
        console.error("Session Save Error:", err);
        return res.status(500).send("Failed to save session data");
      }
  
      if (allCompleted) {
        return res.redirect("/survey?section=completed");
      }
      return res.redirect("/survey-choice");
    });
  } catch (err) {
    console.error("Survey Submit DB Error:", err);
    res.status(500).send("Failed to save survey");
  }
});

// Increment user's coins (DB) — called from client when user first selects a question
app.post('/api/increment-coin', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  const userId = req.session.user.id;
  try {
    await db.query('UPDATE users SET coins = coins + 1 WHERE id = ?', [userId]);
    const [[userRow]] = await db.query('SELECT coins FROM users WHERE id = ?', [userId]);
    // update session copy
    req.session.user.coins = userRow.coins;
    req.session.save(() => {
      return res.json({ coins: userRow.coins });
    });
  } catch (err) {
    console.error('Error incrementing coins:', err);
    res.status(500).json({ error: 'Failed to increment coins' });
  }
});

app.get("/games", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const userId = req.session.user.id;

  const [[{ survey_count }]] = await db.query("SELECT survey_count FROM users WHERE id = ?", [userId]);

  res.render("games", { totalSurveys: survey_count });
});

app.get("/shop", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const userId = req.session.user.id;
  const [[user]] = await db.query("SELECT coins FROM users WHERE id = ?", [userId]);
  const [flowers] = await db.query("SELECT * FROM flowers");
  res.render("shop", { user, flowers });
});

app.post("/buy-flower", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const userId = req.session.user.id;
  const { flowerId } = req.body;
  const [[user]] = await db.query("SELECT coins FROM users WHERE id = ?", [userId]);
  const [[flower]] = await db.query("SELECT * FROM flowers WHERE id = ?", [flowerId]);
  if (!flower || user.coins < flower.price) return res.status(400).send("Not enough coins");
  await db.query("UPDATE users SET coins = coins - ? WHERE id = ?", [flower.price, userId]);
  res.redirect("/plant?flowerId=" + flowerId);
});

app.get("/plant", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const userId = req.session.user.id;
  const { flowerId } = req.query;
  const [[flower]] = await db.query("SELECT * FROM flowers WHERE id = ?", [flowerId]);
  const [plantedFlowers] = await db.query("SELECT spot_index FROM planted_flowers WHERE user_id = ?", [userId]);
  res.render("plant", { flower, plantedFlowers });
});

app.post("/plant", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const userId = req.session.user.id;
  const { flowerId, spotIndex } = req.body;
  await db.query(`
    INSERT INTO planted_flowers (user_id, spot_index, flower_id)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE flower_id = VALUES(flower_id)
  `, [userId, spotIndex, flowerId]);
  res.redirect("/home");
});

app.post("/customize-buddy", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const userId = req.session.user.id;
  const { customAction, petType, buddyName } = req.body;

  try {
    await ensureBuddyCustomizationColumns();

    const [[userRow]] = await db.query(
      `SELECT coins, buddy_type, buddy_name, buddy_has_collar, owned_buddy_types
         FROM users
        WHERE id = ?`,
      [userId]
    );

    if (!userRow) {
      return res.redirect(buildBuddyStatusRedirect("Could not load your buddy profile.", "error", true));
    }

    const buddyProfile = normalizeBuddyProfile(userRow);

    if (customAction === "pet") {
      if (!BUDDY_OPTIONS[petType]) {
        return res.redirect(buildBuddyStatusRedirect("That buddy option is not available.", "error", true));
      }

      if (buddyProfile.ownedBuddyTypes.includes(petType)) {
        await db.query("UPDATE users SET buddy_type = ? WHERE id = ?", [petType, userId]);
        return res.redirect(buildBuddyStatusRedirect(`${BUDDY_OPTIONS[petType].label} equipped.`));
      }

      if ((userRow.coins || 0) < BUDDY_COSTS.pet) {
        return res.redirect(buildBuddyStatusRedirect("You need 30 coins to unlock that buddy.", "error", true));
      }

      const nextOwned = [...buddyProfile.ownedBuddyTypes, petType];
      await db.query(
        `UPDATE users
            SET coins = coins - ?,
                buddy_type = ?,
                owned_buddy_types = ?
          WHERE id = ?`,
        [BUDDY_COSTS.pet, petType, JSON.stringify(nextOwned), userId]
      );

      req.session.user.coins = (userRow.coins || 0) - BUDDY_COSTS.pet;
      return res.redirect(buildBuddyStatusRedirect(`${BUDDY_OPTIONS[petType].label} unlocked and equipped.`));
    }

    if (customAction === "collar") {
      if (buddyProfile.buddyHasCollar) {
        return res.redirect(buildBuddyStatusRedirect("Your buddy already has a collar.", "error", true));
      }

      if ((userRow.coins || 0) < BUDDY_COSTS.collar) {
        return res.redirect(buildBuddyStatusRedirect("You need 20 coins to buy a collar.", "error", true));
      }

      await db.query(
        "UPDATE users SET coins = coins - ?, buddy_has_collar = 1 WHERE id = ?",
        [BUDDY_COSTS.collar, userId]
      );

      req.session.user.coins = (userRow.coins || 0) - BUDDY_COSTS.collar;
      return res.redirect(buildBuddyStatusRedirect("Collar purchased for your buddy."));
    }

    if (customAction === "name") {
      const trimmedName = (buddyName || "").trim();

      if (trimmedName.length < 2 || trimmedName.length > 30) {
        return res.redirect(buildBuddyStatusRedirect("Buddy names must be between 2 and 30 characters.", "error", true));
      }

      if (trimmedName === buddyProfile.buddyName) {
        return res.redirect(buildBuddyStatusRedirect("Pick a new name to rename your buddy.", "error", true));
      }

      if ((userRow.coins || 0) < BUDDY_COSTS.rename) {
        return res.redirect(buildBuddyStatusRedirect("You need 10 coins to rename your buddy.", "error", true));
      }

      await db.query(
        "UPDATE users SET coins = coins - ?, buddy_name = ? WHERE id = ?",
        [BUDDY_COSTS.rename, trimmedName, userId]
      );

      req.session.user.coins = (userRow.coins || 0) - BUDDY_COSTS.rename;
      return res.redirect(buildBuddyStatusRedirect(`${trimmedName} is ready to hang out.`));
    }

    return res.redirect(buildBuddyStatusRedirect("Unknown buddy customization request.", "error", true));
  } catch (err) {
    console.error("Error customizing buddy:", err);
    return res.redirect(buildBuddyStatusRedirect("Buddy customization failed. Please try again.", "error", true));
  }
});

// Run every night at 1 AM
cron.schedule("0 1 * * *", async () => {
  try {
    await db.execute("DELETE FROM general_survey WHERE created_at < NOW() - INTERVAL 3 MONTH");
    await db.execute("DELETE FROM mental_survey WHERE created_at < NOW() - INTERVAL 3 MONTH");
    await db.execute("DELETE FROM physical_survey WHERE created_at < NOW() - INTERVAL 3 MONTH");

    console.log("Old surveys cleaned up successfully.");
  } catch (error) {
    console.error("Error cleaning up old surveys:", error.message);
  }
});

app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
//  scheduleReminderJob();
});
