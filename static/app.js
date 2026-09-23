const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------------------------------------------------------------------------
// Jalali (Shamsi) calendar support.
//
// We don't hand-roll leap-year math: we lean entirely on the browser's own
// ICU Persian-calendar implementation (Intl.DateTimeFormat with
// 'en-US-u-ca-persian'), which is exactly what fmtTs() already uses for
// display elsewhere in the panel. To convert a chosen Jalali date back to
// Gregorian (needed to build the actual date_from/date_to filter values the
// API expects), we start from a close arithmetic guess and iteratively
// correct it by re-checking that guess against the same ICU conversion,
// so the two directions can never disagree with what's shown on screen.
// ---------------------------------------------------------------------------

const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

function jalaliPartsInTehran(date) {
  const fmt = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: "Asia/Tehran", year: "numeric", month: "numeric", day: "numeric",
  });
  const parts = fmt.formatToParts(date);
  const get = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
  return { jy: get("year"), jm: get("month"), jd: get("day") };
}

function jalaliDayOfYear(jm, jd) {
  const monthLen = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 30];
  let doy = jd;
  for (let i = 0; i < jm - 1; i++) doy += monthLen[i];
  return doy;
}

function jalaliYearLength(jy) {
  const start = gregorianYMDFromJalali(jy, 1, 1);
  const nextStart = gregorianYMDFromJalali(jy + 1, 1, 1);
  const d1 = new Date(`${start}T12:00:00Z`);
  const d2 = new Date(`${nextStart}T12:00:00Z`);
  return Math.round((d2 - d1) / 86400000);
}

function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return jalaliYearLength(jy) - 336; // 336 = 6*31 + 5*30 (Farvardin..Bahman)
}

