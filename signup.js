import bcrypt from "bcrypt";
import db from "./db.js";

// Function to validate email format
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export async function handleSignup(req, res) {
  let { name, email, password, confirm_password, age, gender, country } = req.body;

  // Trim inputs to remove unnecessary spaces
  name = name.trim();
  email = email.trim().toLowerCase(); // Convert email to lowercase for consistency
  gender = gender || "Prefer not to answer";

  // Validate email format
  if (!isValidEmail(email)) {
    return res.render("signup", { error: "Invalid email format." });
  }

  // Validate that the passwords match
  if (password !== confirm_password) {
    return res.render("signup", { error: "Passwords do not match." });
  }

  let conn;
  try {
        conn = await db.getConnection();

        // Check if email already exists
        const [existingUser] = await conn.query("SELECT id FROM users WHERE LOWER(email) = ?", [email]);
        if (existingUser.length > 0) {
            return res.render("signup", { error: "Email is already registered." });
        }

        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        await conn.query("INSERT INTO users (full_name, email, password, age, gender, country) VALUES (?, ?, ?, ?, ?, ?)", 
            [name, email, hashedPassword, age || null, gender, country]);

        res.redirect("/login"); // Redirect to login after successful signup
    } catch (err) {
        console.error("Error during signup:", err);
        res.status(500).send("Internal Server Error");
    } finally {
      if (conn) conn.release(); // Ensure connection is released
    }
}
