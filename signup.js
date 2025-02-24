import fs from "fs";
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

export async function handleSignup(req, res) {
  const { name, email, password, confirm_password } = req.body;

  // Validate that the passwords match
  if (password !== confirm_password) {
    return res.render("signup", { error: "Passwords do not match." });
  }

  try {
        const conn = await pool.getConnection();

        // Check if email already exists
        const [existingUser] = await conn.query("SELECT * FROM users WHERE email = ?", [email]);
        if (existingUser.length > 0) {
            conn.release();
            return res.render("signup", { error: "Email is already registered." });
        }

        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        await conn.query("INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)", 
            [name, email, hashedPassword]);

        conn.release();
        res.redirect("/login"); // Redirect to login after successful signup
    } catch (err) {
        console.error(err);
        res.send("Error saving user data.");
    }
}
