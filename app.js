var API_BASE = window.API_BASE || (window.API_BASE = "https://api.jisavl22.fun");

const QUOTA = {
  maxVms: 100,
  maxCores: 8,
  maxRamBytes: 20 * 1024 * 1024 * 1024,
  maxDiskBytes: 250 * 1024 * 1024 * 1024,
};

const TEMPLATE_META = {
  ubuntu2404: {
    label: "Ubuntu 24.04",
    vmid: 907,
    defaultCpu: 2,
    defaultRam: 4096,
    defaultDisk: 25,
    minCpu: 2,
    minRam: 4096,
    minDisk: 25,
    linux: true,
    adminOnly: false,
    fixedUser: null,
    help: "Linux template. Uživatelské jméno i heslo se nastaví přes Cloud-Init."
  },
  debian13: {
    label: "Debian 13",
    vmid: 908,
    defaultCpu: 2,
    defaultRam: 2048,
    defaultDisk: 20,
    minCpu: 1,
    minRam: 1024,
    minDisk: 20,
    linux: true,
    adminOnly: false,
    fixedUser: null,
    help: "Linux template. Uživatelské jméno i heslo se nastaví přes Cloud-Init."
  },
  tiny11: {
    label: "Tiny Windows 11",
    vmid: 905,
    defaultCpu: 2,
    defaultRam: 4096,
    defaultDisk: 64,
    minCpu: 2,
    minRam: 4096,
    minDisk: 64,
    linux: false,
    adminOnly: true,
    fixedUser: "admin",
    help: "Windows template jen pro admina. Heslo se nastaví pro účet admin."
  },
  win10v2: {
    label: "Windows 10",
    vmid: 906,
    defaultCpu: 2,
    defaultRam: 4096,
    defaultDisk: 64,
    minCpu: 2,
    minRam: 4096,
    minDisk: 64,
    linux: false,
    adminOnly: true,
    fixedUser: "admin1",
    help: "Windows template jen pro admina. Heslo se nastaví pro účet admin1."
  }
};

const uiState = {
  statusFilter: null,
  poolFilter: null,
  openPools: new Set(),
  history: []
};

const actionState = {
  pending: new Map(),
  refreshTimer: null,
  pollTimer: null,
  statusTimer: null
};

const UI_PREFS_KEY = "mojevm.uiPrefs";

function loadUiPrefs() {
  try {
    return {
      autoRefreshInterval: "5000",
      confirmDangerousActions: true,
      ...JSON.parse(localStorage.getItem(UI_PREFS_KEY) || "{}")
    };
  } catch {
    return {
      autoRefreshInterval: "5000",
      confirmDangerousActions: true
    };
  }
}

function saveUiPrefs(next) {
  const merged = { ...loadUiPrefs(), ...next };
  localStorage.setItem(UI_PREFS_KEY, JSON.stringify(merged));
  return merged;
}

function getAutoRefreshMs() {
  const n = Number(loadUiPrefs().autoRefreshInterval || 5000);
  return Number.isFinite(n) ? n : 5000;
}

function confirmDangerousActionsEnabled() {
  return !!loadUiPrefs().confirmDangerousActions;
}

function getRole() {
  return localStorage.getItem("role") || "user";
}

