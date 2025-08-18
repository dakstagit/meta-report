import axios from "axios";
import dayjs from "dayjs";

const BASE = "https://graph.facebook.com/v19.0";
const TOKEN = process.env.META_TOKEN;

if (!TOKEN) {
  console.warn("META_TOKEN is not set. On Render, set it in Environment Variables.");
}

/* ---------- helpers ---------- */
function monthRange(ym) {
  const target = ym ? dayjs(ym + "-01") : dayjs().subtract(1, "month").startOf("month");
  const since = target.startOf("month").format("YYYY-MM-DD");
  const until = target.endOf("month").format("YYYY-MM-DD");
  return { since, until };
}
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const safeDiv = (a,b) => (n(b) > 0 ? n(a)/n(b) : null);
const pct = (a,b) => {
  const r = safeDiv(a,b);
  return r === null ? null : r*100;
};
const pickActions = (actions = [], type) => {
  const hit = actions.find(a => a.action_type === type);
  return hit ? Number(hit.value || 0) : 0;
};
const pickAny = (actions = [], types = []) =>
  types.reduce((sum, t) => sum + pickActions(actions, t), 0);

/* ---------- basic account ---------- */
export async function getAdAccounts() {
  const url = `${BASE}/me/adaccounts`;
  const params = { access_token: TOKEN, limit: 50, fields: "name,account_id,currency" };
  const { data } = await axios.get(url, { params });
  return data;
}
export async function getAccountInfo(accountId) {
  const url = `${BASE}/act_${accountId}`;
  const params = { access_token: TOKEN, fields: "account_id,name,currency" };
  const { data } = await axios.get(url, { params });
  return data;
}

/* ---------- raw insights ---------- */
export async function getMonthlyInsights({ accountId, ym, level = "account" }) {
  if (!accountId) throw new Error("accountId is required");
  const { since, until } = monthRange(ym);

  const url = `${BASE}/act_${accountId}/insights`;
  const params = {
    access_token: TOKEN,
    time_range: JSON.stringify({ since, until }),
    time_increment: "all_days",
    level,
    limit: 500,
    fields: [
      "date_start","date_stop",
      "account_name","account_id",
      "campaign_id","campaign_name",
      "adset_id","adset_name",
      "ad_id","ad_name",
      "spend","impressions","clicks","cpc","cpm","ctr","reach",
      "frequency",
      "link_clicks",
      "actions","action_values",
      "purchase_roas"
    ].join(",")
  };
  const { data } = await axios.get(url, { params });

  const rows = (data?.data || []).map(r => {
    const purchases = pickActions(r.actions, "offsite_conversion.purchase") || pickActions(r.actions, "purchase");
    const purchase_value = pickActions(r.action_values, "offsite_conversion.purchase") || pickActions(r.action_values, "purchase");

    // additional actions requested for the custom view
    const landing_page_views = pickAny(r.actions, ["landing_page_view", "offsite_conversion.landing_page_view"]);
    const add_to_cart        = pickAny(r.actions, ["offsite_conversion.add_to_cart", "add_to_cart"]);
    const initiate_checkout  = pickAny(r.actions, ["offsite_conversion.initiate_checkout", "initiate_checkout"]);

    // "purchase_roas" from API is an array; take first value if present
    let purchase_roas_api = null;
    if (Array.isArray(r.purchase_roas) && r.purchase_roas.length > 0) {
      const v = Number(r.purchase_roas[0]?.value);
      purchase_roas_api = Number.isFinite(v) ? v : null;
    }

    return {
      date_start: r.date_start,
      date_stop: r.date_stop,
      account_id: r.account_id,
      account_name: r.account_name,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      adset_id: r.adset_id,
      adset_name: r.adset_name,
      ad_id: r.ad_id,
      ad_name: r.ad_name,

      spend: n(r.spend),
      impressions: n(r.impressions),
      clicks: n(r.clicks),
      cpc: r.cpc != null ? n(r.cpc) : null,
      cpm: r.cpm != null ? n(r.cpm) : null,
      ctr: r.ctr != null ? n(r.ctr) : null,
      reach: r.reach != null ? n(r.reach) : null,

      frequency: r.frequency != null ? Number(r.frequency) : null,
      link_clicks: n(r.link_clicks),

      landing_page_views,
      add_to_cart,
      initiate_checkout,

      purchases,
      purchase_value,
      purchase_roas_api
    };
  });

  return { since, until, level, count: rows.length, data: rows };
}

