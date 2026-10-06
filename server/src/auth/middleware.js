// JWT-auth middleware — ersätter Base44 Auth.
// Verifierar token, laddar användare, sätter clinic_id för RLS.
import jwt from "jsonwebtoken";
import { pool } from "../db/client.js";

export async function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [decoded.userId]);
    const user = userRes.rows[0];

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      clinic_id: user.clinic_id,
      data: user.data || {},
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// RBAC-check — ersätter Base44 RLS user_condition
export function requireRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user?.role || req.user?.data?.staff_role;
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export function requireClinicAdmin(req, res, next) {
  const role = req.user?.role;
  const staffRole = req.user?.data?.staff_role;
  if (role !== "admin" && staffRole !== "administratör") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}