function authHeaders(extra = {}) {
  const token = localStorage.getItem("token");
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

function setStatus(msg, type = "info", autoHideMs = 0) {
  const el = document.getElementById("status");
  if (!el) return;

  clearTimeout(actionState.statusTimer);

  el.textContent = msg || "";
  el.style.display = msg ? "" : "none";

  el.classList.remove("text-danger", "text-success", "text-muted");
  if (type === "error") el.classList.add("text-danger");
  else if (type === "success") el.classList.add("text-success");
  else el.classList.add("text-muted");

  if (autoHideMs > 0) {
    actionState.statusTimer = setTimeout(() => {
      el.textContent = "";
      el.style.display = "none";
    }, autoHideMs);
  }
}

async function parseResponse(r) {
  const txt = await r.text();
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (r.status === 401) {
    localStorage.clear();
    window.location.href = "index.html";
    return;
  }
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
  if (r.status === 401) {
    localStorage.clear();
    window.location.href = "index.html";
    return;
  }
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

function shownId(vmid, role) {
  const id = Number(vmid);
  return role === "admin" ? id : (id % 100);
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

function markPending(vmid, kind, ms = 6000) {
  actionState.pending.set(Number(vmid), { kind, until: Date.now() + ms });
}

function getPending(vmid) {
  const k = Number(vmid);
  const p = actionState.pending.get(k);
  if (!p) return null;
  if (Date.now() > p.until) {
    actionState.pending.delete(k);
    return null;
  }
  return p.kind;
}

function scheduleRefresh(ms = getAutoRefreshMs()) {
  clearTimeout(actionState.refreshTimer);
  actionState.refreshTimer = setTimeout(() => {
    refreshVmList().catch(() => {});
  }, ms);
}

function startAutoPoll() {
  clearInterval(actionState.pollTimer);
  const ms = getAutoRefreshMs();
  const out = document.getElementById("out");
  if (!out || ms <= 0) return;
  actionState.pollTimer = setInterval(() => {
    refreshVmList().catch(() => {});
  }, ms);
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

function makeDot(status) {
  const dot = document.createElement("span");
  dot.className = "vm-dot";
  dot.dataset.state = status || "";
  return dot;
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

function currentTemplateMeta() {
  const tplEl = document.getElementById("template");
  if (!tplEl) return null;
  return TEMPLATE_META[tplEl.value] || null;
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

  const rVms = clamp01(usedVms / QUOTA.maxVms);
  const rCpu = clamp01(usedCores / QUOTA.maxCores);
  const rRam = clamp01(quotaCache.ramBytes / QUOTA.maxRamBytes);
  const rDisk = clamp01(quotaCache.diskBytes / QUOTA.maxDiskBytes);

  const selCores = Number(document.getElementById("cores")?.value || 0);
  const selMemMiB = Number(document.getElementById("memory")?.value || 0);
  const selRamBytes = selMemMiB * 1024 * 1024;

  const diskGbRaw = (document.getElementById("diskGb")?.value || "").trim();
  const selDiskGb = diskGbRaw === "" ? null : Number(diskGbRaw);
  const selDiskBytes = (selDiskGb && Number.isFinite(selDiskGb))
    ? selDiskGb * 1024 * 1024 * 1024
    : 0;

  const afterCores = usedCores + (Number.isFinite(selCores) ? selCores : 0);
  const afterRamBytes = quotaCache.ramBytes + (Number.isFinite(selRamBytes) ? selRamBytes : 0);
  const afterDiskBytes = quotaCache.diskBytes + selDiskBytes;

  const rCpuAfter = clamp01(afterCores / QUOTA.maxCores);
  const rRamAfter = clamp01(afterRamBytes / QUOTA.maxRamBytes);
  const rDiskAfter = clamp01(afterDiskBytes / QUOTA.maxDiskBytes);

  box.innerHTML = `
    <div class="small fw-semibold d-flex justify-content-between"><span>CPU</span><span>${usedCores}/${QUOTA.maxCores}</span></div>
    <div class="progress mb-2" style="height:10px;"><div class="progress-bar ${barClass(rCpu)}" style="width:${(rCpu*100).toFixed(0)}%"></div></div>
    <div class="small text-muted d-flex justify-content-between mb-2"><span>Po vytvoření</span><span>${afterCores}/${QUOTA.maxCores}</span></div>
    <div class="progress mb-3" style="height:8px;"><div class="progress-bar ${barClass(rCpuAfter)}" style="width:${(rCpuAfter*100).toFixed(0)}%"></div></div>

    <div class="small fw-semibold d-flex justify-content-between"><span>RAM</span><span>${usedRamGB.toFixed(1)}/20.0 GB</span></div>
    <div class="progress mb-2" style="height:10px;"><div class="progress-bar ${barClass(rRam)}" style="width:${(rRam*100).toFixed(0)}%"></div></div>
    <div class="small text-muted d-flex justify-content-between mb-2"><span>Po vytvoření</span><span>${Number(fmtGB(afterRamBytes)).toFixed(1)}/20.0 GB</span></div>
    <div class="progress mb-3" style="height:8px;"><div class="progress-bar ${barClass(rRamAfter)}" style="width:${(rRamAfter*100).toFixed(0)}%"></div></div>

    <div class="small fw-semibold d-flex justify-content-between"><span>Disk</span><span>${usedDiskGB.toFixed(1)}/250.0 GB</span></div>
    <div class="progress mb-2" style="height:10px;"><div class="progress-bar ${barClass(rDisk)}" style="width:${(rDisk*100).toFixed(0)}%"></div></div>
    <div class="small text-muted d-flex justify-content-between mb-2"><span>Po vytvoření</span><span>${Number(fmtGB(afterDiskBytes)).toFixed(1)}/250.0 GB</span></div>
    <div class="progress mb-3" style="height:8px;"><div class="progress-bar ${barClass(rDiskAfter)}" style="width:${(rDiskAfter*100).toFixed(0)}%"></div></div>

    <div class="small fw-semibold d-flex justify-content-between"><span>Počet VM</span><span>${usedVms}/${QUOTA.maxVms}</span></div>
    <div class="progress" style="height:10px;"><div class="progress-bar ${barClass(rVms)}" style="width:${(rVms*100).toFixed(0)}%"></div></div>
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

function applyTemplatePreset() {
  const tplEl = document.getElementById("template");
  if (!tplEl) return;

  const meta = TEMPLATE_META[tplEl.value];
  if (!meta) return;

  const coresEl = document.getElementById("cores");
  const memEl = document.getElementById("memory");
  const diskEl = document.getElementById("diskGb");
  const userWrap = document.getElementById("vmUserWrap");
  const userEl = document.getElementById("vmUser");
  const userHelp = document.getElementById("vmUserHelp");
  const passHelp = document.getElementById("vmPassHelp");
  const templateHelp = document.getElementById("templateHelp");

  if (coresEl) {
    coresEl.value = meta.defaultCpu;
    coresEl.min = meta.minCpu;
  }
  if (memEl) {
    memEl.value = meta.defaultRam;
    memEl.min = meta.minRam;
  }
  if (diskEl) {
    diskEl.value = meta.defaultDisk;
    diskEl.min = meta.minDisk;
  }

  if (templateHelp) templateHelp.textContent = meta.help || "";

  if (meta.linux) {
    if (userWrap) userWrap.style.display = "";
    if (userEl) {
      userEl.disabled = false;
      userEl.placeholder = "např. test";
    }
    if (userHelp) userHelp.textContent = "Použije se pro Ubuntu/Debian (Cloud-Init).";
    if (passHelp) passHelp.textContent = "Ubuntu/Debian (Cloud-Init).";
  } else {
    if (userWrap) userWrap.style.display = "none";
    if (userEl) {
      userEl.disabled = true;
      userEl.value = "";
    }
    if (userHelp) userHelp.textContent = "";
    if (passHelp) passHelp.textContent = `Windows template. Heslo se nastaví pro účet ${meta.fixedUser}.`;
  }

  renderQuotaBox();
}

function makeVmRow(vm, role) {
  const row = document.createElement("div");
  row.className = "vm-row";

  const left = document.createElement("div");
  left.className = "vm-row-left";

  const dotEl = makeDot(vm.status);
  left.appendChild(dotEl);

  const title = document.createElement("div");
  title.className = "vm-row-title";

  const pending = getPending(vm.vmid);
  const displayStatus =
    pending === "starting" ? "starting" :
    pending === "stopping" ? "stopping" :
    vm.status;

  dotEl.dataset.state = pending ? "pending" : (vm.status || "");
  title.textContent = `VM ${shownId(vm.vmid, role)} | ${vm.name} | ${displayStatus}`;
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
      markPending(vm.vmid, "starting", 6000);
      dotEl.dataset.state = "pending";
      title.textContent = `VM ${shownId(vm.vmid, role)} | ${vm.name} | starting`;

      setStatus("Spouštím…", "success", 3000);
      scheduleRefresh();

      await apiPost(`/api/vm/${vm.vmid}/start`, {});
    } catch (e) {
      setStatus(String(e.message || e), "error", 6000);
      scheduleRefresh(0);
    }
  };

  const btnStop = document.createElement("button");
  btnStop.textContent = "Stop";
  btnStop.className = "btn btn-sm btn-warning";
  btnStop.onclick = async () => {
    try {
      if (confirmDangerousActionsEnabled() && !confirm(`Opravdu vypnout VM ${shownId(vm.vmid, role)}?`)) return;

      markPending(vm.vmid, "stopping", 6000);
      dotEl.dataset.state = "pending";
      title.textContent = `VM ${shownId(vm.vmid, role)} | ${vm.name} | stopping`;

      setStatus("Vypínám…", "success", 3000);
      scheduleRefresh();

      await apiPost(`/api/vm/${vm.vmid}/stop`, {});
    } catch (e) {
      setStatus(String(e.message || e), "error", 6000);
      scheduleRefresh(0);
    }
  };

  const btnDelete = document.createElement("button");
  btnDelete.textContent = "Smazat";
  btnDelete.className = "btn btn-sm btn-danger";
  btnDelete.onclick = async () => {
    try {
      if (vm.status === "running") {
        if (confirmDangerousActionsEnabled() && !confirm("VM běží. Nejdřív ji vypnout a pak smazat?")) return;

        markPending(vm.vmid, "stopping", 6000);
        dotEl.dataset.state = "pending";
        title.textContent = `VM ${shownId(vm.vmid, role)} | ${vm.name} | stopping`;

        setStatus("Vypínám…", "success", 3000);
        scheduleRefresh();

        await apiPost(`/api/vm/${vm.vmid}/stop`, {});
        await new Promise(r => setTimeout(r, 800));
      }

      if (confirmDangerousActionsEnabled() && !confirm(`Opravdu smazat VM ${shownId(vm.vmid, role)}?`)) return;

      markPending(vm.vmid, "deleting", 15000);
      row.remove();
      setStatus("Mažu…", "success", 3000);
      scheduleRefresh();

      const r = await fetch(`${API_BASE}/api/vm/${vm.vmid}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      if (r.status === 401) {
        localStorage.clear();
        window.location.href = "index.html";
        return;
      }
      const d = await parseResponse(r);
      if (!r.ok) throw new Error(d?.error || String(d));

      setStatus("Smazáno.", "success", 3000);
      scheduleRefresh(0);
    } catch (e) {
      setStatus(String(e.message || e), "error", 6000);
      scheduleRefresh(0);
      refreshVmList().catch(() => {});
    }
  };

  actions.appendChild(btnConsole);
  actions.appendChild(btnStart);
  actions.appendChild(btnStop);
  actions.appendChild(btnDelete);

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
    refreshVmList().catch(() => {});
  });

  setCardClickable("statStopped", () => {
    pushHistory();
    uiState.statusFilter = (uiState.statusFilter === "stopped") ? null : "stopped";
    refreshVmList().catch(() => {});
  });

  setCardClickable("statTotal", () => {
    pushHistory();
    uiState.statusFilter = null;
    uiState.poolFilter = null;
    refreshVmList().catch(() => {});
  });
}

async function refreshVmList() {
  const out = document.getElementById("out");
  if (!out) return;

  captureOpenBubbles();

  const data = await apiGet("/api/vm/list");
  const vmsAll = data?.vms || [];
  const vmsAllFiltered = vmsAll.filter(v => getPending(v.vmid) !== "deleting");

  updateStats(vmsAllFiltered);

  const role = getRole();
  const page = document.body?.dataset?.page || "";
  if (page === "create") return;

  const isDashboard = page === "dashboard";
  const vms = applyFilters(vmsAllFiltered);

  out.innerHTML = "";
  if (!vms.length) {
    out.textContent = "Žádné VM pro zvolený filtr.";
    return;
  }

  const hasPool = vmsAllFiltered.some(v => v.pool !== undefined && v.pool !== null);

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
        setTimeout(() => { refreshVmList().catch(() => {}); }, 0);
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

async function testBackend() {
  try {
    setStatus("Testuji backend…", "info", 3000);
    const res = await apiGet("/api/test");
    setStatus(res?.ok ? "Backend odpověděl správně." : "Backend vrátil neočekávanou odpověď.", res?.ok ? "success" : "error", 4000);
  } catch (e) {
    setStatus(String(e.message || e), "error", 6000);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body?.dataset?.page || "";
  const isCreate = page === "create";

  initDashboardFilters();

  const autoRefreshEl = document.getElementById("autoRefreshInterval");
  const confirmDangerousEl = document.getElementById("confirmDangerousActions");

  if (autoRefreshEl || confirmDangerousEl) {
    const prefs = loadUiPrefs();

    if (autoRefreshEl) {
      autoRefreshEl.value = String(prefs.autoRefreshInterval || "5000");
      autoRefreshEl.addEventListener("change", () => {
        saveUiPrefs({ autoRefreshInterval: autoRefreshEl.value });
      });
    }

    if (confirmDangerousEl) {
      confirmDangerousEl.checked = !!prefs.confirmDangerousActions;
      confirmDangerousEl.addEventListener("change", () => {
        saveUiPrefs({ confirmDangerousActions: confirmDangerousEl.checked });
      });
    }
  }

  const backBtn = document.getElementById("filterBack");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      if (!popHistory()) {
        uiState.statusFilter = null;
        uiState.poolFilter = null;
        uiState.openPools = new Set();
      }
      refreshVmList().catch(() => {});
    });
  }

  const out = document.getElementById("out");
  if (!isCreate && out) {
    const btnRefresh = document.getElementById("refreshBtn");
    if (btnRefresh) btnRefresh.addEventListener("click", () => refreshVmList().catch(() => {}));
    refreshVmList().catch(e => setStatus(String(e.message || e), "error", 6000));
    startAutoPoll();
  }

  const t = document.getElementById("togglePass");
  const p = document.getElementById("vmPass");
  if (t && p) {
    t.addEventListener("click", () => {
      const show = p.type === "password";
      p.type = show ? "text" : "password";
      t.textContent = show ? "Skrýt" : "Zobrazit";
    });
  }

  const btnTest = document.getElementById("btnTest");
  if (btnTest) {
    btnTest.addEventListener("click", testBackend);
  }

  if (isCreate) {
    const tplEl = document.getElementById("template");
    if (tplEl) {
      if (getRole() !== "admin") {
        [...tplEl.querySelectorAll("option[data-admin-only='1']")].forEach(o => o.remove());
      }
      tplEl.addEventListener("change", applyTemplatePreset);
      applyTemplatePreset();
    }

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
        btnCreate.disabled = true;
        setStatus("Vytvářím…", "success");

        const name = (document.getElementById("name")?.value || "").trim();
        const template = (document.getElementById("template")?.value || "ubuntu2404").trim();
        const meta = TEMPLATE_META[template];

        const cores = Number(document.getElementById("cores")?.value || 2);
        const memory = Number(document.getElementById("memory")?.value || 2048);

        const slotRaw = (document.getElementById("slot")?.value || "").trim();
        const slot = slotRaw === "" ? null : Number(slotRaw);

        const diskGbRaw = (document.getElementById("diskGb")?.value || "").trim();
        const diskGb = diskGbRaw === "" ? null : Number(diskGbRaw);

        const vmUser = (document.getElementById("vmUser")?.value || "").trim();
        const vmPass = (document.getElementById("vmPass")?.value || "").trim();

        if (!meta) {
          setStatus("Neplatná šablona.", "error", 6000);
          return;
        }

        if (!name) {
          setStatus("Chybí název VM.", "error", 6000);
          return;
        }

        if (!Number.isInteger(cores) || cores < meta.minCpu || cores > QUOTA.maxCores) {
          setStatus(`CPU musí být celé ${meta.minCpu}–${QUOTA.maxCores}.`, "error", 6000);
          return;
        }

        if (!Number.isInteger(memory) || memory < meta.minRam || memory > 20480) {
          setStatus(`RAM musí být ${meta.minRam}–20480 MB.`, "error", 6000);
          return;
        }

        if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot > 99)) {
          setStatus("VMID slot musí být 0–99.", "error", 6000);
          return;
        }

        if (diskGb !== null && (!Number.isInteger(diskGb) || diskGb < meta.minDisk || diskGb > 250)) {
          setStatus(`Disk musí být ${meta.minDisk}–250 GB.`, "error", 6000);
          return;
        }

        if (!vmPass) {
          setStatus("Chybí heslo.", "error", 6000);
          return;
        }

        if (vmPass.length < 4) {
          setStatus("Heslo je příliš krátké.", "error", 6000);
          return;
        }

        if (meta.linux && !vmUser) {
          setStatus("Chybí uživatel.", "error", 6000);
          return;
        }

        if (getRole() !== "admin" && quotaCache) {
          const projVms = quotaCache.vms + 1;
          const projCores = quotaCache.cores + cores;
          const projRamBytes = quotaCache.ramBytes + (memory * 1024 * 1024);
          const projDiskBytes = quotaCache.diskBytes + ((diskGb || meta.defaultDisk) * 1024 * 1024 * 1024);

          if (projVms > QUOTA.maxVms) {
            setStatus("Limit: počet VM překročen.", "error", 6000);
            return;
          }
          if (projCores > QUOTA.maxCores) {
            setStatus("Limit: CPU překročen.", "error", 6000);
            return;
          }
          if (projRamBytes > QUOTA.maxRamBytes) {
            setStatus("Limit: RAM překročen.", "error", 6000);
            return;
          }
          if (projDiskBytes > QUOTA.maxDiskBytes) {
            setStatus("Limit: Disk překročen.", "error", 6000);
            return;
          }
        }

        await apiPost("/api/vm/create", {
          name,
          template,
          cores,
          memory,
          slot,
          diskGb,
          vmUser,
          vmPass
        });

        setStatus("Hotovo. Přesměrovávám na Moje VM…", "success", 3000);
        setTimeout(() => {
          window.location.href = "myvm.html";
        }, 600);
      } catch (e) {
        setStatus(String(e.message || e), "error", 6000);
      } finally {
        btnCreate.disabled = false;
      }
    });
  }
});
