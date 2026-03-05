/* app.js – stabilní verze: dashboard filtry + admin bubliny + zachování otevření + quota na create + status barvy + slot */
var API_BASE = window.API_BASE || (window.API_BASE = "https://api.jisavl22.fun");

const QUOTA = {
  maxVms: 100,
  maxCores: 8,
  maxRamBytes: 20 * 1024 * 1024 * 1024,   // 20 GB
  maxDiskBytes: 250 * 1024 * 1024 * 1024, // 250 GB (virtuální maxdisk)
};

const uiState = {
  statusFilter: null,   // "running" | "stopped" | null
  poolFilter: null,     // "user1" | "user2" | "user3" | "mojevm" | null
  openPools: new Set(),
  history: []
};

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

function shownId(vmid, role) {
  const id = Number(vmid);
  return (role === "admin") ? id : (id % 100);
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

  {
  const btnDelete = document.createElement("button");
  btnDelete.textContent = "Smazat";
  btnDelete.className = "btn btn-sm btn-danger";

  btnDelete.onclick = async () => {
    try {
      // preventivně – u running nabídni stop+delete
      if (vm.status === "running") {
        const ok = confirm("VM běží. Nejdřív ji vypnout a pak smazat?");
        if (!ok) return;
        setStatus("Vypínám…", "success");
        await apiPost(`/api/vm/${vm.vmid}/stop`, {});
        await new Promise(r => setTimeout(r, 800));
      }

      if (!confirm(`Opravdu smazat VM ${shownId(vm.vmid, role)}?`)) return;

      // OKAMŽITĚ pryč z UI
      row.remove();
      setStatus("Mažu…", "success");

      const r = await fetch(`${API_BASE}/api/vm/${vm.vmid}`, { method: "DELETE", headers: authHeaders() });
      if (r.status === 401) { localStorage.clear(); window.location.href = "index.html"; return; }
      const d = await parseResponse(r);
      if (!r.ok) throw new Error(d?.error || String(d));

      setStatus("Smazáno.", "success");
      await refreshVmList();
    } catch (e) {
      setStatus(String(e.message || e), "error");
      // když delete failne, necháme to být a refresh to vrátí zpět
      await refreshVmList();
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

let quotaCache = null;

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function barClass(usedRatio) {
  if (usedRatio >= 0.9) return "bg-danger";
  if (usedRatio >= 0.75) return "bg-warning";
  return "bg-success";
}

function renderQuotaBox() {
  const box = document.getElementById("quotaBox");
  if (!box) return;

  const role = getRole();
  if (role === "admin") {
    box.innerHTML = `<div class="small fw-semibold">Admin: bez limitu</div>`;
    return;
  }
  if (!quotaCache) {
    box.innerHTML = `<div class="small text-muted">Načítám…</div>`;
    return;
  }

  const usedVms = quotaCache.vms;
  const usedCores = quotaCache.cores;
  const usedRamGB = Number(fmtGB(quotaCache.ramBytes));
  const usedDiskGB = Number(fmtGB(quotaCache.diskBytes));

  const rVms  = clamp01(usedVms / QUOTA.maxVms);
  const rCpu  = clamp01(usedCores / QUOTA.maxCores);
  const rRam  = clamp01(quotaCache.ramBytes / QUOTA.maxRamBytes);
  const rDisk = clamp01(quotaCache.diskBytes / QUOTA.maxDiskBytes);

  // projekce po vytvoření (CPU/RAM/DISK)
  const selCores = Number(document.getElementById("cores")?.value || 0);
  const selMemMiB = Number(document.getElementById("memory")?.value || 0);
  const selRamBytes = selMemMiB * 1024 * 1024;

  const diskGbRaw = (document.getElementById("diskGb")?.value || "").trim();
  const selDiskGb = diskGbRaw === "" ? null : Number(diskGbRaw);
  const selDiskBytes = (selDiskGb && Number.isFinite(selDiskGb)) ? selDiskGb * 1024 * 1024 * 1024 : 0;

  const afterCores = usedCores + (Number.isFinite(selCores) ? selCores : 0);
  const afterRamBytes = quotaCache.ramBytes + (Number.isFinite(selRamBytes) ? selRamBytes : 0);
  const afterDiskBytes = quotaCache.diskBytes + selDiskBytes;

  const rCpuAfter  = clamp01(afterCores / QUOTA.maxCores);
  const rRamAfter  = clamp01(afterRamBytes / QUOTA.maxRamBytes);
  const rDiskAfter = clamp01(afterDiskBytes / QUOTA.maxDiskBytes);

  box.innerHTML = `
    <div class="small fw-semibold d-flex justify-content-between">
      <span>CPU</span><span>${usedCores}/${QUOTA.maxCores}</span>
    </div>
    <div class="progress mb-2" style="height:10px;">
      <div class="progress-bar ${barClass(rCpu)}" style="width:${(rCpu*100).toFixed(0)}%"></div>
    </div>
    <div class="small text-muted d-flex justify-content-between mb-2">
      <span>Po vytvoření</span><span>${afterCores}/${QUOTA.maxCores}</span>
    </div>
    <div class="progress mb-3" style="height:8px;">
      <div class="progress-bar ${barClass(rCpuAfter)}" style="width:${(rCpuAfter*100).toFixed(0)}%"></div>
    </div>

    <div class="small fw-semibold d-flex justify-content-between">
      <span>RAM</span><span>${usedRamGB.toFixed(1)}/20.0 GB</span>
    </div>
    <div class="progress mb-2" style="height:10px;">
      <div class="progress-bar ${barClass(rRam)}" style="width:${(rRam*100).toFixed(0)}%"></div>
    </div>
    <div class="small text-muted d-flex justify-content-between mb-2">
      <span>Po vytvoření</span><span>${Number(fmtGB(afterRamBytes)).toFixed(1)}/20.0 GB</span>
    </div>
    <div class="progress mb-3" style="height:8px;">
      <div class="progress-bar ${barClass(rRamAfter)}" style="width:${(rRamAfter*100).toFixed(0)}%"></div>
    </div>

    <div class="small fw-semibold d-flex justify-content-between">
      <span>Disk</span><span>${usedDiskGB.toFixed(1)}/250.0 GB</span>
    </div>
    <div class="progress mb-2" style="height:10px;">
      <div class="progress-bar ${barClass(rDisk)}" style="width:${(rDisk*100).toFixed(0)}%"></div>
    </div>
    <div class="small text-muted d-flex justify-content-between mb-2">
      <span>Po vytvoření</span><span>${Number(fmtGB(afterDiskBytes)).toFixed(1)}/250.0 GB</span>
    </div>
    <div class="progress mb-3" style="height:8px;">
      <div class="progress-bar ${barClass(rDiskAfter)}" style="width:${(rDiskAfter*100).toFixed(0)}%"></div>
    </div>

    <div class="small fw-semibold d-flex justify-content-between">
      <span>Počet VM</span><span>${usedVms}/${QUOTA.maxVms}</span>
    </div>
    <div class="progress" style="height:10px;">
      <div class="progress-bar ${barClass(rVms)}" style="width:${(rVms*100).toFixed(0)}%"></div>
    </div>
  `;
}

async function refreshQuotaFromList() {
  const box = document.getElementById("quotaBox");
  if (!box) return;
  try {
    const data = await apiGet("/api/vm/list");
    const vms = data?.vms || [];
    quotaCache = calcUsageFromVms(vms);
    renderQuotaBox();
  } catch {
    box.textContent = "Limity nelze načíst";
  }
}

async function refreshVmList() {
  const out = document.getElementById("out");
  if (!out) return;

  captureOpenBubbles();

  const data = await apiGet("/api/vm/list");
  const vmsAll = data?.vms || [];

  updateStats(vmsAll);

  const role = getRole();
  const page = document.body?.dataset?.page || "";
  if (page === "create") return;

  const isDashboard = page === "dashboard";
  const vms = applyFilters(vmsAll);

  out.innerHTML = "";
  if (!vms.length) {
    out.textContent = "Žádné VM pro zvolený filtr.";
    return;
  }

  const hasPool = vmsAll.some(v => v.pool !== undefined && v.pool !== null);

  if (role === "admin" && isDashboard && hasPool) {
    const map = new Map();
    for (const vm of vms) {
      const p = vm.pool || "neznamy";
      if (!map.has(p)) map.set(p, []);
      map.get(p).push(vm);
    }

    const adminPool = "mojevm";
    const adminVms = map.get(adminPool) || [];
    if (adminVms.length) {
      const h = document.createElement("div");
      h.className = "mb-2 fw-semibold";
      h.textContent = "Moje VM (admin)";
      out.appendChild(h);
      for (const vm of adminVms) out.appendChild(makeVmRow(vm, role));
    }

    const pools = [...map.keys()].filter(p => p !== adminPool).sort();
    for (const p of pools) {
      const group = map.get(p) || [];

      const details = document.createElement("details");
      details.className = "vm-bubble";
      details.dataset.pool = p;

      const summary = document.createElement("summary");
      summary.textContent = `${p} (${group.length})`;

      summary.addEventListener("click", () => {
        pushHistory();
        uiState.poolFilter = (uiState.poolFilter === p) ? null : p;
        uiState.openPools.add(p);
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

  for (const vm of vms) out.appendChild(makeVmRow(vm, role));
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body?.dataset?.page || "";
  const isCreate = page === "create";

  initDashboardFilters();

  const backBtn = document.getElementById("filterBack");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      if (!popHistory()) {
        uiState.statusFilter = null;
        uiState.poolFilter = null;
        uiState.openPools = new Set();
      }
      refreshVmList();
    });
  }

  if (!isCreate) {
    const btnRefresh = document.getElementById("refreshBtn");
    if (btnRefresh) btnRefresh.addEventListener("click", refreshVmList);
    refreshVmList().catch(e => setStatus(String(e.message || e), "error"));
  }

 if (isCreate) {
  refreshQuotaFromList();
  const coresEl = document.getElementById("cores");
  const memEl = document.getElementById("memory");
  const diskEl = document.getElementById("diskGb");
  if (coresEl) coresEl.addEventListener("input", renderQuotaBox);
  if (memEl) memEl.addEventListener("input", renderQuotaBox);
  if (diskEl) diskEl.addEventListener("input", renderQuotaBox);
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
        if (!Number.isInteger(memory) || memory < 256 || memory > 20480) { setStatus("RAM musí být 256–20480 MB.", "error"); return; }
        if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot > 99)) { setStatus("VMID slot musí být celé číslo 0–99.", "error"); return; }
if (!Number.isInteger(disk) || disk < 5 || disk > 250) {setStatus("Disk musí být 5-250 GB", "error"); return; }
        
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
