const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------------------------------------------------------------------------
// Jalali (Shamsi) calendar support — unchanged from before, still leans on
// the browser's own ICU Persian-calendar implementation.
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
  return jalaliYearLength(jy) - 336;
}

function gregorianYMDFromJalali(jy, jm, jd) {
  const approxGregorianYear = jy + 621;
  const guess = new Date(Date.UTC(approxGregorianYear, 2, 21, 12, 0, 0));
  guess.setUTCDate(guess.getUTCDate() + jalaliDayOfYear(jm, jd) - 1);
  for (let iter = 0; iter < 6; iter++) {
    const p = jalaliPartsInTehran(guess);
    const diffDays = (p.jy - jy) * 365 + (jalaliDayOfYear(p.jm, p.jd) - jalaliDayOfYear(jm, jd));
    if (diffDays === 0) break;
    guess.setUTCDate(guess.getUTCDate() - diffDays);
  }
  const isoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
  return isoFmt.format(guess);
}

function range(a, b) { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; }

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXPORT_FORMATS = [
  { fmt: "pdf", label: "PDF", icon: "file" },
  { fmt: "xlsx", label: "Excel", icon: "table" },
  { fmt: "csv", label: "CSV", icon: "file-text" },
  { fmt: "txt", label: "TXT", icon: "file-text" },
];

const state = {
  view: "overview",
  selectedClient: null,
  clients: { q: "", date_from: "", date_to: "", page: 1, page_size: 50, total: 0 },
  domains: { search: "", date_from: "", date_to: "", page: 1, page_size: 50, total: 0 },
  search: { q: "", date_from: "", date_to: "", page: 1, page_size: 50, total: 0 },
  recent: { date_from: "", date_to: "", page: 1, page_size: 50, total: 0 },
};

