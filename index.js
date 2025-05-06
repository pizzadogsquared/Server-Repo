import express from "express";
import helmet from "helmet";
import session from "express-session";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { handleLogin } from "./login.js";
import { handleSignup } from "./signup.js";
import db from "./db.js";
import cron from "node-cron";
import { adviceMap, questionMap } from "./advice.js";
import { scheduleReminderJob } from "./sendReminders.js";
import { getAdviceFor } from './advice.js';
dotenv.config();
const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
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

function getLocalDateString() {
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

function getLowestScoringQuestion(scores) {
  const entries = Object.entries(scores);
  const values = entries.map(([, val]) => val);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  const threshold = avg - 2;
  const standout = entries.find(([, val]) => val <= threshold);
  if (standout) return { key: standout[0], value: standout[1], reason: 'standout' };

  const minVal = Math.min(...values);
  const lowest = entries.find(([, val]) => val === minVal);
  return { key: lowest[0], value: lowest[1], reason: 'low' };
}


app.get("/", (req, res) => {
  res.redirect("/welcome");
});

app.get("/welcome", (req, res) => {
  res.render("welcome");
});

app.get("/login", (req, res) => res.render("login"));
app.post("/login", handleLogin);

app.get("/signup", (req, res) => res.render("signup"));
app.post("/signup", handleSignup);

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
    delete req.session.coinsEarned;
    return res.render("survey", { section: "completed", userId, coinsEarned, advice });
  }

  const surveySection = section || "choice";

  try {
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
      return res.render("survey", { section: "completed", userId, coinsEarned, advice });
    }

    const sectionTableMap = {
      general: generalCount,
      mental: mentalCount,
      physical: physicalCount
    };

    if (sectionTableMap[surveySection]?.[0]?.count > 0) {
      return res.redirect("/survey-choice");
    }

    res.render("survey", { section: surveySection, userId, advice });
  } catch (err) {
    console.error("Survey section check error:", err);
    res.status(500).send("Error checking survey status");
  }
});

app.get("/survey-choice", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const userId = req.session.user.id;
  const today = getLocalDateString();

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

  res.render("survey-choice", { userProgress: progress, coinsEarned, advice });
});

app.post("/submit-survey", async (req, res) => {
  const { section, userId, ...responses } = req.body;
  const localDate = getLocalDateString();

  try {
    const tableMap = {
      general: "general_survey",
      mental: "mental_survey",
      physical: "physical_survey",
    };
    const table = tableMap[section];
    const entries = Object.entries(responses);
    let total = 0;
    for (const [question, score] of entries) {
      total += parseInt(score);
      await db.query(
        `INSERT INTO ${table} (user_id, question, score, created_at) VALUES (?, ?, ?, ?)`,
        [userId, question, parseInt(score), localDate]
      );
    }
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

    const coinsEarned = avgScore >= 8 ? 10 : avgScore >= 5 ? 5 : 2;
    await db.query("UPDATE users SET coins = coins + ? WHERE id = ?", [coinsEarned, userId]);
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

// Run every night at 1 AM
cron.schedule("0 1 * * *", async () => {
  try {
    await db.execute("DELETE FROM general_survey WHERE created_at < NOW() - INTERVAL 3 MONTH");
    await db.execute("DELETE FROM mental_survey WHERE created_at < NOW() - INTERVAL 3 MONTH");
    await db.execute("DELETE FROM physical_survey WHERE created_at < NOW() - INTERVAL 3 MONTH");

    console.log("✅ Old surveys cleaned up successfully.");
  } catch (error) {
    console.error("❌ Error cleaning up old surveys:", error.message);
  }
});

app.listen(PORT, () => {console.log(`Listening on port ${PORT}`), scheduleReminderJob();});
