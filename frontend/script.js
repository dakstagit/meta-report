const API_BASE = ""; // same-origin

// --- ONLY THESE ACCOUNTS WILL SHOW IN THE DROPDOWN ---
const ALLOW_ACCOUNTS = [
  "120084692730136",   // Annie Apple
  "378944901066763",   // zoandcojewellery
  "1175953690938138",  // CSARA
  "679554724700799",   // Hidden Muse
  "1918819531789094",  // Melrose Haus
  "656509666932258"    // Celeste Collective UK
];
// -----------------------------------------------------

const $ = id => document.getElementById(id);
const fmtInt = v => (v == null ? "-" : Number(v).toLocaleString());
const fmtMoney = (v, ccy) => (v == null ? "-" : new Intl.NumberFormat(undefined,{style:"currency",currency:ccy||"USD",maximumFractionDigits:2}).format(Number(v)));
const fmtPct = v => (v == null ? "-" : Number(v).toFixed(2) + "%");
const fmtRoas = v => (v == null ? "-" : Number(v).toFixed(2) + "x");
const fmtDec2 = v => (v == null ? "-" : Number(v).toFixed(2));

function showAlertFromResponse(res) {
  return res.text().then(t => {
    try {
      const j = JSON.parse(t);
      const msg = j?.error?.error?.message || j?.error?.message || j?.message || t;
      alert("Failed: " + msg);
    } catch {
      alert("Failed: " + t);
    }
  });
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw r; // throw Response to let caller parse body
  return r.json();
}

function monthDefault() {
  const d = new Date();
  d.setMonth(d.getMonth()-1);
  return d.toISOString().slice(0,7);
}

function setOK(){ const el=$("healthStatus"); el.textContent="OK"; el.className="status ok"; }
function setERR(){ const el=$("healthStatus"); el.textContent="error"; el.className="status err"; }

async function checkHealth(){
  try{
    const r = await fetch(API_BASE + "/health");
    const j = await r.json();
    if (j?.ok) setOK(); else setERR();
  }catch{ setERR(); }
}

