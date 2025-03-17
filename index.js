import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import { handleLogin } from "./login.js";
import { handleSignup } from "./signup.js";
import db from "./db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(session({
  secret: process.env.SESSION_SECRET, 
  resave: false, 
  saveUninitialized: true
}));

let userProgress = {};

app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  res.render("login");
});
app.post("/login", handleLogin);
app.get("/logout", (req, res) => {
  userProgress = {}; 
  res.redirect("/login");
});

app.get("/signup", (req, res) => {
  res.render("signup");
});
app.post("/signup", handleSignup);

app.get("/home", (req, res) => {
  res.render("home");
});

app.get("/survey", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login"); // Redirect if the user is not logged in
  }

  const userId = req.session.user.id;
  const section = req.query.section || "general"; 
  res.render("survey", { userId, section });
});

app.get("/survey-choice", (req, res) => {
  res.render("survey-choice", { userProgress });
});

// **Updated /submit-survey route to store responses in MySQL**
app.post("/submit-survey", async (req, res) => {
  const { section, userId, ...responses } = req.body;
  userProgress[section] = true;

  let tableName;
  switch (section) {
    case "general":
      tableName = "general_survey";
      break;
    case "mental":
      tableName = "mental_survey";
      break;
    case "physical":
      tableName = "physical_survey";
      break;
    default:
      return res.status(400).json({ error: "Invalid survey section" });
  }

  try {
    const query = `INSERT INTO ${tableName} (user_id, response) VALUES (?, ?)`;
    await db.query(query, [userId, JSON.stringify(responses)]);

    if (userProgress.general && userProgress.mental && userProgress.physical) {
      return res.redirect("/survey?section=completed");
    }
    return res.redirect("/survey-choice");
  } catch (err) {
    console.error("Database Error:", err);
    return res.status(500).json({ error: "Failed to save survey response" });
  }
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
