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
    const parsed = JSON.parse(raw);
    if (!parsed.views) parsed.views = {};
    if (!parsed.cache) parsed.cache = {};
    return parsed;
  } catch {
    // default structure
    return { views: {}, cache: {} };
  }
}

function saveStorage(store) {
  fs.writeFileSync(STORAGE_PATH, JSON.stringify(store, null, 2), "utf8");
}

// key for caching per account + month + level
function cacheKey({ accountId, ym, level }) {
  return `${accountId || "na"}_${ym || "latest"}_${level || "campaign"}`;
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
You are an experienced performance marketer writing a monthly Meta ads report as clean HTML only.
No code fences, no <html> or <body> wrappers, just semantic HTML inside a single fragment.

GLOBAL BENCHMARKS (FOLLOW THESE STRICTLY):
- ROAS (ecommerce typical ranges):
  * ROAS < 1.0  = very poor / loss making
  * 1.0–2.0     = weak / needs fixing
  * 2.0–3.0     = below average / needs improvement
  * 3.0–5.0     = solid / good
  * 5.0–10.0    = very strong / excellent
  * > 10.0      = exceptional / outstanding
- CTR:
  * < 0.7%      = weak
  * 0.7–1.5%    = okay / average
  * 1.5–3%      = good
  * > 3%        = very strong
- Never call a campaign with ROAS ≥ 5.0 "bad", "weak", "inefficient" or "underperforming".
  You may say it has limited scale if spend is low, but not that performance is poor.

DEFINITION OF TRUE UNDERPERFORMANCE:
Treat a campaign/ad/ad set as an underperformer ONLY if BOTH are true:
1) It has meaningful spend (at least 5% of total account spend OR clearly non-trivial spend).
2) AND at least ONE of these holds:
   - ROAS < 2.0, OR
   - ROAS is at least 30% below the account's overall ROAS, OR
   - CTR is clearly weak (< 0.7%) and below the account average, OR
   - CPC is much higher than the account average and performance is not compensating for it.

If, after applying these rules, there are NO true underperformers:
- DO NOT include any "Underperformers" section at all.
- Do not invent fake problems.
- Instead, in the main summary and recommendations, state clearly that performance was broadly strong
  and focus on how to safely scale winners, manage frequency, and add new tests.

STRUCTURE RULES:
- If there ARE underperformers, use the three-section structure below.
- If there are NO underperformers, OMIT the "Underperformers / Issues" section entirely
  (no <h3>Underperformers / Issues</h3>, no bullets for it).

When you DO include the section, keep it factual and grounded in the metrics.

TARGET HTML STRUCTURE:

<h2>Monthly Performance Summary</h2>
<p>
One-paragraph executive overview with spend, revenue, ROAS, CTR, CPC, purchases.
Mention explicitly if the month was overall strong and if there were or were not any major underperformers.
</p>

<h3>Key Wins</h3>
<ul>
3–5 concise bullets highlighting the strongest campaigns/ad sets by a mix of ROAS and volume.
Always treat very high ROAS (e.g. > 5x, especially > 10x) as clear wins.
</ul>

[OPTIONAL SECTION – INCLUDE ONLY IF THERE ARE TRUE UNDERPERFORMERS]
<h3>Underperformers / Issues</h3>
<ul>
Only list items that match the "true underperformance" rules above.
Do NOT criticise high-ROAS campaigns; if they have issues, frame them as scale/fatigue, not bad results.
If there are no true underperformers, skip this entire heading and list.
</ul>

<h3>Actionable Recommendations for Next Month</h3>
<ul>
- If performance was strong overall: focus on scaling top performers, testing new creatives/audiences,
  protecting performance (frequency control, budget pacing), and diversification.
- If there were true underperformers: include specific, practical fixes (budget shifts away from weak
  campaigns, pausing clearly bad ones, and what to test instead).
- Base recommendations on spend, ROAS, CTR, CPC, purchases and frequency; do not give generic advice.
</ul>

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
      temperature: 0.2  // more literal, less bullshit
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
