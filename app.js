/* app.js – dashboard filtry + admin bubliny + zachování otevření + status barvy + slot */
var API_BASE = window.API_BASE || (window.API_BASE = "https://api.jisavl22.fun");

const uiState = {
  statusFilter: null, // "running" | "stopped" | null
  poolFilter: null,   // "user1" | "user2" | "user3" | "mojevm" | null
  openPools: new Set(),
  history: []
};

function pushHistory() {
  uiState.history.push({
    statusFilter: uiState.statusFilter,
    poolFilter: uiState.poolFilter,
    openPools: new Set(uiState.openPools),
  });
  if (uiState.history.length > 30) uiState.history.shift();
}

function popHistory() {
  const prev = uiState.history.pop();
  if (!prev) return false;
  uiState.statusFilter = prev.statusFilter;
  uiState.poolFilter = prev.poolFilter;
  uiState.openPools = prev.openPools;
  return true;
}

function getRole() {
  return localStorage.getItem("role") || "user";
}

function authHeaders(extra = {}) {
  const token = localStorage.getItem("token");
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

function setStatus(msg, type = "info") {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("text-danger", "text-success", "text-muted");
  if (type === "error") el.classList.add("text-danger");
  else if (type === "success") el.classList.add("text-success");
  else el.classList.add("text-muted");
}

async function parseResponse(r) {
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return txt; }
}

async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (r.status === 401) { localStorage.clear(); window.location.href = "index.html"; return; }
  const d = await parseResponse(r);
  if (!r.ok) throw new Error(d?.error || d?.message || String(d));
  return d;
}

async function apiPost(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (r.status === 401) { localStorage.clear(); window.location.href = "index.html"; return; }
  const d = await parseResponse(r);
  if (!r.ok) throw new Error(d?.error || d?.message || String(d));
  return d;
}

function updateStats(vms) {
  const total = vms.length;
  const running = vms.filter(v => v.status === "running").length;
  const stopped = total - running;

  const a = document.getElementById("statTotal");
  const b = document.getElementById("statRunning");
  const c = document.getElementById("statStopped");

  if (a) a.textContent = String(total);
  if (b) b.textContent = String(running);
  if (c) c.textContent = String(stopped);
}

function shownId(vmid, role) {
  const id = Number(vmid);
  return (role === "admin") ? id : (id % 100);
}

function captureOpenBubbles() {
  uiState.openPools = new Set(
    [...document.querySelectorAll("details.vm-bubble[open]")].map(d => d.dataset.pool)
  );
}

function restoreOpenBubbles() {
  for (const d of document.querySelectorAll("details.vm-bubble")) {
    d.open = uiState.openPools.has(d.dataset.pool);
  }
}

function applyFilters(vms) {
  let out = vms;

  if (uiState.poolFilter) out = out.filter(v => (v.pool || "") === uiState.poolFilter);
  if (uiState.statusFilter === "running") out = out.filter(v => v.status === "running");
  if (uiState.statusFilter === "stopped") out = out.filter(v => v.status !== "running");

  return out;
}

function makeDot(status) {
  const dot = document.createElement("span");
  dot.className = "vm-dot";
  dot.dataset.state = status || "";
  return dot;
}

