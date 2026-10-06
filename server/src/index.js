// Lydia — Portabel Express-backend (ersätter Base44 Deno-runtime)
// Körs på Hostinger eller annan Node-host. PostgreSQL som databas.
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { pool } from "./db/client.js";
import { authMiddleware } from "./auth/middleware.js";
import authRoutes from "./routes/auth.js";
import bookingRoutes from "./routes/bookings.js";
import journalRoutes from "./routes/journals.js";
import paymentRoutes from "./routes/payments.js";
import consentRoutes from "./routes/consents.js";
import healthRoutes from "./routes/health.js";
import customerRoutes from "./routes/customers.js";
import auditRoutes from "./routes/audit.js";
import treatmentRoutes from "./routes/treatments.js";
import staffRoutes from "./routes/staff.js";
import smsRoutes from "./routes/sms.js";
import googleCalendarRoutes from "./routes/googleCalendar.js";
import bankidRoutes from "./routes/bankid.js";
import featureFlagRoutes from "./routes/featureFlags.js";
import exportRoutes from "./routes/exports.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(morgan("combined"));

// Rate limiting
app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

// Health check
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// Public routes (no auth)
app.use("/api/auth", authRoutes);
app.use("/api/payments/webhook", paymentRoutes.webhookHandler); // Stripe webhook verifieras via signatur, ej auth

// Authenticated routes
app.use("/api/bookings", authMiddleware, bookingRoutes);
app.use("/api/journals", authMiddleware, journalRoutes);
app.use("/api/payments", authMiddleware, paymentRoutes.router);
app.use("/api/consents", authMiddleware, consentRoutes);
app.use("/api/health", authMiddleware, healthRoutes);
app.use("/api/customers", authMiddleware, customerRoutes);
app.use("/api/audit", authMiddleware, auditRoutes);
app.use("/api/treatments", authMiddleware, treatmentRoutes);
app.use("/api/staff", authMiddleware, staffRoutes);
app.use("/api/sms", authMiddleware, smsRoutes);
app.use("/api/google-calendar", authMiddleware, googleCalendarRoutes);
app.use("/api/bankid", authMiddleware, bankidRoutes);
app.use("/api/feature-flags", authMiddleware, featureFlagRoutes);
app.use("/api/exports", authMiddleware, exportRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

// Start
app.listen(PORT, () => {
  console.log(`Lydia backend running on port ${PORT}`);
  pool.query("SELECT 1").then(() => console.log("PostgreSQL connected")).catch((e) => console.error("DB error:", e.message));
});