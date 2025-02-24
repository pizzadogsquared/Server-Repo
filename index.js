import express from "express";
import { handleLogin } from "./login.js";
import { handleSignup } from "./signup.js";
import session from "express-session";

const app = express()
const PORT = 8000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

let userProgress = {};

// Configure session
app.use(session({
  secret: "your_secret_key", 
  resave: false, 
  saveUninitialized: true
}));

app.get("/", (req, res) => {
  res.redirect("/login");
});

// home page, to start surveys
app.get("/home", (req, res) => {
  res.render("home");
});

// surveys
app.get("/survey", (req, res) => {
  const section = req.query.section || "general"; // Default to 'general'
  res.render("survey", { section });
});

// Route for login ("/login")
app.get("/login", (req, res) => {
  res.render("login");
});

// logout, goes back to login page
app.get("/logout", (req, res) => {
  userProgress = {}; // Reset progress
  res.redirect("/login");
});

// Route for signup ("/signup")
app.get("/signup", (reg, res) => {
  res.render("signup");
});

// Handle POST request for login
app.post("/login", handleLogin);

// Handle POST request for signup
app.post("/signup", handleSignup);

app.get("/survey-choice", (req, res) => {
  res.render("survey-choice", { userProgress });
});

app.post("/submit-survey", (req, res) => {
  const { section } = req.body;
  userProgress[section] = true;

  if (userProgress.general && userProgress.mental && userProgress.physical) {
    return res.redirect("/survey?section=completed");
  } else if (section === "general") {
    return res.redirect("/survey-choice");
  } else {
    return res.redirect("/survey-choice");
  }
});

app.listen(PORT, ()=>{
  console.log(`Listening to port ${PORT}`)
});
