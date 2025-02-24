import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import { handleLogin } from "./login.js";
import { handleSignup } from "./signup.js";
import db from "./db.js";

dotenv.config();

const app = express()
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

// Route for login ("/login")
app.get("/login", (req, res) => {
  res.render("login");
});

// Handle POST request for login
app.post("/login", handleLogin);

// logout, goes back to login page
app.get("/logout", (req, res) => {
  userProgress = {}; // Reset progress
  res.redirect("/login");
});

// Route for signup ("/signup")
app.get("/signup", (reg, res) => {
  res.render("signup");
});

// Handle POST request for signup
app.post("/signup", handleSignup);

// home page, to start surveys
app.get("/home", (req, res) => {
  res.render("home");
});

// surveys
app.get("/survey", (req, res) => {
  const section = req.query.section || "general"; // Default to 'general'
  res.render("survey", { section });
});

app.get("/survey-choice", (req, res) => {
  res.render("survey-choice", { userProgress });
});

app.post("/submit-survey", (req, res) => {
  const { section } = req.body;
  userProgress[section] = true;

  if (userProgress.general && userProgress.mental && userProgress.physical) {
    return res.redirect("/survey?section=completed");
  }
  return res.redirect("/survey-choice");
});

app.listen(PORT, ()=>{
  console.log(`Listening to port ${PORT}`)
});
