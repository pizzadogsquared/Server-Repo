import express from "express";
import helmet from "helmet";
import session from "express-session";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { handleLogin } from "./login.js";
import { handleSignup } from "./signup.js";
import db from "./db.js";
import { adviceMap, questionMap } from "./advice.js";
import { scheduleReminderJob } from "./sendReminders.js";
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

let surveyResults = {
  overall: [],
  mental: [],
  physical: [],
  days: []
};
let allResponses = [];
const calendarTimeline = {
  overall: [],
  mental: [],
  physical: []
};

function updateTimeline(date, section, avgScore) {
  const sectionKey = section === "general" ? "overall" : section;
  const entry = { day: date, avgScore };
  const timeline = calendarTimeline[sectionKey];
  const existing = timeline.find(e => e.day === date);
  if (existing) existing.avgScore = avgScore;
  else timeline.push(entry);
  if (timeline.length > 30) timeline.shift();
}

app.get("/", (req, res) => res.redirect("/login"));

app.get("/login", (req, res) => res.render("login"));
app.post("/login", handleLogin);

app.get("/signup", (req, res) => res.render("signup"));
app.post("/signup", handleSignup);
app.get("/admin/data-analysis", async (req, res) => {
  if (!req.session.user || !req.session.user.is_admin) {
    return res.status(403).send("Access denied");
  }

  try {
    const [userStats] = await db.query(`
      SELECT country, gender, age, COUNT(*) AS userCount
      FROM users
      WHERE is_admin = 0
      GROUP BY country, gender, age;
    `);
    res.render("admin-dashboard", { userStats, user: req.session.user });
  } catch (err) {
    console.error("Error fetching user statistics:", err);
    res.status(500).send("Failed to load data analysis");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

app.get("/survey-choice", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const userId = req.session.user.id;
  const today = new Date().toISOString().split("T")[0];

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

  res.render("survey-choice", { userProgress: progress });
});

app.post("/submit-survey", async (req, res) => {
  const { section, userId, ...responses } = req.body;
  const today = new Date().toISOString().split("T")[0];
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
      await db.query(`INSERT INTO ${table} (user_id, question, score) VALUES (?, ?, ?)`, [userId, question, parseInt(score)]);
    }
    const avgScore = Math.round(total / entries.length);
    const dateKey = new Date().toLocaleDateString("en-CA");
    updateTimeline(dateKey, section, avgScore);

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

    const allCompleted =
      generalCount[0].count > 0 &&
      mentalCount[0].count > 0 &&
      physicalCount[0].count > 0;

    const coinsEarned = avgScore >= 8 ? 10 : avgScore >= 5 ? 5 : 2;
    await db.query("UPDATE users SET coins = coins + ? WHERE id = ?", [coinsEarned, userId]);
    await db.query("UPDATE users SET survey_count = survey_count + 1 WHERE id = ?", [userId]);

    if (allCompleted) {
      return res.redirect("/survey?section=completed");
    }
    return res.redirect("/survey-choice");
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

app.listen(PORT, () => {console.log(`Listening on port ${PORT}`), scheduleReminderJob();});
