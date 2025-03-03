import bcrypt from "bcrypt";
import db from "./db.js";

export async function handleSignup(req, res) {
  const { name, email, password, confirm_password, age, gender } = req.body;

  // Validate that the passwords match
  if (password !== confirm_password) {
    return res.render("signup", { error: "Passwords do not match." });
  }

  try {
        const conn = await db.getConnection();

        // Check if email already exists
        const [existingUser] = await conn.query("SELECT * FROM users WHERE email = ?", [email]);
        if (existingUser.length > 0) {
            conn.release();
            return res.render("signup", { error: "Email is already registered." });
        }

        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        await conn.query("INSERT INTO users (full_name, email, password, age, gender) VALUES (?, ?, ?, ?, ?)", 
            [name, email, hashedPassword, age || null, gender || "Prefer not to answer"]);

        conn.release();
        res.redirect("/login"); // Redirect to login after successful signup
    } catch (err) {
        console.error("Error during signup:", err);
        res.status(500).send("Internal Server Error");
    }
}
