const API_BASE = ""; // same-origin

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
  if (!r.ok) throw r;
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

    // show ALL accounts and sort by name
    const allowed = all.slice().sort((a, b) => {
      const an = (a.name || "").toLowerCase();
      const bn = (b.name || "").toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return 0;
    });

    sel.innerHTML = '<option value="">Select…</option>';
    allowed.forEach(acc => {
      const id = acc.account_id || acc.id;
      const name = acc.name || ("Account " + id);
      const ccy = acc.currency || "";
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${name} (${id}) ${ccy ? "• " + ccy : ""}`;
      sel.appendChild(opt);
    });

    if (!allowed.length) {
      sel.innerHTML = '<option value="">No accounts found</option>';
    }
  } catch (e) {
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

async function getReport(accountId, month, level, range){
  const path = range === "last7" ? "/reports/weekly" : "/reports/monthly";
  const u = new URL((API_BASE || "") + path, window.location.origin);
  u.searchParams.set("account_id", accountId);
  if (range === "month" && month) u.searchParams.set("month", month);
  if (level) u.searchParams.set("level", level);
  const r = await fetch(u.toString());
  if (!r.ok) throw r;
  return r.json();
}


// ---- AI Summary helpers ----
async function makeAISummary(json) {
  const resp = await fetch(API_BASE + "/summary/monthly", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json)
  });
  if (!resp.ok) throw resp;
  const j = await resp.json();
  return j.html; // backend returns HTML now
}

// very light sanitization: allow only a safe subset of tags/attrs
function safeHTML(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const allowedTags = new Set(["H1","H2","H3","H4","H5","H6","P","UL","OL","LI","STRONG","EM","B","I","BR","SPAN","SMALL","DIV"]);
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT, null);
  let node;
  while ((node = walker.nextNode())) {
    if (!allowedTags.has(node.tagName)) {
      const replacement = document.createElement("div");
      replacement.innerHTML = node.innerHTML;
      node.replaceWith(...replacement.childNodes);
      continue;
    }
    // strip all attributes
    [...node.attributes].forEach(attr => node.removeAttribute(attr.name));
  }
  return template.innerHTML;
}

function renderReport(json, view){
  const result = $("result");
  result.innerHTML = "";

  const summaryWrap = document.createElement("div");
  renderSummary(summaryWrap, json.account, json.since, json.until, json.summary);
  result.appendChild(summaryWrap.firstElementChild);

  renderBreakdown(result, json.breakdown || [], json.account?.currency, json.level, view);

  // CSV button
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

  // AI Summary card – renders HTML nicely
  const aiCard = document.createElement("div");
  aiCard.className = "card";
  aiCard.innerHTML = `
    <div style="font-weight:700;margin-bottom:10px">AI-Powered Monthly Summary</div>
    <button id="makeAISummaryBtn">Make Month Summary</button>
    <div id="aiSummaryOut" style="margin-top:12px; line-height:1.5"></div>
  `;
  result.appendChild(aiCard);

  const btn = aiCard.querySelector("#makeAISummaryBtn");
  const out = aiCard.querySelector("#aiSummaryOut");

  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "Thinking…";
    try {
      const html = await makeAISummary(json);
      out.innerHTML = safeHTML(html);
    } catch(e) {
      if (e instanceof Response) await showAlertFromResponse(e);
      else alert("AI summary failed");
      console.error(e);
    } finally {
      btn.disabled = false;
      btn.textContent = "Make Month Summary";
    }
  };
}

/* -------- events / init -------- */
$("month").value = monthDefault();

$("loadBtn").onclick = async () => {
  const accountId = $("account").value.trim();
  if (!accountId) { alert("Select an ad account"); return; }

  const range = $("range").value;          // "month" or "last7"
  const month = $("month").value.trim();
  const level = $("level").value;

  if (range === "month" && !month) {
    alert("Select a month");
    return;
  }

  $("loadBtn").disabled = true;
  $("loadBtn").textContent = "Loading…";
  try{
    const view = await fetchView("Revenue Results");
    const json = await getReport(accountId, month, level, range);
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
