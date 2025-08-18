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
  res.json({ name, columns: Array.isArray(view?.columns) ? view.columns : [] });
});

/* ---------------- NEW: AI summary endpoint (lazy import) ---------------- */
app.post("/summary/monthly", async (req, res) => {
  try {
    const { account, summary, breakdown, since, until } = req.body;
    if (!account || !summary) return res.status(400).json({ error: "Missing data" });

    // lazy-load OpenAI so service still boots if package missing
    let OpenAI;
    try {
      ({ default: OpenAI } = await import("openai"));
    } catch {
      return res.status(500).json({ error: "OpenAI SDK not installed. Add \"openai\" to backend/package.json dependencies." });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY not set in environment." });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Ask the model to return clean HTML (not Markdown)
    const prompt = `
You are a senior marketing consultant. Generate a monthly ad performance report as clean HTML only.
No code fences, no <html> or <body> wrappers, just semantic HTML inside a single fragment.

Use these sections:
<h2>Monthly Performance Summary</h2>
<p>One-paragraph executive overview with spend, revenue, ROAS, CTR, CPC, purchases.</p>

<h3>Key Wins</h3>
<ul>3–5 concise bullets with specific numbers and impact.</ul>

<h3>Underperformers / Issues</h3>
<ul>3–5 bullets; call out high-spend low-ROAS items and any fatigue (high frequency).</ul>

<h3>Actionable Recommendations for Next Month</h3>
<ul>Specific, practical steps: budget shifts, creative tests, audiences, pacing, frequency controls.</ul>

Format numbers human-readably (currency with symbol, 2 decimals, percentages). Do not invent data—use exactly what's provided.

DATA:
Account: ${account.name} (${account.id})
Period: ${since} to ${until}
Currency: ${account.currency}

Summary KPIs:
- Spend: ${summary.spend}
- Revenue: ${summary.purchase_value}
- ROAS: ${summary.roas}
- CTR: ${summary.ctr}
- CPC: ${summary.cpc}
- Purchases: ${summary.purchases}

Top campaigns (subset):
${(breakdown || []).slice(0, 10).map(r =>
  `- ${r.name}: spend ${r.spend}, purchases ${r.purchases}, ROAS ${r.purchase_roas_api || r.roas}, CTR ${r.ctr}, frequency ${r.frequency}`
).join("\n")}
    `.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6
    });

    const html = completion.choices[0].message.content.trim();
    res.json({ html });
  } catch (err) {
    console.error("AI summary error:", err);
    res.status(500).json({ error: "AI summary failed" });
  }
});

/* ------------------ STATIC FRONTEND AFTER API ------------------ */
app.use(express.static(FRONTEND_DIR));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Service on ${PORT}`));