async function loadAdAccounts(){
  const sel = $("account");
  sel.innerHTML = '<option value="">Loading…</option>';
  try{
    const j = await fetchJSON(API_BASE + "/debug/ad-accounts");
    const all = j?.data || [];

    // filter by allowlist
    const allowed = all.filter(acc => ALLOW_ACCOUNTS.includes(String(acc.account_id)));

    // keep the allowlist order
    const order = Object.fromEntries(ALLOW_ACCOUNTS.map((id,i)=>[id,i]));
    allowed.sort((a,b) => (order[a.account_id] ?? 9999) - (order[b.account_id] ?? 9999));

    sel.innerHTML = '<option value="">Select…</option>';
    allowed.forEach(acc=>{
      const id = acc.account_id || acc.id;
      const name = acc.name || ("Account " + id);
      const ccy = acc.currency || "";
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${name} (${id}) ${ccy ? "• "+ccy : ""}`;
      sel.appendChild(opt);
    });

    if (!allowed.length) {
      sel.innerHTML = '<option value="">No allowed accounts found</option>';
    }
  }catch(e){
    if (e instanceof Response) await showAlertFromResponse(e);
    console.error(e);
    sel.innerHTML = '<option value="">Failed to load</option>';
  }
}

async function fetchView(name="Revenue Results"){
  const u = new URL((API_BASE||"") + "/config/view", window.location.origin);
  u.searchParams.set("name", name);
  return fetchJSON(u.toString());
}

function resolveFormatter(fmt, currency){
  if (fmt === "money") return v => v==null?"-":fmtMoney(v, currency);
  if (fmt === "int")   return v => fmtInt(v);
  if (fmt === "pct")   return v => fmtPct(v);
  if (fmt === "roas")  return v => fmtRoas(v);
  if (fmt === "dec2")  return v => fmtDec2(v);
  return v => v ?? "-";
}

function renderSummary(container, account, since, until, s){
  container.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:700">${account?.name || "Account"} (${account?.id || ""})</div>
          <div class="hint">${since} → ${until} • Currency: ${account?.currency || "-"}</div>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="k">Spend</div><div class="v">${fmtMoney(s.spend, account?.currency)}</div></div>
        <div class="kpi"><div class="k">Impressions</div><div class="v">${fmtInt(s.impressions)}</div></div>
        <div class="kpi"><div class="k">Clicks</div><div class="v">${fmtInt(s.clicks)}</div></div>
        <div class="kpi"><div class="k">CTR</div><div class="v">${fmtPct(s.ctr)}</div></div>
        <div class="kpi"><div class="k">Purchases</div><div class="v">${fmtInt(s.purchases)}</div></div>
        <div class="kpi"><div class="k">Revenue</div><div class="v">${fmtMoney(s.purchase_value, account?.currency)}</div></div>
        <div class="kpi"><div class="k">CPA</div><div class="v">${s.cpa==null?"-":fmtMoney(s.cpa, account?.currency)}</div></div>
        <div class="kpi"><div class="k">ROAS</div><div class="v">${s.roas==null?"-":fmtRoas(s.roas)}</div></div>
      </div>
    </div>
  `;
}

function renderBreakdown(container, rows, currency, level, view){
  const cols = (view?.columns || []).map(c => {
    const copy = { ...c };
    if (copy.key === "name") {
      const auto = level[0].toUpperCase()+level.slice(1);
      if (!copy.label || copy.label.toLowerCase() === "campaign") copy.label = auto;
    }
    copy.fmtFn = resolveFormatter(copy.fmt, currency);
    return copy;
  });

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-weight:700">Breakdown by ${level}</div>
      <div class="actions">
        <button class="secondary" id="sortSpend">Sort by Spend</button>
        <button class="secondary" id="sortROAS">Sort by Purchase ROAS</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>${cols.map(c=>`<th>${c.label}</th>`).join("")}</tr></thead>
        <tbody id="tbody">${renderRows(rows, cols)}</tbody>
      </table>
    </div>`;
  container.appendChild(card);

  const tbody = card.querySelector("#tbody");
  card.querySelector("#sortSpend").onclick = () => {
    rows.sort((a,b)=>(b.spend||0)-(a.spend||0));
    tbody.innerHTML = renderRows(rows, cols);
  };
  card.querySelector("#sortROAS").onclick = () => {
    rows.sort((a,b)=>(b.purchase_roas_api||b.roas||0)-(a.purchase_roas_api||a.roas||0));
    tbody.innerHTML = renderRows(rows, cols);
  };
}

function renderRows(rows, cols){
  return rows.map(r=>`
    <tr>${cols.map(c=>`<td>${c.fmtFn ? c.fmtFn(r[c.key]) : (r[c.key] ?? "-")}</td>`).join("")}</tr>
  `).join("");
}

async function getReport(accountId, month, level){
  const u = new URL((API_BASE || "") + "/reports/monthly", window.location.origin);
  u.searchParams.set("account_id", accountId);
  if (month) u.searchParams.set("month", month);
  if (level) u.searchParams.set("level", level);
  const r = await fetch(u.toString());
  if (!r.ok) throw r; // throw Response so we can read the server error body
  return r.json();
}

function renderReport(json, view){
  const result = $("result");
  result.innerHTML = "";

  const summaryWrap = document.createElement("div");
  renderSummary(summaryWrap, json.account, json.since, json.until, json.summary);
  result.appendChild(summaryWrap.firstElementChild);

  renderBreakdown(result, json.breakdown || [], json.account?.currency, json.level, view);

  $("downloadCsvBtn").disabled = !json.breakdown?.length;
  $("downloadCsvBtn").onclick = () => {
    const headers = view.columns.map(c => c.key);
    const rows = (json.breakdown || []).map(r => {
      const o = {};
      headers.forEach(h => { o[h] = r[h]; });
      return o;
    });
    const summaryRows = Object.entries(json.summary || {}).map(([k,v])=>({metric:k,value:v}));
    const toCsv = (rowsArr) => {
      if (!rowsArr.length) return "";
      const hs = Object.keys(rowsArr[0]);
      const esc = x => {
        if (x == null) return "";
        const s = String(x);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
      };
      return [hs.join(","), ...rowsArr.map(r => hs.map(h => esc(r[h])).join(","))].join("\n");
    };
    const blob = new Blob([
      "Summary\n" + toCsv(summaryRows) + "\n\nBreakdown\n" + toCsv(rows)
    ], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `meta_report_${json.account?.id || "account"}_${json.since}_${json.until}_${json.level}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
}

/* -------- events / init -------- */
$("month").value = monthDefault();

$("loadBtn").onclick = async () => {
  const accountId = $("account").value.trim();
  if (!accountId) { alert("Select an ad account"); return; }
  const month = $("month").value.trim();
  const level = $("level").value;

  $("loadBtn").disabled = true;
  $("loadBtn").textContent = "Loading…";
  try{
    const view = await fetchView("Revenue Results");
    const json = await getReport(accountId, month, level);
    renderReport(json, view);
  }catch(e){
    if (e instanceof Response) await showAlertFromResponse(e);
    else alert("Failed: " + (e?.message || e));
    console.error(e);
  }finally{
    $("loadBtn").disabled = false;
    $("loadBtn").textContent = "Get Report";
  }
};

(async function init(){
  await checkHealth();
  await loadAdAccounts();
})();
