// login.js - handles POST login logic and session setup
import bcrypt from "bcrypt";
import db from "./db.js";

const INVALID_LOGIN_MSG = "Invalid email or password. Please try again.";
// Valid bcrypt hash for a throwaway string used to normalize timing on missing users.
const DUMMY_BCRYPT_HASH =
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function handleLogin(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render("login", { error: INVALID_LOGIN_MSG });
  }

  const normalizedEmail = email.trim().toLowerCase();
  let conn;

  try {
    conn = await db.getConnection();

    // Query the database for the user
    const [rows] = await conn.query(
      "SELECT * FROM users WHERE email = ?",
      [normalizedEmail]
    );

    if (rows.length === 0) {
      // Fake hash check for security
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      return res.render("login", { error: INVALID_LOGIN_MSG });
    }

    const user = rows[0];

    // Check if password field exists just in case
    if (!user.password) {
      return res.render("login", { error: INVALID_LOGIN_MSG });
    }

    // Compare the password with the hashed password stored in the database
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render("login", { error: INVALID_LOGIN_MSG });
    }

    // Store user session
    req.session.user = {
      id: user.id,
      name: user.full_name,
      email: normalizedEmail,
      is_admin: user.is_admin,
      country: user.country,
    };

    res.redirect("/home");
  } catch (err) {
    console.error("Error during login:", err);
    res.status(500).send("Internal Server Error");
  } finally {
    if (conn) conn.release();
  }
}
