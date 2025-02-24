import bcrypt from "bcrypt";
import db from "./db.js";

export async function handleLogin(req, res) {
  const { email, password } = req.body;

  try {
    const conn = await db.getConnection();

    // Query the database for the user
    const [rows] = await conn.query("SELECT * FROM users WHERE email = ?", [email]);
    conn.release();

    if (rows.length === 0) {
      return res.render("login", { error: "Incorrect credentials. Please try again." });
    }

    const user = rows[0];

    // Compare the password with the hashed password stored in the database
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render("login", { error: "Incorrect credentials. Please try again." });
    }

    // Store user session
    req.session.user = { id: user.id, name: user.full_name, email };

    res.redirect("/home"); // Redirect to survey after successful login
  } catch (err) {
    console.error("Error during login:", err);
    res.status(500).send("Internal Server Error");
  }
}
