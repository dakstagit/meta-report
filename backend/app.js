import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
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

// paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, "../frontend");
const STORAGE_PATH = path.resolve(__dirname, "./storage.json");

// helpers
function loadStorage() {
  try {
    const raw = fs.readFileSync(STORAGE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { views: {} };
  }
}

/* ------------ API ROUTES FIRST (avoid static hijacking) ------------ */

// health
app.get("/health", (req, res) => res.json({ ok: true }));

// ad accounts
app.get("/debug/ad-accounts", async (req, res) => {
  try {
    const data = await getAdAccounts();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err?.response?.data || err.message || "Unknown error" });
  }
});

// raw insights
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

// aggregated report
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

// view config (defaults to “Revenue Results”)
app.get("/config/view", (req, res) => {
  const name = (req.query.name || "Revenue Results").trim();
  const store = loadStorage();
  const view = store.views?.[name];
  // Always return 200 with an empty list if not found (no 404s here)
  res.json({ name, columns: Array.isArray(view?.columns) ? view.columns : [] });
});

/* ------------------ STATIC FRONTEND AFTER API ------------------ */
app.use(express.static(FRONTEND_DIR));

// SPA fallback to index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Service on ${PORT}`));
