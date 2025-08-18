import axios from "axios";
import dayjs from "dayjs";

const BASE = "https://graph.facebook.com/v19.0";
const TOKEN = process.env.META_TOKEN;

if (!TOKEN) {
  console.warn("META_TOKEN is not set. On Render, set it in Environment Variables.");
}

// List ad accounts linked to the token user
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

// Build first/last day from YYYY-MM, default to last month if ym not provided
function monthRange(ym) {
  const target = ym ? dayjs(ym + "-01") : dayjs().subtract(1, "month").startOf("month");
  const since = target.startOf("month").format("YYYY-MM-DD");
  const until = target.endOf("month").format("YYYY-MM-DD");
  return { since, until };
}

// Extract a specific action metric from actions array
function pickActions(actions = [], type) {
  const hit = actions.find(a => a.action_type === type);
  return hit ? Number(hit.value || 0) : 0;
}

/**
 * Fetch monthly insights for an ad account
 * @param {string} accountId - numeric id (no "act_" prefix)
 * @param {string} ym        - optional "YYYY-MM"; defaults to last month
 * @param {string} level     - "account" | "campaign" | "adset" | "ad"
 */
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
      spend: Number(r.spend || 0),
      impressions: Number(r.impressions || 0),
      clicks: Number(r.clicks || 0),
      cpc: r.cpc ? Number(r.cpc) : null,
      cpm: r.cpm ? Number(r.cpm) : null,
      ctr: r.ctr ? Number(r.ctr) : null,
      reach: r.reach ? Number(r.reach) : null,
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
