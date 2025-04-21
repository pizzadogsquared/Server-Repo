// Full working index.js file with MySQL integration + calendarTimeline + weekly logic

import express from "express";
import helmet from "helmet";
import session from "express-session";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { handleLogin } from "./login.js";
import { handleSignup } from "./signup.js";
import db from "./db.js";
import { adviceMap, questionMap } from "./advice.js";

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
  next();
});

let userProgress = {};
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

app.get("/logout", (req, res) => {
  userProgress = {};
  req.session.destroy(() => res.redirect("/login"));
});

app.get("/home", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const userId = req.session.user.id;
  const today = new Date().getDay();
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const calendarView = req.query.calendarView || "overall";
  const [planted] = await db.query(`
    SELECT pf.spot_index, f.image FROM planted_flowers pf
    JOIN flowers f ON f.id = pf.flower_id
    WHERE pf.user_id = ?
  `, [userId]);

  if (surveyResults.days.length === 0 && allResponses.length === 0) {
    while (surveyResults.days.length < today) {
      surveyResults.days.push(weekdays[surveyResults.days.length]);
      surveyResults.overall.push(5);
      surveyResults.mental.push(5);
      surveyResults.physical.push(5);
    }
  }

  const [general] = await db.query("SELECT * FROM general_survey WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  const [mental] = await db.query("SELECT * FROM mental_survey WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  const [physical] = await db.query("SELECT * FROM physical_survey WHERE user_id = ? ORDER BY created_at DESC", [userId]);

  function getLowestFeedback(data, sectionName) {
    const sectionQuestions = questionMap[sectionName];
    return data
      .map(entry => ({
        question: sectionQuestions[entry.question] || entry.question,
        avgScore: entry.score || 5,
      }))
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 3)
      .map(({ question }) => ({
        question,
        advice: adviceMap[question] || "No advice available.",
      }));
  }

  function calculateRecentAverages(data) {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);
    const weekData = new Array(7).fill(null);
    data.forEach(({ created_at, score }) => {
      const createdAtDate = new Date(created_at);
      if (createdAtDate >= sevenDaysAgo && createdAtDate <= today) {
        const dayIndex = (createdAtDate.getDay() + 7) % 7;
        weekData[dayIndex] = score;
      }
    });
    return weekData.map(score => score || 5);
  }

  const overallData = calculateRecentAverages(general);
  const mentalData = calculateRecentAverages(mental);
  const physicalData = calculateRecentAverages(physical);

  res.render("home", {
    overallData,
    mentalData,
    physicalData,
    days: weekdays,
    overallFeedback: getLowestFeedback(general, "general"),
    mentalFeedback: getLowestFeedback(mental, "mental"),
    physicalFeedback: getLowestFeedback(physical, "physical"),
    calendarTimeline,
    calendarView,
    plantedFlowers: planted,
  });
});

app.get("/survey", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const section = req.query.section || "general";
  res.render("survey", { section, userId: req.session.user.id });
});

app.get("/survey-choice", (req, res) => {
  res.render("survey-choice", { userProgress });
});

app.post("/submit-survey", async (req, res) => {
  const { section, userId, ...responses } = req.body;
  const today = new Date().getDay();
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const yesterday = today === 0 ? 6 : today - 1;

  if (surveyResults.days.length === 0 && allResponses.length === 0) {
    while (surveyResults.days.length < yesterday) {
      surveyResults.days.push(weekdays[surveyResults.days.length]);
      surveyResults.overall.push(5);
      surveyResults.mental.push(5);
      surveyResults.physical.push(5);
    }
  }

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

    const nextDay = weekdays[surveyResults.days.length % 7];
    if (surveyResults.days.at(-1) === "Saturday" && nextDay === "Sunday") {
      console.log("Resetting chart for new week starting from Sunday");
      surveyResults = {
        overall: [],
        mental: [avgScore],
        physical: [avgScore],
        days: []
      };
    }

    surveyResults.days.push(nextDay);
    if (section === "general") surveyResults.overall.push(avgScore);
    else if (section === "mental") surveyResults.mental.push(avgScore);
    else if (section === "physical") surveyResults.physical.push(avgScore);

    userProgress[section] = true;

    const coinsEarned = avgScore >= 8 ? 10 : avgScore >= 5 ? 5 : 2;
    await db.query("UPDATE users SET coins = coins + ? WHERE id = ?", [coinsEarned, userId]);
    await db.query("UPDATE users SET survey_count = survey_count + 1 WHERE id = ?", [userId]);

    if (userProgress.general && userProgress.mental && userProgress.physical) {
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

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