function makeVmRow(vm, role) {
  const row = document.createElement("div");
  row.className = "vm-row";

  const left = document.createElement("div");
  left.className = "vm-row-left";

  left.appendChild(makeDot(vm.status));

  const title = document.createElement("div");
  title.className = "vm-row-title";
  title.textContent = `VM ${shownId(vm.vmid, role)} | ${vm.name} | ${vm.status}`;
  left.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "vm-actions";

  const btnConsole = document.createElement("button");
  btnConsole.textContent = "Konzole";
  btnConsole.className = "btn btn-sm btn-outline-primary";
  btnConsole.onclick = () => window.open(vm.consoleUrl, "_blank");

  const btnStart = document.createElement("button");
  btnStart.textContent = "Start";
  btnStart.className = "btn btn-sm btn-success";
 btnStart.onclick = async () => {
  try {
    setStatus("Spouštím…", "success");
    await apiPost(`/api/vm/${vm.vmid}/start`, {});
    await new Promise(r => setTimeout(r, 800));
    await refreshVmList();
  } catch (e) {
    setStatus(String(e.message || e), "error");
  }
};


  const btnStop = document.createElement("button");
  btnStop.textContent = "Stop";
  btnStop.className = "btn btn-sm btn-warning";
 btnStop.onclick = async () => {
  try {
    setStatus("Vypínám…", "success");
    await apiPost(`/api/vm/${vm.vmid}/stop`, {});
    await new Promise(r => setTimeout(r, 800));
    await refreshVmList();
  } catch (e) {
    setStatus(String(e.message || e), "error");
  }
};


  actions.appendChild(btnConsole);
  actions.appendChild(btnStart);
  actions.appendChild(btnStop);

  if (role === "admin") {
    const btnDelete = document.createElement("button");
    btnDelete.textContent = "Smazat";
    btnDelete.className = "btn btn-sm btn-danger";
    btnDelete.onclick = async () => {
  try {
    if (vm.status === "running") {
      const ok = confirm(`VM ${vm.vmid} běží. Nejdřív ji vypnout a pak smazat?`);
      if (!ok) return;

      setStatus("Vypínám…", "success");
      await apiPost(`/api/vm/${vm.vmid}/stop`, {});
      // krátká pauza, ať se stav v Proxmoxu propíše
      await new Promise(r => setTimeout(r, 800));
    }

    if (!confirm(`Opravdu smazat VM ${vm.vmid}?`)) return;

    // okamžitě schovej z UI, ať je vidět akce
row.style.display = "none";
setStatus("Mažu…", "success");
    
    const r = await fetch(`${API_BASE}/api/vm/${vm.vmid}`, { method: "DELETE", headers: authHeaders() });
    if (r.status === 401) { localStorage.clear(); window.location.href = "index.html"; return; }
    const d = await parseResponse(r);
    if (!r.ok) throw new Error(d?.error || String(d));

    setStatus("Smazáno.", "success");
    await refreshVmList();
  } catch (e) {
    row.style.display = "";
    setStatus(String(e.message || e), "error");
  }
};
    actions.appendChild(btnDelete);
  }

  row.appendChild(left);
  row.appendChild(actions);
  return row;
}

function setCardClickable(statId, handler) {
  const el = document.getElementById(statId);
  if (!el) return;
  const card = el.closest(".card");
  if (!card) return;
  card.style.cursor = "pointer";
  card.addEventListener("click", handler);
}

function initDashboardFilters() {
  // klik na statistiky: filtr stavu
  
  setCardClickable("statRunning", () => {
    pushHistory();
    uiState.statusFilter = (uiState.statusFilter === "running") ? null : "running";
    refreshVmList();
  });

  setCardClickable("statStopped", () => {
    pushHistory();
    uiState.statusFilter = (uiState.statusFilter === "stopped") ? null : "stopped";
    refreshVmList();
  });

  setCardClickable("statTotal", () => {
    pushHistory();
    uiState.statusFilter = null;
    uiState.poolFilter = null;
    refreshVmList();
  });
}