// Find the Gregorian Y-M-D (Tehran wall-clock) for a given Jalali date.
function gregorianYMDFromJalali(jy, jm, jd) {
  const approxGregorianYear = jy + 621;
  const guess = new Date(Date.UTC(approxGregorianYear, 2, 21, 12, 0, 0)); // ~Farvardin 1, noon UTC
  guess.setUTCDate(guess.getUTCDate() + jalaliDayOfYear(jm, jd) - 1);

  for (let iter = 0; iter < 6; iter++) {
    const p = jalaliPartsInTehran(guess);
    const diffDays = (p.jy - jy) * 365 + (jalaliDayOfYear(p.jm, p.jd) - jalaliDayOfYear(jm, jd));
    if (diffDays === 0) break;
    guess.setUTCDate(guess.getUTCDate() - diffDays);
  }
  const isoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
  return isoFmt.format(guess); // "YYYY-MM-DD"
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function mountJalaliPicker(id) {
  const host = document.getElementById(id);
  if (!host) return;
  const nowJ = jalaliPartsInTehran(new Date());
  const opt = (v, label) => `<option value="${v}">${label}</option>`;
  const blank = '<option value="">--</option>';

  host.innerHTML = `
    <select class="jp jp-y">${blank}${range(nowJ.jy - 3, nowJ.jy + 1).map((y) => opt(y, y)).join("")}</select>
    <select class="jp jp-m">${blank}${JALALI_MONTHS.map((n, i) => opt(i + 1, n)).join("")}</select>
    <select class="jp jp-d">${blank}</select>
    <select class="jp jp-h">${blank}${range(0, 23).map((h) => opt(h, String(h).padStart(2, "0"))).join("")}</select>
    <select class="jp jp-mi">${blank}${range(0, 59).map((m) => opt(m, String(m).padStart(2, "0"))).join("")}</select>
    <button type="button" class="jp-clear" title="پاک کردن">×</button>
  `;
  const y = host.querySelector(".jp-y");
  const m = host.querySelector(".jp-m");
  const d = host.querySelector(".jp-d");
  const h = host.querySelector(".jp-h");
  const mi = host.querySelector(".jp-mi");

  function fillDays() {
    const cur = d.value;
    const yy = parseInt(y.value, 10);
    const mm = parseInt(m.value, 10);
    const maxDay = (yy && mm) ? jalaliMonthLength(yy, mm) : 31;
    d.innerHTML = blank + range(1, maxDay).map((dd) => opt(dd, dd)).join("");
    if (cur && parseInt(cur, 10) <= maxDay) d.value = cur;
  }
  fillDays();
  y.addEventListener("change", fillDays);
  m.addEventListener("change", fillDays);
  host.querySelector(".jp-clear").addEventListener("click", () => {
    y.value = ""; m.value = ""; d.value = ""; h.value = ""; mi.value = "";
    fillDays();
  });

  Object.defineProperty(host, "value", {
    configurable: true,
    get() {
      if (!y.value || !m.value || !d.value) return "";
      const gymd = gregorianYMDFromJalali(parseInt(y.value, 10), parseInt(m.value, 10), parseInt(d.value, 10));
      const hh = (h.value || "0").padStart(2, "0");
      const mm2 = (mi.value || "0").padStart(2, "0");
      return `${gymd}T${hh}:${mm2}`;
    },
    set(v) {
      if (!v) { y.value = ""; m.value = ""; d.value = ""; h.value = ""; mi.value = ""; fillDays(); return; }
      const [datePart, timePart] = v.split("T");
      const [gy, gm, gd] = datePart.split("-").map(Number);
      const j = jalaliPartsInTehran(new Date(Date.UTC(gy, gm - 1, gd, 12, 0, 0)));
      y.value = j.jy; m.value = j.jm; fillDays(); d.value = j.jd;
      if (timePart) {
        const [hh, mm2] = timePart.split(":");
        h.value = parseInt(hh, 10);
        mi.value = parseInt(mm2, 10);
      }
    },
  });
}

function mountAllJalaliPickers() {
  ["clientsFrom", "clientsTo", "domainsFrom", "domainsTo", "searchFrom", "searchTo", "recentFrom", "recentTo"]
    .forEach(mountJalaliPicker);
}


const EXPORT_FORMATS = [
  { fmt: "pdf", label: "PDF" },
  { fmt: "xlsx", label: "Excel" },
  { fmt: "csv", label: "CSV" },
  { fmt: "txt", label: "TXT" },
];

const state = {
  view: "overview",
  selectedClient: null,
  clients: { q: "", date_from: "", date_to: "", page: 1, page_size: 50, total: 0 },
  domains: { search: "", date_from: "", date_to: "", page: 1, page_size: 50, total: 0 },
  search: { q: "", date_from: "", date_to: "", page: 1, page_size: 50, total: 0 },
  recent: { date_from: "", date_to: "", page: 1, page_size: 50, total: 0 },
};

function fmtTs(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleString("fa-IR-u-ca-persian", { hour12: false, timeZone: "Asia/Tehran" });
}

function rcodeBadge(name) {
  const ok = name === "NOERROR";
  return `<span class="badge ${ok ? "ok" : "bad"}">${name}</span>`;
}

function ipBadge(ipClass) {
  const labels = { user: "کاربر", server: "سرور", other: "-" };
  return `<span class="ipbadge ${ipClass}">${labels[ipClass] || ipClass}</span>`;
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error(`API error ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

// ---------------- export buttons ----------------
function buildExportLinks(dataset, extraParams) {
  return EXPORT_FORMATS.map(({ fmt, label }) => {
    const params = new URLSearchParams({ dataset, format: fmt, ...extraParams });
    return `<a class="export-btn" href="/api/export?${params.toString()}" target="_blank" rel="noopener">${label}</a>`;
  }).join("");
}

function renderExport(dataset, extra) {
  const el = document.querySelector(`.export-group[data-dataset="${dataset}"]`);
  if (!el) return;
  el.innerHTML = buildExportLinks(dataset, extra);
}

// ---------------- pagination ----------------
function renderPagination(containerId, s, onPageChange) {
  const el = $(`#${containerId}`);
  const totalPages = Math.max(1, Math.ceil(s.total / s.page_size));
  el.innerHTML = `
    <button ${s.page <= 1 ? "disabled" : ""} data-dir="prev">قبلی</button>
    <span>صفحه ${s.page} از ${totalPages} — کل رکورد: ${s.total}</span>
    <button ${s.page >= totalPages ? "disabled" : ""} data-dir="next">بعدی</button>
  `;
  el.querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", () => {
      s.page += btn.dataset.dir === "next" ? 1 : -1;
      onPageChange();
    })
  );
}

