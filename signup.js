// signup.js - handles POST signup logic and new user creation
import bcrypt from "bcrypt";
import db from "./db.js";
import {
  createEmailVerificationToken,
  ensureEmailVerificationColumns,
  getEmailVerificationExpiryDate,
  sendVerificationEmail,
} from "./verification.js";

// Basic email validation regex
const isValidEmail = (email) => {
  const trimmed = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
};

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

  if (password.length < 6) {
    return res.render("signup", { error: "Password must be at least 6 characters long." });
  }

  let conn;
  try {
    await ensureEmailVerificationColumns();
    conn = await db.getConnection();

    const [existingUser] = await conn.query("SELECT id FROM users WHERE LOWER(email) = ?", [email]);
    if (existingUser.length > 0) {
      return res.render("signup", { error: ERRORS.emailInUse });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = createEmailVerificationToken();
    const verificationExpiresAt = getEmailVerificationExpiryDate();

    await conn.query(
      `INSERT INTO users (
        full_name,
        email,
        password,
        age,
        gender,
        country,
        unsubscribed,
        email_verified,
        email_verification_token,
        email_verification_expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email,
        hashedPassword,
        age || null,
        gender,
        country,
        false,
        false,
        verificationToken,
        verificationExpiresAt,
      ]
    );

    try {
      await sendVerificationEmail({
        email,
        name,
        token: verificationToken,
        req,
      });
    } catch (emailErr) {
      console.error("Error sending verification email:", emailErr);
      return res.render("login", {
        error: "Account created, but we could not send the verification email yet. Please resend verification below.",
        message: null,
        verificationEmail: email,
      });
    }

    res.redirect(`/login?message=${encodeURIComponent("Account created. Please check your email to verify your account.")}&verificationEmail=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error("Error during signup:", err);
    res.status(500).send("Internal Server Error");
  } finally {
    if (conn) conn.release();
  }
}

