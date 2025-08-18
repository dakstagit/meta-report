// same-origin base
const API_BASE = ""; // empty means same origin

const $ = id => document.getElementById(id);
const fmtInt = v => (v == null ? "-" : Number(v).toLocaleString());
const fmtMoney = (v, ccy) => (v == null ? "-" : new Intl.NumberFormat(undefined,{style:"currency",currency:ccy||"USD",maximumFractionDigits:2}).format(Number(v)));
const fmtPct = v => (v == null ? "-" : Number(v).toFixed(2) + "%");

const toCsv = rows => {
  if (!rows || !rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = x => {
    if (x == null) return "";
    const s = String(x);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
};

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
    const r = await fetch(API_BASE + "/debug/ad-accounts");
    const j = await r.json();
    const data = j?.data || [];
    sel.innerHTML = '<option value="">Select…</option>';
    data.forEach(acc=>{
      const id = acc.account_id || acc.id;
      const name = acc.name || ("Account " + id);
      const ccy = acc.currency || "";
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${name} (${id}) ${ccy ? "• "+ccy : ""}`;
      sel.appendChild(opt);
    });
  }catch(e){
    console.error(e);
    sel.innerHTML = '<option value="">Failed to load</option>';
  }
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
        <div class="kpi"><div class="k">CPC</div><div class="v">${s.cpc==null?"-":fmtMoney(s.cpc, account?.currency)}</div></div>
        <div class="kpi"><div class="k">CPM</div><div class="v">${s.cpm==null?"-":fmtMoney(s.cpm, account?.currency)}</div></div>
        <div class="kpi"><div class="k">Purchases</div><div class="v">${fmtInt(s.purchases)}</div></div>
        <div class="kpi"><div class="k">Revenue</div><div class="v">${fmtMoney(s.purchase_value, account?.currency)}</div></div>
        <div class="kpi"><div class="k">CPA</div><div class="v">${s.cpa==null?"-":fmtMoney(s.cpa, account?.currency)}</div></div>
        <div class="kpi"><div class="k">ROAS</div><div class="v">${s.roas==null?"-":Number(s.roas).toFixed(2)}x</div></div>
      </div>
    </div>
  `;
}

function renderBreakdown(container, rows, currency, level){
  const cols = [
    { key:"name", label: level[0].toUpperCase()+level.slice(1) },
    { key:"spend", label:"Spend", fmt:v=>fmtMoney(v,currency) },
    { key:"impressions", label:"Impr.", fmt:fmtInt },
    { key:"reach", label:"Reach", fmt:fmtInt },
    { key:"clicks", label:"Clicks", fmt:fmtInt },
    { key:"ctr", label:"CTR", fmt:fmtPct },
    { key:"cpc", label:"CPC", fmt:v=>v==null?"-":fmtMoney(v,currency) },
    { key:"cpm", label:"CPM", fmt:v=>v==null?"-":fmtMoney(v,currency) },
    { key:"purchases", label:"Purch.", fmt:fmtInt },
    { key:"purchase_value", label:"Revenue", fmt:v=>fmtMoney(v,currency) },
    { key:"cpa", label:"CPA", fmt:v=>v==null?"-":fmtMoney(v,currency) },
    { key:"roas", label:"ROAS", fmt:v=>v==null?"-":Number(v).toFixed(2)+"x" }
  ];
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-weight:700">Breakdown by ${level}</div>
      <div class="actions">
        <button class="secondary" id="sortSpend">Sort by Spend</button>
        <button class="secondary" id="sortROAS">Sort by ROAS</button>
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
    rows.sort((a,b)=>(b.roas||0)-(a.roas||0));
    tbody.innerHTML = renderRows(rows, cols);
  };
}

function renderRows(rows, cols){
  return rows.map(r=>`
    <tr>${cols.map(c=>`<td>${c.fmt?c.fmt(r[c.key]):(r[c.key]??"-")}</td>`).join("")}</tr>
  `).join("");
}

function downloadCsv(filename, rows, summary){
  const summaryRows = Object.entries(summary).map(([k,v])=>({metric:k,value:v}));
  const block1 = "Summary\n" + toCsv(summaryRows);
  const block2 = "\n\nBreakdown\n" + toCsv(rows);
  const blob = new Blob([block1+block2], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function getReport(accountId, month, level){
  const u = new URL((API_BASE || "") + "/reports/monthly", window.location.origin);
  u.searchParams.set("account_id", accountId);
  if (month) u.searchParams.set("month", month);
  if (level) u.searchParams.set("level", level);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

function renderReport(json){
  const result = $("result");
  result.innerHTML = "";

  const summaryWrap = document.createElement("div");
  renderSummary(summaryWrap, json.account, json.since, json.until, json.summary);
  result.appendChild(summaryWrap.firstElementChild);

  renderBreakdown(result, json.breakdown || [], json.account?.currency, json.level);

  $("downloadCsvBtn").disabled = !json.breakdown?.length;
  $("downloadCsvBtn").onclick = () => {
    const fname = `meta_report_${json.account?.id || "account"}_${json.since}_${json.until}_${json.level}.csv`;
    downloadCsv(fname, json.breakdown || [], json.summary || {});
  };
}

/* -------- events / init -------- */
$("month").value = monthDefault();

$("loadBtn").onclick = async () => {
  const accountId = $("account").value.trim();
  if (!accountId) { alert("Select an ad account"); return; }
  const month = $("month").value.trim(); // optional -> last month if empty
  const level = $("level").value;

  $("loadBtn").disabled = true;
  $("loadBtn").textContent = "Loading…";
  try{
    const json = await getReport(accountId, month, level);
    renderReport(json);
  }catch(e){
    alert("Failed: " + (e?.message || e));
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