/* ---------- aggregated report ---------- */
function nameFor(row, level) {
  if (level === "campaign") return row.campaign_name || row.campaign_id || "Unknown Campaign";
  if (level === "adset")    return row.adset_name || row.adset_id || "Unknown Ad Set";
  if (level === "ad")       return row.ad_name || row.ad_id || "Unknown Ad";
  return row.account_name || row.account_id || "Account";
}
function idFor(row, level) {
  if (level === "campaign") return row.campaign_id || "unknown_campaign";
  if (level === "adset")    return row.adset_id || "unknown_adset";
  if (level === "ad")       return row.ad_id || "unknown_ad";
  return row.account_id || "account";
}
function deriveKpis({ spend, impressions, clicks, purchases, purchase_value }) {
  const ctr = pct(clicks, impressions);
  const cpc = safeDiv(spend, clicks);
  const cpm = safeDiv(spend*1000, impressions);
  const cpa = safeDiv(spend, purchases);
  const roas = safeDiv(purchase_value, spend);
  return { ctr, cpc, cpm, cpa, roas };
}

// fetch budgets for campaigns/adsets (values are in smallest unit; divide by 100)
async function fetchBudgets(level, ids = []) {
  if (!ids.length) return {};
  const fieldList = "name,daily_budget,lifetime_budget";
  const results = {};
  // simple concurrent fetches (ok for modest list sizes)
  await Promise.all(ids.map(async (id) => {
    const url = `${BASE}/${id}`;
    const params = { access_token: TOKEN, fields: fieldList };
    try {
      const { data } = await axios.get(url, { params });
      const raw = n(data.daily_budget) || n(data.lifetime_budget) || 0;
      results[id] = raw > 0 ? raw / 100 : null; // convert to currency units
    } catch {
      results[id] = null;
    }
  }));
  return results; // map: id -> budget
}

export async function getMonthlyReport({ accountId, ym, level = "campaign", top = 1000 }) {
  const acct = await getAccountInfo(accountId).catch(()=>null);
  const raw = await getMonthlyInsights({ accountId, ym, level });

  const totals = raw.data.reduce((acc, r) => {
    acc.spend += n(r.spend);
    acc.impressions += n(r.impressions);
    acc.clicks += n(r.clicks);
    acc.reach += n(r.reach);
    acc.purchases += n(r.purchases);
    acc.purchase_value += n(r.purchase_value);
    acc.link_clicks += n(r.link_clicks);
    acc.landing_page_views += n(r.landing_page_views);
    acc.add_to_cart += n(r.add_to_cart);
    acc.initiate_checkout += n(r.initiate_checkout);
    return acc;
  }, {
    spend:0, impressions:0, clicks:0, reach:0, purchases:0, purchase_value:0,
    link_clicks:0, landing_page_views:0, add_to_cart:0, initiate_checkout:0
  });

  const summary = { ...totals, ...deriveKpis(totals) };
  summary.frequency = safeDiv(summary.impressions, summary.reach); // summary frequency

  // group breakdown
  const map = new Map();
  for (const r of raw.data) {
    const id = idFor(r, level);
    const name = nameFor(r, level);
    const g = map.get(id) || {
      id, name,
      spend:0, impressions:0, clicks:0, reach:0, purchases:0, purchase_value:0,
      link_clicks:0, landing_page_views:0, add_to_cart:0, initiate_checkout:0,
      purchase_roas_api_vals: []
    };
    g.spend += n(r.spend);
    g.impressions += n(r.impressions);
    g.clicks += n(r.clicks);
    g.reach += n(r.reach);
    g.purchases += n(r.purchases);
    g.purchase_value += n(r.purchase_value);
    g.link_clicks += n(r.link_clicks);
    g.landing_page_views += n(r.landing_page_views);
    g.add_to_cart += n(r.add_to_cart);
    g.initiate_checkout += n(r.initiate_checkout);

    if (r.purchase_roas_api != null) g.purchase_roas_api_vals.push(Number(r.purchase_roas_api));
    map.set(id, g);
  }

  // attach budgets if applicable
  let budgets = {};
  if (level === "campaign" || level === "adset") {
    const ids = Array.from(map.keys());
    budgets = await fetchBudgets(level, ids);
  }

  let breakdown = Array.from(map.values()).map(g => {
    const kpis = { ...g, ...deriveKpis(g) };
    // frequency derived at group level
    kpis.frequency = safeDiv(kpis.impressions, kpis.reach);
    // purchase_roas from API (average of values if multiple)
    if (g.purchase_roas_api_vals.length) {
      const sum = g.purchase_roas_api_vals.reduce((a,b)=>a+b,0);
      kpis.purchase_roas_api = sum / g.purchase_roas_api_vals.length;
    } else {
      kpis.purchase_roas_api = safeDiv(kpis.purchase_value, kpis.spend);
    }
    // budget if retrieved
    kpis.budget = budgets[g.id] ?? null;
    delete kpis.purchase_roas_api_vals;
    return kpis;
  }).sort((a,b)=>b.spend-a.spend);

  if (Number.isFinite(top) && top>0) breakdown = breakdown.slice(0, top);

  return {
    account: { id: acct?.account_id || accountId, name: acct?.name || null, currency: acct?.currency || null },
    since: raw.since,
    until: raw.until,
    level,
    summary,
    breakdown
  };
}
