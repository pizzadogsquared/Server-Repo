import bcrypt from "bcrypt";
import db from "./db.js";

export async function handleLogin(req, res) {
  const { email, password } = req.body;
  const normalizedEmail = email.trim().toLowerCase();
  let conn;
  
  try {
    conn = await db.getConnection();

    // Query the database for the user
    const [rows] = await conn.query("SELECT * FROM users WHERE email = ?", [normalizedEmail]);
    conn.release();

    if (rows.length === 0) {
      await bcrypt.compare(password, "$2b$10$invalidsalt12345678901234567890"); // Fake compare to prevent timing attacks
      return res.render("login", { error: "Invalid email or password. Please try again." });
    }

    const user = rows[0];

    // Compare the password with the hashed password stored in the database
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render("login", { error: "Invalid email or password. Please try again." });
    }

    // Store user session
    req.session.user = { id: user.id, name: user.full_name, email: normalizedEmail, is_admin: user.is_admin, country: user.country };

    res.redirect("/home"); // Redirect to survey after successful login
  } catch (err) {
    console.error("Error during login:", err);
    res.status(500).send("Internal Server Error");
  } finally {
    if (conn) conn.release(); // Ensure connection is released
  }
}