function toEnDigits(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
            .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function fmtNum(n) {
  if (n === null || n === undefined) return "0";
  return Number(n).toLocaleString("en-US");
}

function fmtTs(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return toEnDigits(d.toLocaleString("fa-IR-u-ca-persian", { hour12: false, timeZone: "Asia/Tehran" }));
}

function rcodeBadge(name) {
  const ok = name === "NOERROR";
  return `<span class="badge ${ok ? "ok" : "bad"}"><i data-lucide="${ok ? "check-circle-2" : "x-circle"}"></i>${name}</span>`;
}

function ipBadge(ipClass) {
  const labels = { user: "کاربر", server: "سرور", other: "-" };
  const icons = { user: "user", server: "server", other: "circle-help" };
  return `<span class="ipbadge ${ipClass}"><i data-lucide="${icons[ipClass] || "circle-help"}"></i>${labels[ipClass] || ipClass}</span>`;
}

function whoIcon(ipClass) {
  const icon = ipClass === "server" ? "server" : "user";
  const cls = ipClass === "server" ? "srv" : "";
  return `<span class="ico ${cls}"><i data-lucide="${icon}"></i></span>`;
}

function icons() { if (window.lucide) lucide.createIcons(); }

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 401) { window.location.href = "/login"; throw new Error("unauthorized"); }
  if (!res.ok) throw new Error(`API error ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

// ---------------- export buttons ----------------
function buildExportLinks(dataset, extraParams) {
  return EXPORT_FORMATS.map(({ fmt, label, icon }) => {
    const params = new URLSearchParams({ dataset, format: fmt, ...extraParams });
    return `<a class="export-btn" href="/api/export?${params.toString()}" target="_blank" rel="noopener"><i data-lucide="${icon}"></i>${label}</a>`;
  }).join("");
}

function renderExport(dataset, extra) {
  const el = document.querySelector(`.export-group[data-dataset="${dataset}"]`);
  if (!el) return;
  el.innerHTML = buildExportLinks(dataset, extra);
  icons();
}

// ---------------- pagination ----------------
function renderPagination(containerId, s, onPageChange) {
  const el = $(`#${containerId}`);
  const totalPages = Math.max(1, Math.ceil(s.total / s.page_size));
  el.innerHTML = `
    <button ${s.page <= 1 ? "disabled" : ""} data-dir="prev">قبلی</button>
    <span>صفحه ${fmtNum(s.page)} از ${fmtNum(totalPages)} — کل رکورد: ${fmtNum(s.total)}</span>
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
  $("#sidebar").classList.remove("mobile-open");
  refreshView();
}
window.setView = setView;

$$(".nav-item").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));

// ---------------- sidebar toggle ----------------
$("#toggleSidebar").addEventListener("click", () => {
  if (window.innerWidth <= 900) {
    $("#sidebar").classList.toggle("mobile-open");
  } else {
    $("#app").classList.toggle("collapsed");
  }
});

// ---------------- overview ----------------
const STAT_ICONS = [
  { key: "total_queries", label: "کل کوئری‌ها", icon: "bar-chart-2" },
  { key: "unique_clients", label: "کاربران یکتا", icon: "users" },
  { key: "unique_domains", label: "دامنه‌های یکتا", icon: "globe" },
  { key: "last_24h", label: "۲۴ ساعت اخیر", icon: "clock" },
  { key: "blocked_or_refused", label: "بلاک‌شده/رفیوز", icon: "shield-alert", warn: true },
];

async function loadOverview() {
  const s = await api("/api/stats");

  $("#statGrid").innerHTML = STAT_ICONS.map((c) => `
    <div class="stat-card">
      <div class="icon-chip ${c.warn ? "warn" : ""}"><i data-lucide="${c.icon}"></i></div>
      <div class="label">${c.label}</div>
      <div class="value ${c.warn ? "warn" : ""}">${fmtNum(s[c.key])}</div>
    </div>
  `).join("");

  $("#resultDistribution").innerHTML = `
    <div class="result-item">
      <div class="result-icon"><i data-lucide="check-circle-2"></i></div>
      <div class="result-info">
        <div class="result-label"><span>موفق (NOERROR)</span><span class="n">${fmtNum(s.success_count)} (${s.success_percent}%)</span></div>
        <div class="result-bar"><div class="result-bar-fill" style="width:${s.success_percent}%"></div></div>
      </div>
    </div>
    <div class="result-item">
      <div class="result-icon error"><i data-lucide="x-circle"></i></div>
      <div class="result-info">
        <div class="result-label"><span>ناموفق (NXDOMAIN/REFUSED)</span><span class="n">${fmtNum(s.error_count)} (${s.error_percent}%)</span></div>
        <div class="result-bar"><div class="result-bar-fill error" style="width:${s.error_percent}%"></div></div>
      </div>
    </div>
  `;

  $("#quickStats").innerHTML = `
    <div class="quick-stat-item"><div class="quick-stat-label"><i data-lucide="timer"></i><span>میانگین زمان پاسخ</span></div><div class="quick-stat-value">${s.avg_elapsed_ms ?? "-"} ms</div></div>
    <div class="quick-stat-item"><div class="quick-stat-label"><i data-lucide="check-circle-2"></i><span>نرخ موفقیت</span></div><div class="quick-stat-value">${s.success_rate_percent}%</div></div>
    <div class="quick-stat-item"><div class="quick-stat-label"><i data-lucide="trending-up"></i><span>پرتکرارترین دامنه</span></div><div class="quick-stat-value">${s.top_domains?.[0]?.qname ?? "-"}</div></div>
    <div class="quick-stat-item"><div class="quick-stat-label"><i data-lucide="user"></i><span>فعال‌ترین کاربر</span></div><div class="quick-stat-value">${s.top_clients?.[0]?.display_name ?? "-"}</div></div>
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

  const recentData = await api("/api/recent?page_size=8");
  $("#recentTableOverview tbody").innerHTML = recentData.rows.map((r) => `
    <tr>
      <td data-mono>${fmtTs(r.ts)}</td>
      <td>${r.display_name}</td>
      <td data-mono>${r.qname}</td>
      <td>${rcodeBadge(r.rcode_name)}</td>
      <td data-mono>${r.elapsed_ms ?? "-"} ms</td>
    </tr>
  `).join("");

  const nowTehran = new Date().toLocaleString("en-US", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hour12: false });
  $("#lastUpdate").textContent = nowTehran;

  icons();
}

