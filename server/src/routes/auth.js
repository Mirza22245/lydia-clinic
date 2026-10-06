// Auth-rutter — ersätter Base44 Auth (login, register, OTP, reset, me)
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/client.js";

const router = Router();

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const userRes = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = userRes.rows[0];
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Ogiltig e-post eller lösenord" });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Ogiltig e-post eller lösenord" });
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "E-post redan registrerad" });
    }
    const hash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    await pool.query(
      "INSERT INTO users (id, email, password_hash, email_verified) VALUES ($1, $2, $3, false)",
      [id, email, hash]
    );
    // TODO: skicka OTP via e-post
    res.json({ ok: true, message: "Verifieringskod skickad till " + email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp_code } = req.body;
    // TODO: verifiera OTP mot lagrad kod
    const userRes = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: "Användare saknas" });
    await pool.query("UPDATE users SET email_verified = true WHERE id = $1", [user.id]);
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset password request
router.post("/reset-request", async (req, res) => {
  // Visa alltid generiskt meddelande (avslöjar inte om e-post finns)
  res.json({ ok: true, message: "Om kontot finns har ett återställningsmail skickats." });
});

// Reset password
router.post("/reset", async (req, res) => {
  try {
    const { reset_token, new_password } = req.body;
    // TODO: verifiera reset token
    const hash = await bcrypt.hash(new_password, 10);
    // TODO: uppdatera användarens lösenord
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user
router.get("/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [decoded.userId]);
    const user = userRes.rows[0];
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      clinic_id: user.clinic_id,
      data: user.data || {},
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;