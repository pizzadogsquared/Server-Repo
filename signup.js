// signup.js - handles POST signup logic and new user creation
import bcrypt from "bcrypt";
import db from "./db.js";

// Basic email validation regex
const isValidEmail = (email) => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);

const ERRORS = {
  invalidEmail: "Invalid email format.",
  missingFields: "All required fields must be filled in.",
  passwordMismatch: "Passwords do not match.",
  nameLength: "Name must be between 2 and 100 characters.",
  emailInUse: "Email is already registered.",
};

export async function handleSignup(req, res) {
  let { name, email, password, confirm_password, age, gender, country } = req.body;

  name = name.trim();
  email = email.trim().toLowerCase();
  gender = gender || "Prefer not to answer";

  // Basic field validation
  if (!name || !email || !password || !confirm_password) {
    return res.render("signup", { error: ERRORS.missingFields });
  }

  if (name.length < 2 || name.length > 100) {
    return res.render("signup", { error: ERRORS.nameLength });
  }

  if (!isValidEmail(email)) {
    return res.render("signup", { error: ERRORS.invalidEmail });
  }

  if (password !== confirm_password) {
    return res.render("signup", { error: ERRORS.passwordMismatch });
  }

  let conn;
  try {
    conn = await db.getConnection();

    const [existingUser] = await conn.query("SELECT id FROM users WHERE LOWER(email) = ?", [email]);
    if (existingUser.length > 0) {
      return res.render("signup", { error: ERRORS.emailInUse });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await conn.query(
      "INSERT INTO users (full_name, email, password, age, gender, country) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, hashedPassword, age || null, gender, country]
    );

    res.redirect("/login");
  } catch (err) {
    console.error("Error during signup:", err);
    res.status(500).send("Internal Server Error");
  } finally {
    if (conn) conn.release();
  }
}