// ---------------- navigation ----------------
function setView(view) {
  state.view = view;
  $$(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  $$(".view").forEach((el) => el.classList.remove("active"));
  const targetId = view === "detail" ? "view-detail" : `view-${view}`;
  $(`#${targetId}`).classList.add("active");
  const titles = {
    overview: "نمای کلی", clients: "کاربران (IP)", detail: "جزئیات کاربر",
    contacts: "دفترچه مخاطبین", search: "جستجوی دامنه", recent: "لاگ کوئری‌ها",
  };
  $("#viewTitle").textContent = titles[view] || "";
  refreshView();
}

$$(".nav-item").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));

// ---------------- overview ----------------
async function loadOverview() {
  const s = await api("/api/stats");
  $("#statGrid").innerHTML = `
    ${statCard("کل کوئری‌ها", s.total_queries)}
    ${statCard("کاربران یکتا", s.unique_clients)}
    ${statCard("دامنه‌های یکتا", s.unique_domains)}
    ${statCard("۲۴ ساعت اخیر", s.last_24h)}
    ${statCard("بلاک‌شده/رفیوز", s.blocked_or_refused)}
  `;
  const maxD = Math.max(1, ...s.top_domains.map((d) => d.count));
  $("#topDomains").innerHTML = s.top_domains.map((d) => barRow(d.qname, d.count, maxD)).join("");
  const maxC = Math.max(1, ...s.top_clients.map((c) => c.count));
  $("#topClients").innerHTML = s.top_clients
    .map((c) => barRowClickable(c.display_name, c.count, maxC, c.client_ip))
    .join("");
  $$("[data-goto-client]").forEach((el) =>
    el.addEventListener("click", () => openClientDetail(el.dataset.gotoClient))
  );
}

function statCard(label, value) {
  return `<div class="stat-card"><div class="label">${label}</div><div class="value">${value ?? 0}</div></div>`;
}

function barRow(name, count, max) {
  const pct = Math.round((count / max) * 100);
  return `<div class="bar-row"><span class="name">${name}</span><span>${count}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
}

function barRowClickable(name, count, max, ip) {
  const pct = Math.round((count / max) * 100);
  return `<div class="bar-row" style="cursor:pointer" data-goto-client="${ip}">
    <span class="name">${name}</span><span>${count}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
}

// ---------------- clients page ----------------
async function loadClientsPage() {
  const s = state.clients;
  const params = new URLSearchParams({
    q: s.q, date_from: s.date_from, date_to: s.date_to, page: s.page, page_size: s.page_size,
  });
  const data = await api(`/api/clients?${params.toString()}`);
  s.total = data.total;
  $("#clientsTable tbody").innerHTML = data.rows
    .map(
      (c) => `<tr>
        <td>${c.display_name}${c.display_name !== c.client_ip ? ` <span class="ip-sub" data-mono>(${c.client_ip})</span>` : ""}</td>
        <td>${ipBadge(c.ip_class)}</td>
        <td>${c.query_count}</td>
        <td>${c.domain_count}</td>
        <td>${fmtTs(c.first_seen)}</td>
        <td>${fmtTs(c.last_seen)}</td>
        <td><button class="row-link" data-open="${c.client_ip}">مشاهده دامنه‌ها</button></td>
      </tr>`
    )
    .join("");
  $$("[data-open]").forEach((btn) => btn.addEventListener("click", () => openClientDetail(btn.dataset.open)));
  renderPagination("clientsPagination", s, loadClientsPage);
  renderExport("clients", { q: s.q, date_from: s.date_from, date_to: s.date_to });
}