async function refreshVmList() {
  const out = document.getElementById("out");
  if (!out) return;

  captureOpenBubbles();

  const data = await apiGet("/api/vm/list");
  const vmsAll = data?.vms || [];

// ===== Pending create banner (přežije přepnutí stránky) =====
const pb = document.getElementById("pendingBanner");
const pendingRaw = localStorage.getItem("pendingCreate");

if (pb) {
  if (pendingRaw) {
    let pending = null;
    try { pending = JSON.parse(pendingRaw); } catch {}
    if (pending?.name) {
      const exists = (vmsAll || []).some(v => (v.name || "") === pending.name);
      if (exists) {
        localStorage.removeItem("pendingCreate");
        pb.style.display = "none";
      } else {
        pb.textContent = `Vytváří se VM: ${pending.name} …`;
        pb.style.display = "";
      }
    } else {
      pb.style.display = "none";
    }
  } else {
    pb.style.display = "none";
  }
}

// ===== Disk info (součet maxdisk z /api/vm/list) =====
const di = document.getElementById("diskInfo");
if (di) {
  const usedBytes = (vmsAll || []).reduce((s, v) => s + (Number(v.maxdisk) || 0), 0);
  const usedGB = (usedBytes / (1024 ** 3)).toFixed(1);
  di.textContent = `Disk využito (virtuální velikost): ${usedGB} GB / 250 GB`;
  di.style.display = "";
}
  
  // statistiky vždy z plného seznamu
  updateStats(vmsAll);

  const role = getRole();
  const isDashboard = document.body?.dataset?.page === "dashboard";
  const isCreate = document.body?.dataset?.page === "create";

  if (isCreate) return; // na create stránce nelistujeme

  // filtry pro výpis
  const vms = applyFilters(vmsAll);

  out.innerHTML = "";
  if (!vms.length) {
    out.textContent = "Žádné VM pro zvolený filtr.";
    return;
  }

  const hasPool = vmsAll.some(v => v.pool !== undefined && v.pool !== null);

  // Admin bubliny jen na dashboardu
  if (role === "admin" && isDashboard && hasPool) {
    const map = new Map();
    for (const vm of vms) {
      const p = vm.pool || "neznamy";
      if (!map.has(p)) map.set(p, []);
      map.get(p).push(vm);
    }

    // admin VM (mojevm) vždy nahoře
    const adminPool = "mojevm";
    const adminVms = map.get(adminPool) || [];
    if (adminVms.length) {
      const h = document.createElement("div");
      h.className = "mb-2 fw-semibold";
      h.textContent = "Moje VM (admin)";
      out.appendChild(h);
      for (const vm of adminVms) out.appendChild(makeVmRow(vm, role));
    }

    // user bubliny
    const pools = [...map.keys()].filter(p => p !== adminPool).sort();
    for (const p of pools) {
      const group = map.get(p) || [];

      const details = document.createElement("details");
      details.className = "vm-bubble";
      details.dataset.pool = p;

      const summary = document.createElement("summary");
      summary.textContent = `${p} (${group.length})`;

      // klik na bublinu = filtr na uživatele (toggle) + zároveň ať zůstane otevřená
      summary.addEventListener("click", (e) => {
        // necháme default toggle open/close
        pushHistory();
        const next = (uiState.poolFilter === p) ? null : p;
        uiState.poolFilter = next;
        uiState.openPools.add(p); // ať to po refresh zůstane otevřené
        // refresh po kliknutí (po chvíli, aby se stihl přepnout open)
        setTimeout(refreshVmList, 0);
      });

      const content = document.createElement("div");
      content.className = "vm-bubble-content";
      for (const vm of group) content.appendChild(makeVmRow(vm, role));

      details.appendChild(summary);
      details.appendChild(content);
      out.appendChild(details);
    }

    restoreOpenBubbles();
    return;
  }

  // default list (user / admin mimo dashboard)
  for (const vm of vms) out.appendChild(makeVmRow(vm, role));
}

const QUOTA = {
  maxVms: 100,
  maxCores: 8,
  maxRamBytes: 20 * 1024 * 1024 * 1024,   // 20 GB
  maxDiskBytes: 250 * 1024 * 1024 * 1024, // 250 GB
};

function fmtGB(bytes) {
  return (bytes / (1024 ** 3)).toFixed(1);
}

function calcUsageFromVms(vms) {
  return {
    vms: (vms || []).length,
    cores: (vms || []).reduce((s, v) => s + (Number(v.maxcpu) || 0), 0),
    ramBytes: (vms || []).reduce((s, v) => s + (Number(v.maxmem) || 0), 0),
    diskBytes: (vms || []).reduce((s, v) => s + (Number(v.maxdisk) || 0), 0),
  };
}

let quotaCache = null;

