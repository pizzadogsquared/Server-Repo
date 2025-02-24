import mysql from "mysql2/promise";
import bcrypt from "bcrypt";

// Database connection
const pool = mysql.createPool({
  host: "localhost",
  user: "bee_user",
  password: "G_rizzy3430@",
  database: "bee_balanced_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export async function handleLogin(req, res) {
  const { email, password } = req.body;

  try {
    const conn = await pool.getConnection();

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
    req.session.user = { id: user.id, name: user.full_name, email: user.email };

    res.redirect("/home"); // Redirect to survey after successful login
  } catch (err) {
    console.error("Error during login:", err);
    res.send("Error logging in.");
  }
}
