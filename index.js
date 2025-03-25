import express from "express";
import helmet from "helmet";
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
   overall: [5],
   mental: [5],
   physical: [5],
   days: []
 };
let allResponses = [];

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

app.get("/home", async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  // Get the current day of the week
  const today = new Date().getDay();
  // Hold the listed days of the week
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const userId = req.session.user.id;
  const adviceMap = {
       "I drink 8 glasses of water daily.": "Drinking 8 cups of water daily improves brain function, boosts energy, and supports digestion. Try carrying a water bottle with you to stay on track.",
       "I eat meals regularly.": "Consistent meals keep your metabolism steady and your energy up. Plan meals ahead of time to avoid skipping them.",
       "I feel sluggish and tired most of the time.": "Low energy can signal poor sleep, hydration, or nutrition—addressing these can help. Try winding down an hour earlier and avoid electronics before bed.",
       "I am hopeful about the future.": "Maintaining hope improves mental resilience and reduces stress. Practice gratitude by writing down three things you're grateful for each day.",
       "I am satisfied with my daily life.": "Satisfaction is tied to meaningful routines—celebrate small wins each day. Set achievable goals and reward yourself for completing them.",
       "I have trouble concentrating.": "Breaks, sleep, and limiting distractions can sharpen your focus. Try using the Pomodoro technique to stay focused and take regular breaks.",
       "I feel disconnected from everyone.": "Connection boosts happiness—try reaching out or joining small groups. Take the initiative to schedule time with friends or family.",
       "I feel like I’m the only one struggling.": "You're not alone—talking to others often reveals shared challenges. Consider joining a support group or seeking professional guidance.",
       "I don’t feel I’m as good as everyone.": "Self-worth grows through compassion—focus on progress, not perfection. Practice positive self-talk and celebrate your unique strengths.",
       "I’m sad and unhappy all the time.": "Mood issues may need support—talk to someone and build uplifting habits. Consider professional counseling or journaling to explore your feelings.",
       "I use electronic devices after midnight.": "Late screen time affects sleep—power down early to rest better. Try a digital detox 30 minutes before bed to relax and prepare for sleep.",
       "I exercise for 30 minutes or more every day.": "Exercise boosts mood, focus, and long-term health. Mix up your routine to stay motivated—try different activities like walking, yoga, or strength training.",
       "I go outside for the sun at least 10 minutes a day.": "Sunlight helps regulate sleep and boosts Vitamin D. Take a short walk outside during your lunch break to get that daily dose of sun.",
       "I sleep for 7 to 8 hours.": "Sleep restores the brain and body—aim for consistent, quality rest. Set a regular bedtime, avoid caffeine late in the day, and make your bedroom a restful space.",
       "I drink caffeinated drinks excessively.": "Too much caffeine disrupts sleep and can increase anxiety. Gradually reduce your caffeine intake, especially in the afternoon, to improve sleep quality."
   };

  try {
    // Fetch survey results from the database
    const [general] = await db.query("SELECT * FROM general_survey WHERE user_id = ? ORDER BY created_at DESC", [userId]);
    const [mental] = await db.query("SELECT * FROM mental_survey WHERE user_id = ? ORDER BY created_at DESC", [userId]);
    const [physical] = await db.query("SELECT * FROM physical_survey WHERE user_id = ? ORDER BY created_at DESC", [userId]);

    // Helper function to initialize a week array
    function initializeWeekArray() {
      return new Array(7).fill(0);
    }

    // Function to calculate averages for the last 5 days
    function calculateRecentAverages(data) {
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 6);

      const weekData = new Array(7).fill(null);
      const count = {};

      data.forEach(({ created_at, score }) => {
        const createdAtDate = new Date(created_at);
        if (createdAtDate >= sevenDaysAgo && createdAtDate <= today) {
          const dayIndex = (createdAtDate.getDay() + 7) % 7; // Normalize index
          weekData[dayIndex] = score;
        }
      });

      return weekData.map(score => score || 5);
    }

    // Convert survey results into weekly arrays, considering only the last 5 days
    const overallData = calculateRecentAverages(general);
    const mentalData = calculateRecentAverages(mental);
    const physicalData = calculateRecentAverages(physical);

    // Helper function to get the lowest feedback for each section
    function getLowestFeedback(data) {
      return data
        .sort((a, b) => a.avgScore - b.avgScore)
        .slice(0, 3)
        .map(({ question }) => ({
          question,
          advice: adviceMap[question] || "No advice available.",
        }));
    }
    console.log('Overall Data:', overallData);
    console.log('Mental Data:', mentalData);
    console.log('Physical Data:', physicalData);

    // Render the home page with the filtered survey data
    res.render("home", {
      overallData: overallData,
      mentalData: mentalData,
      physicalData: physicalData,
      days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      overallFeedback: getLowestFeedback(general),
      mentalFeedback: getLowestFeedback(mental),
      physicalFeedback: getLowestFeedback(physical),
    });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Failed to load survey results");
  }
});

app.get("/edit-account", async (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login"); // Ensure user is logged in
    }

    try {
        const [user] = await db.query("SELECT * FROM users WHERE id = ?", [req.session.user.id]);

        if (!user) {
            return res.redirect("/home"); // Redirect if user not found
        }

        res.render("edit-account", { user: user[0], error: null }); // Always define error
    } catch (err) {
        console.error("Database error:", err);
        res.render("edit-account", { user: req.session.user, error: "Failed to load account details" });
    }
});

app.post("/edit-account", async (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  const userId = req.session.user.id;
  const { full_name, email, age, gender, password } = req.body;

  try {
    let query = "UPDATE users SET full_name = ?, email = ?, age = ?, gender = ? WHERE id = ?";
    let params = [full_name, email, age || null, gender, userId];

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query = "UPDATE users SET full_name = ?, email = ?, age = ?, gender = ?, password = ? WHERE id = ?";
      params = [full_name, email, age || null, gender, hashedPassword, userId];
    }

    await db.query(query, params);
    
    // Update session data
    req.session.user.full_name = full_name;
    req.session.user.email = email;
    req.session.user.age = age;
    req.session.user.gender = gender;

    res.redirect("/home");
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).send("Failed to update account details");
  }
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
    const query = `INSERT INTO ${tableName} (user_id, question, score) VALUES (?, ?, ?)`;
    for (const [question, score] of Object.entries(responses)) {
      await db.query(query, [userId, question, parseInt(score)]);
    }
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
