import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  getAdAccounts,
  getMonthlyInsights,
  getMonthlyReport
} from "./meta.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// serve the frontend (../frontend) from the SAME service.
// no separate static site, no backend URL typing.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, "../frontend");
app.use(express.static(FRONTEND_DIR));

// API
app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/debug/ad-accounts", async (req, res) => {
  try {
    const data = await getAdAccounts();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err?.response?.data || err.message || "Unknown error" });
  }
});

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
    res.status(500).json({ error: err?.response?.data || err.message || "Unknown error" });
  }
});

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
    res.status(500).json({ error: err?.response?.data || err.message || "Unknown error" });
  }
});

// fallback to index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Service on ${PORT}`));
