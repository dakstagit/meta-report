import axios from "axios";
import dayjs from "dayjs";

const BASE = "https://graph.facebook.com/v19.0";
const TOKEN = process.env.META_TOKEN;

if (!TOKEN) {
  console.warn("META_TOKEN is not set. On Render, set it in Environment Variables.");
}

/* -------------------- helpers -------------------- */

function monthRange(ym) {
  const target = ym ? dayjs(ym + "-01") : dayjs().subtract(1, "month").startOf("month");
  const since = target.startOf("month").format("YYYY-MM-DD");
  const until = target.endOf("month").format("YYYY-MM-DD");
  return { since, until };
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function safeDiv(a, b) {
  const A = n(a), B = n(b);
  return B > 0 ? A / B : null;
}

function pct(a, b) {
  const r = safeDiv(a, b);
  return r === null ? null : r * 100;
}

function pickActions(actions = [], type) {
  const hit = actions.find(a => a.action_type === type);
  return hit ? Number(hit.value || 0) : 0;
}

/* -------------------- account info -------------------- */

export async function getAdAccounts() {
  const url = `${BASE}/me/adaccounts`;
  const params = {
    access_token: TOKEN,
    limit: 50,
    fields: "name,account_id,currency"
  };
  const { data } = await axios.get(url, { params });
  return data;
}

export async function getAccountInfo(accountId) {
  const url = `${BASE}/act_${accountId}`;
  const params = {
    access_token: TOKEN,
    fields: "account_id,name,currency"
  };
  const { data } = await axios.get(url, { params });
  return data; // { account_id, name, currency }
}

/* -------------------- raw insights -------------------- */

export async function getMonthlyInsights({ accountId, ym, level = "account" }) {
  if (!accountId) throw new Error("accountId is required");

  const { since, until } = monthRange(ym);

  const url = `${BASE}/act_${accountId}/insights`;
  const params = {
    access_token: TOKEN,
    time_range: JSON.stringify({ since, until }),
    time_increment: "all_days",
    level,                 // account | campaign | adset | ad
    limit: 500,
    fields: [
      "date_start",
      "date_stop",
      "account_name",
      "account_id",
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_id",
      "ad_name",
      "spend",
      "impressions",
      "clicks",
      "cpc",
      "cpm",
      "ctr",
      "reach",
      "actions",
      "action_values",
      "purchase_roas"
    ].join(",")
  };

  const { data } = await axios.get(url, { params });

  const rows = (data?.data || []).map(r => {
    const purchases = pickActions(r.actions, "offsite_conversion.purchase");
    const purchaseValue = pickActions(r.action_values, "offsite_conversion.purchase");
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
      purchases,
      purchase_value: purchaseValue,
      purchase_roas: Array.isArray(r.purchase_roas) ? r.purchase_roas : null
    };
  });

  return {
    since,
    until,
    level,
    count: rows.length,
    data: rows
  };
}

/* -------------------- aggregated report -------------------- */

function rowName(row, level) {
  if (level === "campaign") return row.campaign_name || row.campaign_id || "Unknown Campaign";
  if (level === "adset")    return row.adset_name || row.adset_id || "Unknown Ad Set";
  if (level === "ad")       return row.ad_name || row.ad_id || "Unknown Ad";
  return row.account_name || row.account_id || "Account";
}

function rowId(row, level) {
  if (level === "campaign") return row.campaign_id || "unknown_campaign";
  if (level === "adset")    return row.adset_id || "unknown_adset";
  if (level === "ad")       return row.ad_id || "unknown_ad";
  return row.account_id || "account";
}

function deriveKpis({ spend, impressions, clicks, purchases, purchase_value }) {
  const ctr = pct(clicks, impressions);
  const cpc = safeDiv(spend, clicks);
  const cpm = safeDiv(spend * 1000, impressions);
  const cpa = safeDiv(spend, purchases);
  const roas = safeDiv(purchase_value, spend);
  return { ctr, cpc, cpm, cpa, roas };
}

export async function getMonthlyReport({ accountId, ym, level = "campaign", top = 1000 }) {
  if (!accountId) throw new Error("accountId is required");

  // fetch account meta (currency) for labeling
  let acct = null;
  try {
    acct = await getAccountInfo(accountId);
  } catch (_) {
    acct = null; // continue even if this fails
  }

  // fetch raw rows for the chosen level
  const raw = await getMonthlyInsights({ accountId, ym, level });

  // aggregate summary
  const totals = raw.data.reduce(
    (acc, r) => {
      acc.spend += n(r.spend);
      acc.impressions += n(r.impressions);
      acc.clicks += n(r.clicks);
      acc.reach += n(r.reach);
      acc.purchases += n(r.purchases);
      acc.purchase_value += n(r.purchase_value);
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, reach: 0, purchases: 0, purchase_value: 0 }
  );

  const summary = {
    spend: totals.spend,
    impressions: totals.impressions,
    clicks: totals.clicks,
    reach: totals.reach,
    purchases: totals.purchases,
    purchase_value: totals.purchase_value,
    ...deriveKpis(totals)
  };

  // build breakdown at requested level
  const groupMap = new Map();
  for (const r of raw.data) {
    const id = rowId(r, level);
    const name = rowName(r, level);
    const g = groupMap.get(id) || {
      id,
      name,
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
      purchases: 0,
      purchase_value: 0
    };
    g.spend += n(r.spend);
    g.impressions += n(r.impressions);
    g.clicks += n(r.clicks);
    g.reach += n(r.reach);
    g.purchases += n(r.purchases);
    g.purchase_value += n(r.purchase_value);
    groupMap.set(id, g);
  }

  let breakdown = Array.from(groupMap.values())
    .map(g => ({ ...g, ...deriveKpis(g) }))
    .sort((a, b) => b.spend - a.spend);

  if (Number.isFinite(top) && top > 0) {
    breakdown = breakdown.slice(0, top);
  }

  return {
    account: {
      id: acct?.account_id || accountId,
      name: acct?.name || null,
      currency: acct?.currency || null
    },
    since: raw.since,
    until: raw.until,
    level,
    summary,
    breakdown
  };
}