function barRow(name, count, max) {
  const pct = Math.round((count / max) * 100);
  return `<div class="bar-row"><span class="name">${name}</span><span class="count">${fmtNum(count)}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
}

function barRowClickable(name, count, max, ip) {
  const pct = Math.round((count / max) * 100);
  return `<div class="bar-row" style="cursor:pointer" data-goto-client="${ip}"><span class="name">${name}</span><span class="count">${fmtNum(count)}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
}

// ---------------- clients page ----------------
async function loadClientsPage() {
  const s = state.clients;
  const params = new URLSearchParams({ q: s.q, date_from: s.date_from, date_to: s.date_to, page: s.page, page_size: s.page_size });
  const data = await api(`/api/clients?${params.toString()}`);
  s.total = data.total;
  $("#clientsTable tbody").innerHTML = data.rows.map((c) => `
    <tr>
      <td><div class="who">${whoIcon(c.ip_class)}<div><div>${c.display_name}</div>${c.display_name !== c.client_ip ? `<div class="ip-sub" data-mono>${c.client_ip}</div>` : ""}</div></div></td>
      <td>${ipBadge(c.ip_class)}</td>
      <td data-mono>${fmtNum(c.query_count)}</td>
      <td data-mono>${fmtNum(c.domain_count)}</td>
      <td data-mono>${fmtTs(c.first_seen)}</td>
      <td data-mono>${fmtTs(c.last_seen)}</td>
      <td><button class="row-link" data-open="${c.client_ip}">مشاهده دامنه‌ها</button></td>
    </tr>
  `).join("");
  $$("[data-open]").forEach((btn) => btn.addEventListener("click", () => openClientDetail(btn.dataset.open)));
  renderPagination("clientsPagination", s, loadClientsPage);
  renderExport("clients", { q: s.q, date_from: s.date_from, date_to: s.date_to });
  icons();
}

$("#clientsFilterBtn").addEventListener("click", () => {
  state.clients.q = $("#clientsQ").value;
  state.clients.date_from = $("#clientsFrom").value;
  state.clients.date_to = $("#clientsTo").value;
  state.clients.page = 1;
  loadClientsPage();
});
$("#clientsQ").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#clientsFilterBtn").click(); });

// ---------------- client detail ----------------
function openClientDetail(ip) {
  state.selectedClient = ip;
  state.domains = { search: "", date_from: "", date_to: "", page: 1, page_size: 50, total: 0 };
  $("#domainFilter").value = "";
  $("#domainsFrom").value = "";
  $("#domainsTo").value = "";
  setView("detail");
}
window.openClientDetail = openClientDetail;

$("#backToClients").addEventListener("click", () => setView("clients"));

async function loadClientDomains() {
  if (!state.selectedClient) return;
  const ip = state.selectedClient;
  const info = await api(`/api/clients/${encodeURIComponent(ip)}/info`);
  $("#selectedClientTitle").innerHTML = `دامنه‌های بازدید شده توسط ${info.display_name} ${ipBadge(info.ip_class)} <span class="ip-sub" data-mono>(${ip})</span>`;

  const s = state.domains;
  const params = new URLSearchParams({ search: s.search, date_from: s.date_from, date_to: s.date_to, page: s.page, page_size: s.page_size });
  const data = await api(`/api/clients/${encodeURIComponent(ip)}/domains?${params.toString()}`);
  s.total = data.total;
  $("#domainTable tbody").innerHTML = data.rows.map((r) => `
    <tr>
      <td data-mono>${r.qname}</td>
      <td data-mono>${fmtNum(r.count)}</td>
      <td>${rcodeBadge(r.rcode_name)}</td>
      <td>${r.qtypes.join(", ")}</td>
      <td data-mono>${fmtTs(r.first_seen)}</td>
      <td data-mono>${fmtTs(r.last_seen)}</td>
    </tr>
  `).join("");
  renderPagination("domainsPagination", s, loadClientDomains);
  renderExport("domains", { ip, search: s.search, date_from: s.date_from, date_to: s.date_to });
  icons();
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
    ? '<span class="ipbadge"><i data-lucide="wifi"></i>خودکار (VPN)</span>'
    : '<span class="ipbadge other"><i data-lucide="pencil"></i>دستی</span>';
}

