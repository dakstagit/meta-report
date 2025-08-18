import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  getAdAccounts,
  getMonthlyInsights,
  getMonthlyReport
} from "./meta.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Health route for Render health checks
app.get("/health", (req, res) => res.json({ ok: true }));

// Root hint
app.get("/", (req, res) => {
  res.json({
    ok: true,
    hint: "Use /health, /debug/ad-accounts, /insights/monthly, or /reports/monthly"
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

// Raw monthly insights (Meta response normalized row-by-row)
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

// Aggregated monthly report: summary KPIs + breakdown
// Example:
//   /reports/monthly?account_id=1234567890
// Optional:
//   &month=2025-07
//   &level=campaign  (or adset, ad; default campaign)
//   &top=20          (limit breakdown rows by spend desc; default 1000 = effectively all)
app.get("/reports/monthly", async (req, res) => {
  try {
    const { account_id, month, level, top } = req.query;
    const result = await getMonthlyReport({
      accountId: account_id,
      ym: month,
      level: level || "campaign",
      top: top ? Number(top) : 1000
    });
    res.json(result);
  } catch (err) {
    const msg = err?.response?.data || err.message || "Unknown error";
    res.status(500).json({ error: msg });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Backend running on ${PORT}`));
