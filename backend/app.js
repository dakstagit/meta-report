import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { getAdAccounts, getMonthlyInsights } from "./meta.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Health route for Render health checks
app.get("/health", (req, res) => res.json({ ok: true }));

// Optional root hint (Render shows "Cannot GET /" otherwise)
app.get("/", (req, res) => {
  res.json({
    ok: true,
    hint: "Use /health, /debug/ad-accounts, or /insights/monthly"
  });
});

// Debug: verify your Meta token + permissions
app.get("/debug/ad-accounts", async (req, res) => {
  try {
    const data = await getAdAccounts();
    res.json(data);
  } catch (err) {
    const msg = err?.response?.data || err.message || "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// Monthly insights endpoint
// Example: /insights/monthly?account_id=1234567890
// Optional: &month=2025-07  (YYYY-MM)  | &level=campaign|adset|ad (default "account")
app.get("/insights/monthly", async (req, res) => {
  try {
    const { account_id, month, level } = req.query;
    const result = await getMonthlyInsights({
      accountId: account_id,
      ym: month,
      level: level || "account"
    });
    res.json(result);
  } catch (err) {
    const msg = err?.response?.data || err.message || "Unknown error";
    res.status(500).json({ error: msg });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Backend running on ${PORT}`));