// ---------------- contacts ----------------
async function loadContacts() {
  const status = await api("/api/vpn-sync/status");
  $("#vpnSyncStatus").innerHTML = status.enabled
    ? `<i data-lucide="wifi" style="width:13px;height:13px;display:inline;vertical-align:-2px"></i> همگام‌سازی خودکار با پنل ${status.panel_type} هر ${Math.round(status.interval_seconds / 60)} دقیقه فعاله.`
    : `<i data-lucide="wifi-off" style="width:13px;height:13px;display:inline;vertical-align:-2px"></i> همگام‌سازی خودکار با پنل VPN غیرفعاله — مخاطبین رو دستی اضافه کن.`;

  const rows = await api("/api/contacts");
  $("#contactsTable tbody").innerHTML = rows.map((c) => `
    <tr>
      <td>${c.name}</td>
      <td data-mono>${c.ip}</td>
      <td>${ipBadge(c.ip_class)}</td>
      <td>${sourceBadge(c.source)}</td>
      <td><button class="btn-sm" data-del="${c.ip}">حذف</button></td>
    </tr>
  `).join("");
  $$("[data-del]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await api(`/api/contacts/${encodeURIComponent(btn.dataset.del)}`, { method: "DELETE" });
      loadContacts();
    })
  );
  icons();
}

$("#contactForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ip = $("#contactIp").value.trim();
  const name = $("#contactName").value.trim();
  if (!ip || !name) return;
  await api("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip, name }) });
  $("#contactIp").value = "";
  $("#contactName").value = "";
  loadContacts();
});

// ---------------- domain search ----------------
async function loadDomainSearch() {
  const s = state.search;
  if (!s.q) { $("#searchTable tbody").innerHTML = ""; $("#searchPagination").innerHTML = ""; renderExport("search", {}); return; }
  const params = new URLSearchParams({ q: s.q, date_from: s.date_from, date_to: s.date_to, page: s.page, page_size: s.page_size });
  const data = await api(`/api/search?${params.toString()}`);
  s.total = data.total;
  $("#searchTable tbody").innerHTML = data.rows.map((r) => `
    <tr>
      <td data-mono>${fmtTs(r.ts)}</td>
      <td>${r.display_name}</td>
      <td>${ipBadge(r.ip_class)}</td>
      <td data-mono>${r.qname}</td>
      <td>${r.qtype_name}</td>
      <td>${rcodeBadge(r.rcode_name)}</td>
    </tr>
  `).join("");
  renderPagination("searchPagination", s, loadDomainSearch);
  renderExport("search", { q: s.q, date_from: s.date_from, date_to: s.date_to });
  icons();
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
  const params = new URLSearchParams({ date_from: s.date_from, date_to: s.date_to, page: s.page, page_size: s.page_size });
  const data = await api(`/api/recent?${params.toString()}`);
  s.total = data.total;
  $("#recentTable tbody").innerHTML = data.rows.map((r) => `
    <tr>
      <td data-mono>${fmtTs(r.ts)}</td>
      <td>${r.display_name}</td>
      <td>${ipBadge(r.ip_class)}</td>
      <td data-mono>${r.qname}</td>
      <td>${r.qtype_name}</td>
      <td>${rcodeBadge(r.rcode_name)}</td>
      <td data-mono>${r.elapsed_ms ?? "-"} ms</td>
    </tr>
  `).join("");
  renderPagination("recentPagination", s, loadRecent);
  renderExport("recent", { date_from: s.date_from, date_to: s.date_to });
  icons();
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
  } catch (e) { console.error(e); }
}

$("#btnRefresh").addEventListener("click", () => refreshView());

// ---------------- boot ----------------
async function boot() {
  mountAllJalaliPickers();
  icons();
  await refreshView();
  setInterval(() => { if (state.view === "overview") loadOverview(); }, 15000);
}

boot();
