import axios from "axios";

const BASE = "https://graph.facebook.com/v19.0";
const TOKEN = process.env.META_TOKEN;

if (!TOKEN) {
  console.warn("META_TOKEN not set. Add it to /backend/.env for local dev.");
}

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
