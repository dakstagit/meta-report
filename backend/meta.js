import fetch from "node-fetch";

/**
 * Fetches insights from Meta Ads API.
 * @param {string} accessToken - The Meta API token (from env var)
 * @param {string} adAccountId - The ad account ID (e.g. 123456789)
 * @returns {Promise<Object>} - The JSON response from Meta
 */
export async function fetchMetaReportData(accessToken, adAccountId) {
  const url = `https://graph.facebook.com/v19.0/act_${adAccountId}/insights?fields=campaign_name,spend,impressions,clicks,actions,cost_per_action_type&time_range[since]=30days_ago&time_range[until]=today`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Meta API Error: ${res.status} - ${errText}`);
  }

  const data = await res.json();
  return data;
}