$("#clientsFilterBtn").addEventListener("click", () => {
  state.clients.q = $("#clientsQ").value;
  state.clients.date_from = $("#clientsFrom").value;
  state.clients.date_to = $("#clientsTo").value;
  state.clients.page = 1;
  loadClientsPage();
});
$("#clientsQ").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#clientsFilterBtn").click(); });

// ---------------- client detail (domains) ----------------
function openClientDetail(ip) {
  state.selectedClient = ip;
  state.domains = { search: "", date_from: "", date_to: "", page: 1, page_size: 50, total: 0 };
  $("#domainFilter").value = "";
  $("#domainsFrom").value = "";
  $("#domainsTo").value = "";
  setView("detail");
}

$("#backToClients").addEventListener("click", () => setView("clients"));

async function loadClientDomains() {
  if (!state.selectedClient) return;
  const ip = state.selectedClient;
  const info = await api(`/api/clients/${encodeURIComponent(ip)}/info`);
  const label = info.display_name;
  const cls = info.ip_class;
  $("#selectedClientTitle").innerHTML = `دامنه‌های بازدید شده توسط ${label} ${ipBadge(cls)} <span class="ip-sub" data-mono>(${ip})</span>`;

  const s = state.domains;
  const params = new URLSearchParams({
    search: s.search, date_from: s.date_from, date_to: s.date_to, page: s.page, page_size: s.page_size,
  });
  const data = await api(`/api/clients/${encodeURIComponent(ip)}/domains?${params.toString()}`);
  s.total = data.total;
  $("#domainTable tbody").innerHTML = data.rows
    .map(
      (r) => `<tr>
        <td data-mono>${r.qname}</td>
        <td>${r.count}</td>
        <td>${rcodeBadge(r.rcode_name)}</td>
        <td>${r.qtypes.join(", ")}</td>
        <td>${fmtTs(r.first_seen)}</td>
        <td>${fmtTs(r.last_seen)}</td>
      </tr>`
    )
    .join("");
  renderPagination("domainsPagination", s, loadClientDomains);
  renderExport("domains", { ip, search: s.search, date_from: s.date_from, date_to: s.date_to });
}

$("#domainsFilterBtn").addEventListener("click", () => {
  state.domains.search = $("#domainFilter").value;
  state.domains.date_from = $("#domainsFrom").value;
  state.domains.date_to = $("#domainsTo").value;
  state.domains.page = 1;
  loadClientDomains();
});
$("#domainFilter").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#domainsFilterBtn").click(); });

function sourceBadge(source) {
  return source === "synced"
    ? '<span class="ipbadge server">خودکار (VPN)</span>'
    : '<span class="ipbadge other">دستی</span>';
}

// ---------------- contacts ----------------
async function loadContacts() {
  const status = await api("/api/vpn-sync/status");
  $("#vpnSyncStatus").textContent = status.enabled
    ? `همگام‌سازی خودکار با پنل ${status.panel_type} هر ${Math.round(status.interval_seconds / 60)} دقیقه فعاله.`
    : "همگام‌سازی خودکار با پنل VPN غیرفعاله — مخاطبین رو دستی اضافه کن.";

  const rows = await api("/api/contacts");
  $("#contactsTable tbody").innerHTML = rows
    .map(
      (c) => `<tr>
        <td>${c.name}</td>
        <td data-mono>${c.ip}</td>
        <td>${ipBadge(c.ip_class)}</td>
        <td>${sourceBadge(c.source)}</td>
        <td><button class="btn-sm" data-del="${c.ip}">حذف</button></td>
      </tr>`
    )
    .join("");
  $$("[data-del]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await api(`/api/contacts/${encodeURIComponent(btn.dataset.del)}`, { method: "DELETE" });
      loadContacts();
    })
  );
}