function renderQuotaBox(usage) {
  const box = document.getElementById("quotaBox");
  if (!box) return;

  const role = getRole();
  if (role === "admin") {
    box.textContent = "Admin: bez limitu";
    return;
  }
  if (!usage) {
    box.textContent = "Limity nelze načíst";
    return;
  }

  const leftVms = QUOTA.maxVms - usage.vms;
  const leftCores = QUOTA.maxCores - usage.cores;
  const leftRamGB = fmtGB(QUOTA.maxRamBytes - usage.ramBytes);
  const leftDiskGB = fmtGB(QUOTA.maxDiskBytes - usage.diskBytes);

  // projekce podle toho, co je vyplněno ve formuláři
  const selCores = Number(document.getElementById("cores")?.value || 0);
  const selMemMiB = Number(document.getElementById("memory")?.value || 0);
  const selRamBytes = selMemMiB * 1024 * 1024;

  const afterCores = leftCores - (Number.isFinite(selCores) ? selCores : 0);
  const afterRamGB = fmtGB((QUOTA.maxRamBytes - (usage.ramBytes + selRamBytes)));

  box.innerHTML =
    `Zbývá: CPU ${leftCores}/${QUOTA.maxCores}, RAM ${leftRamGB}/20.0 GB, Disk ${leftDiskGB}/250.0 GB, VM ${leftVms}/${QUOTA.maxVms}<br>` +
    `Po vytvoření: CPU ${afterCores}/${QUOTA.maxCores}, RAM ${afterRamGB}/20.0 GB`;
}

async function refreshQuota() {
  const box = document.getElementById("quotaBox");
  if (!box) return;

  try {
    const data = await apiGet("/api/vm/list");
    const vms = data?.vms || [];
    quotaCache = calcUsageFromVms(vms);
    renderQuotaBox(quotaCache);
  } catch (e) {
    box.textContent = "Limity nelze načíst";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const isCreate = document.body?.dataset?.page === "create"; 
  if (isCreate) {
  refreshQuota();

  const coresEl = document.getElementById("cores");
  const memEl = document.getElementById("memory");
  if (coresEl) coresEl.addEventListener("input", () => renderQuotaBox(quotaCache));
  if (memEl) memEl.addEventListener("input", () => renderQuotaBox(quotaCache));
}
  initDashboardFilters();

  const backBtn = document.getElementById("filterBack");
if (backBtn) {
  backBtn.addEventListener("click", () => {
    if (!popHistory()) {
      // když není historie, reset filtrů
      uiState.statusFilter = null;
      uiState.poolFilter = null;
      uiState.openPools = new Set();
    }
    refreshVmList();
  });
}
  
  const isCreate = document.body?.dataset?.page === "create";

  if (!isCreate) {
    const btnRefresh = document.getElementById("refreshBtn");
    if (btnRefresh) btnRefresh.addEventListener("click", refreshVmList);
    refreshVmList().catch(e => setStatus(String(e.message || e), "error"));
  }

  const btnCreate = document.getElementById("btnCreate");
  if (btnCreate) {
    btnCreate.addEventListener("click", async () => {
      try {
        setStatus("Vytvářím…", "success");

        const name = (document.getElementById("name")?.value || "").trim();
        const template = (document.getElementById("template")?.value || "ubuntu").trim();
        const cores = Number(document.getElementById("cores")?.value || 2);
        const memory = Number(document.getElementById("memory")?.value || 2048);

        const slotRaw = (document.getElementById("slot")?.value || "").trim();
        const slot = slotRaw === "" ? null : Number(slotRaw);

        if (!name) { setStatus("Chybí název VM.", "error"); return; }
        if (!Number.isInteger(cores) || cores < 1 || cores > 8) { setStatus("CPU musí být celé 1–8.", "error"); return; }
        if (!Number.isInteger(memory) || memory < 512 || memory > 16384) { setStatus("RAM musí být 512–16384 MB.", "error"); return; }
        if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot > 99)) { setStatus("VMID slot musí být celé číslo 0–99.", "error"); return; }

       localStorage.setItem("pendingCreate", JSON.stringify({
  ts: Date.now(),
  name,
  pool: localStorage.getItem("pool") || null
}));
        localStorage.setItem("pendingCreate", JSON.stringify({
          ts: Date.now(),
          name,
            pool: localStorage.getItem("pool") || null
            }));
        
        await apiPost("/api/vm/create", { name, template, cores, memory, slot });

        localStorage.removeItem("pendingCreate");
        
        setStatus("Hotovo. Přesměrovávám na Moje VM…", "success");
        setTimeout(() => { window.location.href = "myvm.html"; }, 600);
      } catch (e) {
        localStorage.removeItem("pendingCreate");
        setStatus(String(e.message || e), "error");
      }
    });
  }
});