$("#contactForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ip = $("#contactIp").value.trim();
  const name = $("#contactName").value.trim();
  if (!ip || !name) return;
  await api("/api/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ip, name }),
  });
  $("#contactIp").value = "";
  $("#contactName").value = "";
  loadContacts();
});

// ---------------- domain search ----------------
async function loadDomainSearch() {
  const s = state.search;
  if (!s.q) { $("#searchTable tbody").innerHTML = ""; $("#searchPagination").innerHTML = ""; renderExport("search", {}); return; }
  const params = new URLSearchParams({
    q: s.q, date_from: s.date_from, date_to: s.date_to, page: s.page, page_size: s.page_size,
  });
  const data = await api(`/api/search?${params.toString()}`);
  s.total = data.total;
  $("#searchTable tbody").innerHTML = data.rows
    .map(
      (r) => `<tr>
        <td>${fmtTs(r.ts)}</td>
        <td>${r.display_name} ${ipBadge(r.ip_class)}</td>
        <td data-mono>${r.qname}</td>
        <td>${r.qtype_name}</td>
        <td>${rcodeBadge(r.rcode_name)}</td>
      </tr>`
    )
    .join("");
  renderPagination("searchPagination", s, loadDomainSearch);
  renderExport("search", { q: s.q, date_from: s.date_from, date_to: s.date_to });
}

$("#searchFilterBtn").addEventListener("click", () => {
  state.search.q = $("#searchBox").value;
  state.search.date_from = $("#searchFrom").value;
  state.search.date_to = $("#searchTo").value;
  state.search.page = 1;
  loadDomainSearch();
});
$("#searchBox").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#searchFilterBtn").click(); });

// ---------------- recent / full log ----------------
async function loadRecent() {
  const s = state.recent;
  const params = new URLSearchParams({
    date_from: s.date_from, date_to: s.date_to, page: s.page, page_size: s.page_size,
  });
  const data = await api(`/api/recent?${params.toString()}`);
  s.total = data.total;
  $("#recentTable tbody").innerHTML = data.rows
    .map(
      (r) => `<tr>
        <td>${fmtTs(r.ts)}</td>
        <td>${r.display_name} ${ipBadge(r.ip_class)}</td>
        <td data-mono>${r.qname}</td>
        <td>${r.qtype_name}</td>
        <td>${rcodeBadge(r.rcode_name)}</td>
        <td>${r.elapsed_ms ?? "-"} ms</td>
      </tr>`
    )
    .join("");
  renderPagination("recentPagination", s, loadRecent);
  renderExport("recent", { date_from: s.date_from, date_to: s.date_to });
}

$("#recentFilterBtn").addEventListener("click", () => {
  state.recent.date_from = $("#recentFrom").value;
  state.recent.date_to = $("#recentTo").value;
  state.recent.page = 1;
  loadRecent();
});
$("#recentRefreshBtn").addEventListener("click", () => loadRecent());

// ---------------- refresh dispatcher ----------------
async function refreshView() {
  try {
    if (state.view === "overview") await loadOverview();
    else if (state.view === "clients") await loadClientsPage();
    else if (state.view === "detail") await loadClientDomains();
    else if (state.view === "contacts") await loadContacts();
    else if (state.view === "search") await loadDomainSearch();
    else if (state.view === "recent") await loadRecent();
  } catch (e) {
    console.error(e);
  }
}

async function boot() {
  mountAllJalaliPickers();
  await refreshView();
  setInterval(() => {
    if (state.view === "overview") loadOverview();
  }, 10000);
}

boot();
