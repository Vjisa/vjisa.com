var API_BASE = window.API_BASE || (window.API_BASE = "https://api.jisavl22.fun");

const QUOTA = {
  maxVms: 100,
  maxCores: 8,
  maxRamBytes: 20 * 1024 * 1024 * 1024,
  maxDiskBytes: 250 * 1024 * 1024 * 1024,
};

const TEMPLATE_META = {
  ubuntu: {
    label: "Ubuntu Server",
    defaultCpu: 2,
    defaultRam: 2048,
    defaultDisk: 20,
    minCpu: 1,
    minRam: 1024,
    minDisk: 20,
    linux: true,
    adminOnly: false,
    fixedUser: null,
    help: "Původní Ubuntu Server template. Uživatelské jméno i heslo se nastaví přes Cloud-Init.",
  },
  ubuntu2404: {
    label: "Ubuntu 24.04",
    defaultCpu: 2,
    defaultRam: 4096,
    defaultDisk: 25,
    minCpu: 2,
    minRam: 4096,
    minDisk: 25,
    linux: true,
    adminOnly: false,
    fixedUser: null,
    help: "Linux template. Uživatelské jméno i heslo se nastaví přes Cloud-Init.",
  },
  debian13: {
    label: "Debian 13",
    defaultCpu: 2,
    defaultRam: 2048,
    defaultDisk: 20,
    minCpu: 1,
    minRam: 1024,
    minDisk: 20,
    linux: true,
    adminOnly: false,
    fixedUser: null,
    help: "Linux template. Uživatelské jméno i heslo se nastaví přes Cloud-Init.",
  },
  tiny11: {
    label: "Tiny Windows 11",
    defaultCpu: 2,
    defaultRam: 4096,
    defaultDisk: 64,
    minCpu: 2,
    minRam: 4096,
    minDisk: 64,
    linux: false,
    adminOnly: true,
    fixedUser: "admin",
    help: "Windows template jen pro admina. Heslo se nastaví pro účet admin.",
  },
  win10v2: {
    label: "Windows 10",
    defaultCpu: 2,
    defaultRam: 4096,
    defaultDisk: 64,
    minCpu: 2,
    minRam: 4096,
    minDisk: 64,
    linux: false,
    adminOnly: true,
    fixedUser: "admin1",
    help: "Windows template jen pro admina. Heslo se nastaví pro účet admin1.",
  },
};

const uiState = {
  statusFilter: null,
  poolFilter: null,
  openPools: new Set(),
  history: [],
};

const actionState = {
  pending: new Map(),
  refreshTimer: null,
  pollTimer: null,
  statusTimer: null,
};

const UI_PREFS_KEY = "mojevm.uiPrefs";
const PENDING_CREATE_KEY = "mojevm.pendingCreates";

function loadUiPrefs() {
  try {
    return {
      autoRefreshInterval: "5000",
      confirmDangerousActions: true,
      ...JSON.parse(localStorage.getItem(UI_PREFS_KEY) || "{}"),
    };
  } catch {
    return {
      autoRefreshInterval: "5000",
      confirmDangerousActions: true,
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

function getPool() {
  return localStorage.getItem("pool") || "";
}

function getUsername() {
  return localStorage.getItem("username") || "";
}

function normalizeVmName(name) {
  return String(name || "").trim().toLowerCase();
}

function authHeaders(extra = {}) {
  const token = localStorage.getItem("token");
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

function requireAuth() {
  if (!localStorage.getItem("token")) {
    window.location.href = "index.html";
    return false;
  }
  return true;
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
  let r;
  try {
    r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  } catch {
    throw new Error("Nepodařilo se spojit se serverem.");
  }
  if (r.status === 401) {
    localStorage.clear();
    window.location.href = "index.html";
    return;
  }
  const d = await parseResponse(r);
  if (!r.ok) throw new Error(d?.error || d?.message || "Server vrátil chybu.");
  return d;
}

async function apiPost(path, body) {
  let r;
  try {
    r = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Nepodařilo se spojit se serverem.");
  }
  if (r.status === 401) {
    localStorage.clear();
    window.location.href = "index.html";
    return;
  }
  const d = await parseResponse(r);
  if (!r.ok) throw new Error(d?.error || d?.message || "Server vrátil chybu.");
  return d;
}

async function apiDelete(path) {
  let r;
  try {
    r = await fetch(`${API_BASE}${path}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  } catch {
    throw new Error("Nepodařilo se spojit se serverem.");
  }
  if (r.status === 401) {
    localStorage.clear();
    window.location.href = "index.html";
    return;
  }
  const d = await parseResponse(r);
  if (!r.ok) throw new Error(d?.error || d?.message || "Server vrátil chybu.");
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
  if (!Number.isFinite(id)) return String(vmid ?? "?");
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
    [...document.querySelectorAll("details.vm-bubble[open]")].map((d) => d.dataset.pool)
  );
}

function restoreOpenBubbles() {
  for (const d of document.querySelectorAll("details.vm-bubble")) {
    d.open = uiState.openPools.has(d.dataset.pool);
  }
}

function applyFilters(vms) {
  let out = vms || [];
  if (uiState.poolFilter) out = out.filter((v) => (v.pool || "") === uiState.poolFilter);
  if (uiState.statusFilter === "running") out = out.filter((v) => v.status === "running");
  if (uiState.statusFilter === "stopped") out = out.filter((v) => v.status !== "running");
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

function scheduleRefresh(ms = null) {
  clearTimeout(actionState.refreshTimer);

  if (ms === 0) {
    actionState.refreshTimer = setTimeout(() => {
      refreshVmList().catch(() => {});
    }, 0);
    return;
  }

  const effectiveMs = ms == null ? getAutoRefreshMs() : ms;
  if (!Number.isFinite(effectiveMs) || effectiveMs <= 0) return;

  actionState.refreshTimer = setTimeout(() => {
    refreshVmList().catch(() => {});
  }, effectiveMs);
}

function startAutoPoll() {
  clearInterval(actionState.pollTimer);
  const out = document.getElementById("out");
  const ms = getAutoRefreshMs();

  if (!out || ms <= 0) return;

  actionState.pollTimer = setInterval(() => {
    refreshVmList().catch(() => {});
  }, ms);
}

function updateStats(vms) {
  const total = (vms || []).length;
  const running = (vms || []).filter((v) => v.status === "running").length;
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

function loadPendingCreates() {
  try {
    const now = Date.now();
    const role = getRole();
    const pool = getPool();
    const username = getUsername();
    const arr = JSON.parse(localStorage.getItem(PENDING_CREATE_KEY) || "[]");

    const notExpired = arr.filter((x) => now - Number(x.createdAt || 0) < 30 * 60 * 1000);
    if (notExpired.length !== arr.length) {
      localStorage.setItem(PENDING_CREATE_KEY, JSON.stringify(notExpired));
    }

    if (role === "admin") return notExpired;

    return notExpired.filter((x) => {
      const samePool = String(x.pool || "") === String(pool || "");
      const sameUser = String(x.username || "") === String(username || "");
      return samePool || sameUser;
    });
  } catch {
    return [];
  }
}

function savePendingCreates(arr) {
  localStorage.setItem(PENDING_CREATE_KEY, JSON.stringify(arr || []));
}

function addPendingCreate(entry) {
  const arr = JSON.parse(localStorage.getItem(PENDING_CREATE_KEY) || "[]");
  arr.push({
    ...entry,
    username: getUsername(),
    pool: entry.pool || getPool() || (getRole() === "admin" ? "mojevm" : ""),
    role: getRole(),
  });
  localStorage.setItem(PENDING_CREATE_KEY, JSON.stringify(arr));
}

function removePendingCreateByKey(requestKey) {
  const raw = JSON.parse(localStorage.getItem(PENDING_CREATE_KEY) || "[]");
  savePendingCreates(raw.filter((x) => x.requestKey !== requestKey));
}

function pendingUsage() {
  const arr = loadPendingCreates();
  return {
    vms: arr.length,
    cores: arr.reduce((s, x) => s + (Number(x.cores) || 0), 0),
    ramBytes: arr.reduce((s, x) => s + (Number(x.memory) || 0) * 1024 * 1024, 0),
    diskBytes: arr.reduce((s, x) => s + (Number(x.diskGb) || 0) * 1024 * 1024 * 1024, 0),
  };
}

function pendingVmidConflict(requestedVmid, requestKey = null) {
  if (!requestedVmid) return false;
  return loadPendingCreates().some(
    (x) => x.requestKey !== requestKey && Number(x.requestedVmid) === Number(requestedVmid)
  );
}

function pendingNameConflict(name, pool = getPool(), requestKey = null) {
  const normalizedName = normalizeVmName(name);
  const normalizedPool = String(pool || "");

  if (!normalizedName) return false;

  return loadPendingCreates().some((x) => (
    x.requestKey !== requestKey &&
    normalizeVmName(x.name) === normalizedName &&
    String(x.pool || "") === normalizedPool &&
    String(x.status || "running") !== "error"
  ));
}

function phaseLabel(phase) {
  switch (phase) {
    case "queued": return "zařazuje se";
    case "clone": return "klonuje se";
    case "config": return "konfiguruje se";
    case "start": return "spouští se";
    case "done": return "hotovo";
    case "error": return "chyba";
    default: return "vytváří se";
  }
}

async function syncPendingCreateStatuses(vms) {
  const raw = JSON.parse(localStorage.getItem(PENDING_CREATE_KEY) || "[]");
  if (!raw.length) return;

  const next = [];

  for (const item of raw) {
    try {
      const data = await apiGet(`/api/vm/create-status/${encodeURIComponent(item.requestKey)}`);
      const task = data?.task || {};

      const merged = {
        ...item,
        name: normalizeVmName(task.name || item.name || ""),
        pool: String(task.pool || item.pool || ""),
        phase: task.phase || item.phase || "queued",
        status: task.status || item.status || "running",
        error: task.error || null,
        vmid: task.vmid ?? item.vmid ?? item.requestedVmid ?? null,
      };

      const vmKey = `${merged.pool || ""}::${merged.name}`;
      const realVm = (vms || []).find((v) => {
        const vKey = `${v.pool || ""}::${normalizeVmName(v.name)}`;
        return vKey === vmKey || Number(v.vmid) === Number(merged.vmid);
      });

      const isReallyReady = !!realVm && realVm.status === "running";

      if (merged.status === "done" && isReallyReady) {
        const ageMs = Date.now() - Number(merged.createdAt || 0);
        if (ageMs > 10 * 1000) {
          continue;
        }
      }

      next.push(merged);
    } catch (e) {
      const msg = String(e?.message || e || "");
      const normalizedName = normalizeVmName(item.name);
      const vmKey = `${item.pool || ""}::${normalizedName}`;
      const realVm = (vms || []).find((v) => {
        const vKey = `${v.pool || ""}::${normalizeVmName(v.name)}`;
        return vKey === vmKey || Number(v.vmid) === Number(item.vmid ?? item.requestedVmid);
      });

      const ageMs = Date.now() - Number(item.createdAt || 0);
      const readyEnough = !!realVm && realVm.status === "running";

      if (msg.includes("Create task nenalezen") || msg.includes("404")) {
        if (readyEnough || ageMs > 5 * 60 * 1000) {
          continue;
        }
      }

      next.push(item);
    }
  }

  savePendingCreates(next);
}

function renderQuotaBox() {
  const box = document.getElementById("quotaBox");
  if (!box) return;

  const role = getRole();
  if (role === "admin") {
    box.innerHTML = `<div class="text-muted">Admin: bez limitu</div>`;
    return;
  }

  if (!quotaCache) {
    box.innerHTML = `<div class="text-muted">Načítám…</div>`;
    return;
  }

  const pending = pendingUsage();
  const usedVms = quotaCache.vms + pending.vms;
  const usedCores = quotaCache.cores + pending.cores;
  const usedRamBytes = quotaCache.ramBytes + pending.ramBytes;
  const usedDiskBytes = quotaCache.diskBytes + pending.diskBytes;

  const usedRamGB = Number(fmtGB(usedRamBytes));
  const usedDiskGB = Number(fmtGB(usedDiskBytes));

  const selCores = Number(document.getElementById("cores")?.value || 0);
  const selMemMiB = Number(document.getElementById("memory")?.value || 0);
  const selRamBytes = selMemMiB * 1024 * 1024;

  const diskGbRaw = (document.getElementById("diskGb")?.value || "").trim();
  const selDiskGb = diskGbRaw === "" ? null : Number(diskGbRaw);
  const selDiskBytes = (selDiskGb && Number.isFinite(selDiskGb))
    ? selDiskGb * 1024 * 1024 * 1024
    : 0;

  const afterCores = usedCores + (Number.isFinite(selCores) ? selCores : 0);
  const afterRamBytes = usedRamBytes + (Number.isFinite(selRamBytes) ? selRamBytes : 0);
  const afterDiskBytes = usedDiskBytes + selDiskBytes;

  const rCpu = clamp01(usedCores / QUOTA.maxCores);
  const rRam = clamp01(usedRamBytes / QUOTA.maxRamBytes);
  const rDisk = clamp01(usedDiskBytes / QUOTA.maxDiskBytes);

  const rCpuAfter = clamp01(afterCores / QUOTA.maxCores);
  const rRamAfter = clamp01(afterRamBytes / QUOTA.maxRamBytes);
  const rDiskAfter = clamp01(afterDiskBytes / QUOTA.maxDiskBytes);

  box.innerHTML = `
    <div class="small mb-2">Do limitů se započítávají i VM, které se právě vytvářejí.</div>

    <div class="mb-2">
      <div class="d-flex justify-content-between small"><span>CPU</span><span>${usedCores}/${QUOTA.maxCores}</span></div>
      <div class="progress" style="height:8px;"><div class="progress-bar ${barClass(rCpu)}" style="width:${rCpu * 100}%"></div></div>
      <div class="small text-muted mt-1">Po vytvoření: ${afterCores}/${QUOTA.maxCores}</div>
      <div class="progress mt-1" style="height:8px;"><div class="progress-bar ${barClass(rCpuAfter)}" style="width:${rCpuAfter * 100}%"></div></div>
    </div>

    <div class="mb-2">
      <div class="d-flex justify-content-between small"><span>RAM</span><span>${usedRamGB.toFixed(1)}/20.0 GB</span></div>
      <div class="progress" style="height:8px;"><div class="progress-bar ${barClass(rRam)}" style="width:${rRam * 100}%"></div></div>
      <div class="small text-muted mt-1">Po vytvoření: ${Number(fmtGB(afterRamBytes)).toFixed(1)}/20.0 GB</div>
      <div class="progress mt-1" style="height:8px;"><div class="progress-bar ${barClass(rRamAfter)}" style="width:${rRamAfter * 100}%"></div></div>
    </div>

    <div class="mb-2">
      <div class="d-flex justify-content-between small"><span>Disk</span><span>${usedDiskGB.toFixed(1)}/250.0 GB</span></div>
      <div class="progress" style="height:8px;"><div class="progress-bar ${barClass(rDisk)}" style="width:${rDisk * 100}%"></div></div>
      <div class="small text-muted mt-1">Po vytvoření: ${Number(fmtGB(afterDiskBytes)).toFixed(1)}/250.0 GB</div>
      <div class="progress mt-1" style="height:8px;"><div class="progress-bar ${barClass(rDiskAfter)}" style="width:${rDiskAfter * 100}%"></div></div>
    </div>

    <div class="small text-muted">Počet VM: ${usedVms}/${QUOTA.maxVms}</div>
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

  const role = getRole();
  const coresEl = document.getElementById("cores");
  const memEl = document.getElementById("memory");
  const diskEl = document.getElementById("diskGb");
  const slotEl = document.getElementById("slot");
  const slotLabel = document.getElementById("slotLabel");
  const slotHelp = document.getElementById("slotHelp");
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

  if (slotEl) {
    if (role === "admin") {
      slotEl.min = "100";
      slotEl.max = "999999";
      slotEl.placeholder = "celé VMID";
      slotEl.step = "1";
      if (slotLabel) slotLabel.textContent = "VMID";
      if (slotHelp) slotHelp.textContent = "Admin může zadat celé VMID. Bez backend úpravy to server ještě nemusí přijmout.";
    } else {
      slotEl.min = "0";
      slotEl.max = "99";
      slotEl.placeholder = "0–99";
      slotEl.step = "1";
      if (slotLabel) slotLabel.textContent = "ID (0–99)";
      if (slotHelp) slotHelp.textContent = "User vybírá jen 0–99. Skutečné VMID dopočítá backend.";
    }
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

function vmIpText(vm) {
  const ip = vm.ip || vm.ipAddress || vm.primaryIp || null;
  if (ip) return ` | IP: ${ip}`;
  return vm.status === "running" ? " | IP není zatím dostupná" : "";
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
  let displayStatus = vm.status;

  if (vm.pendingCreate) {
    displayStatus = phaseLabel(vm.pendingCreatePhase);
    if (vm.pendingCreateError) {
      displayStatus += `: ${vm.pendingCreateError}`;
    }
  } else if (pending === "starting") {
    displayStatus = "starting";
  } else if (pending === "stopping") {
    displayStatus = "stopping";
  } else if (pending === "deleting") {
    displayStatus = "deleting";
  }

  dotEl.dataset.state = vm.pendingCreate ? "pending" : (pending ? "pending" : (vm.status || ""));
  title.textContent = `VM ${shownId(vm.vmid, role)} | ${vm.name} | ${displayStatus}${vmIpText(vm)}`;
  left.appendChild(title);

  const actions = document.createElement("div");
  actions.className = "vm-actions";

  if (vm.pendingCreate) {
    const badge = document.createElement("span");
    badge.className = "btn btn-sm btn-secondary disabled";
    badge.textContent = "Vytváří se";
    actions.appendChild(badge);
    row.appendChild(left);
    row.appendChild(actions);
    return row;
  }

  const btnConsole = document.createElement("button");
  btnConsole.textContent = "Konzole";
  btnConsole.className = "btn btn-sm btn-outline-primary";
  btnConsole.disabled = !vm.consoleUrl;
  btnConsole.onclick = () => {
    if (vm.consoleUrl) window.open(vm.consoleUrl, "_blank");
  };

  const btnStart = document.createElement("button");
  btnStart.textContent = "Start";
  btnStart.className = "btn btn-sm btn-success";
  btnStart.onclick = async () => {
    try {
      markPending(vm.vmid, "starting", 6000);
      dotEl.dataset.state = "pending";
      title.textContent = `VM ${shownId(vm.vmid, role)} | ${vm.name} | starting${vmIpText(vm)}`;
      setStatus("Spouštím…", "success", 3000);
      await apiPost(`/api/vm/${vm.vmid}/start`, {});
      scheduleRefresh(1500);
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
      title.textContent = `VM ${shownId(vm.vmid, role)} | ${vm.name} | stopping${vmIpText(vm)}`;
      setStatus("Vypínám…", "success", 3000);
      await apiPost(`/api/vm/${vm.vmid}/stop`, {});
      scheduleRefresh(1500);
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
        title.textContent = `VM ${shownId(vm.vmid, role)} | ${vm.name} | stopping${vmIpText(vm)}`;
        setStatus("Vypínám…", "success", 3000);
        await apiPost(`/api/vm/${vm.vmid}/stop`, {});
        await new Promise((r) => setTimeout(r, 800));
      }

      if (confirmDangerousActionsEnabled() && !confirm(`Opravdu smazat VM ${shownId(vm.vmid, role)}?`)) return;

      markPending(vm.vmid, "deleting", 15000);
      row.remove();
      setStatus("Mažu…", "success", 3000);
      await apiDelete(`/api/vm/${vm.vmid}`);
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

function materializePendingCreates(vms) {
  const now = Date.now();
  const allPending = JSON.parse(localStorage.getItem(PENDING_CREATE_KEY) || "[]");

  const cleaned = allPending.filter((p) => {
    const ageMs = now - Number(p.createdAt || 0);
    if (ageMs > 30 * 60 * 1000) return false;

    const vm = (vms || []).find((v) => {
      const vKey = `${v.pool || ""}::${normalizeVmName(v.name)}`;
      const pKey = `${p.pool || ""}::${normalizeVmName(p.name)}`;
      return vKey === pKey || Number(v.vmid) === Number(p.vmid ?? p.requestedVmid);
    });

        if (vm) {
      return ageMs < 4000;
    }
    return true;
  });

  savePendingCreates(cleaned);

  const role = getRole();
  const pool = getPool();
  const username = getUsername();

  if (role === "admin") return cleaned;
  return cleaned.filter((x) => {
    const samePool = String(x.pool || "") === String(pool || "");
    const sameUser = String(x.username || "") === String(username || "");
    return samePool || sameUser;
  });
}

function fakeVmFromPending(p) {
  return {
    vmid: p.requestedVmid ?? `pending-${p.requestKey}`,
    name: p.name,
    status: "creating",
    pendingCreate: true,
    pendingCreatePhase: p.phase || "queued",
    pendingCreateError: p.error || null,
    maxcpu: Number(p.cores) || 0,
    maxmem: (Number(p.memory) || 0) * 1024 * 1024,
    maxdisk: (Number(p.diskGb) || 0) * 1024 * 1024 * 1024,
    consoleUrl: null,
    pool: p.pool || getPool(),
    ip: null,
  };
}

async function refreshVmList() {
  const out = document.getElementById("out");
  if (!out) return;

  captureOpenBubbles();

  const role = getRole();
  const page = document.body?.dataset?.page || "";
  const immediatePending = loadPendingCreates().map(fakeVmFromPending);

  if (page !== "create" && immediatePending.length) {
    out.innerHTML = "";
    for (const vm of immediatePending) out.appendChild(makeVmRow(vm, role));
  }
  
  const data = await apiGet("/api/vm/list");
  const vmsAll = data?.vms || [];

  const pendingCreates = materializePendingCreates(vmsAll);
  quotaCache = calcUsageFromVms(vmsAll);

  const merged = [
    ...vmsAll.filter((v) => getPending(v.vmid) !== "deleting"),
    ...pendingCreates.map(fakeVmFromPending),
  ];

  syncPendingCreateStatuses(vmsAll).catch(() => {});
  updateStats(merged);

    if (page === "create") return;

  const isDashboard = page === "dashboard";
  const vms = applyFilters(merged);

  out.innerHTML = "";

  if (!vms.length) {
    out.textContent = "Žádné VM pro zvolený filtr.";
    return;
  }

  const hasPool = merged.some((v) => v.pool !== undefined && v.pool !== null);

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

    const pools = [...map.keys()].filter((p) => p !== adminPool).sort();

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
        setTimeout(() => {
          refreshVmList().catch(() => {});
        }, 0);
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
    const ok = res?.ok || res?.status === "OK";
    setStatus(ok ? "Backend odpověděl správně." : "Backend vrátil neočekávanou odpověď.", ok ? "success" : "error", 4000);
  } catch (e) {
    setStatus(String(e.message || e), "error", 6000);
  }
}

function initHeader() {
  const username = getUsername() || "—";
  const role = getRole() || "—";
  const pool = getPool() || "—";

  const navUser = document.getElementById("navUser");
  const navRole = document.getElementById("navRole");
  const navPool = document.getElementById("navPool");

  if (navUser) navUser.textContent = username;
  if (navRole) navRole.textContent = role;
  if (navPool) navPool.textContent = pool;

  const auditNav = document.getElementById("auditNav");
  if (auditNav && role !== "admin") {
    auditNav.style.display = "none";
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.clear();
      window.location.href = "index.html";
    });
  }
}

function initSettingsPage() {
  const accountUsername = document.getElementById("accountUsername");
  const accountRole = document.getElementById("accountRole");
  const accountPool = document.getElementById("accountPool");

  if (accountUsername) accountUsername.textContent = getUsername() || "—";
  if (accountRole) accountRole.textContent = getRole() || "—";
  if (accountPool) accountPool.textContent = getPool() || "—";

  const autoRefreshEl = document.getElementById("autoRefreshInterval");
  const confirmDangerousEl = document.getElementById("confirmDangerousActions");
  const btnClearLocalData = document.getElementById("btnClearLocalData");

  const prefs = loadUiPrefs();

  if (autoRefreshEl) {
    autoRefreshEl.value = String(prefs.autoRefreshInterval || "5000");
    autoRefreshEl.addEventListener("change", () => {
      saveUiPrefs({ autoRefreshInterval: autoRefreshEl.value });
      startAutoPoll();
      setStatus("Nastavení automatické obnovy bylo uloženo.", "success", 3000);
    });
  }

  if (confirmDangerousEl) {
    confirmDangerousEl.checked = !!prefs.confirmDangerousActions;
    confirmDangerousEl.addEventListener("change", () => {
      saveUiPrefs({ confirmDangerousActions: confirmDangerousEl.checked });
      setStatus("Nastavení potvrzování akcí bylo uloženo.", "success", 3000);
    });
  }

  if (btnClearLocalData) {
    btnClearLocalData.addEventListener("click", () => {
      if (!confirm("Opravdu odstranit lokální data a odhlásit se?")) return;
      localStorage.clear();
      window.location.href = "index.html";
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;

  const page = document.body?.dataset?.page || "";
  const isCreate = page === "create";

  initHeader();
  initDashboardFilters();
  initSettingsPage();

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
    if (btnRefresh) {
      btnRefresh.addEventListener("click", () => refreshVmList().catch(() => {}));
    }
    refreshVmList().catch((e) => setStatus(String(e.message || e), "error", 6000));
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
  if (btnTest) btnTest.addEventListener("click", testBackend);

  if (isCreate) {
    const tplEl = document.getElementById("template");
    if (tplEl) {
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
      let requestKey = null;

      try {
        btnCreate.disabled = true;
        setStatus("Vytvářím…", "success");

        const name = (document.getElementById("name")?.value || "").trim();
        const template = (document.getElementById("template")?.value || "ubuntu").trim();
        const meta = TEMPLATE_META[template];
        const cores = Number(document.getElementById("cores")?.value || 2);
        const memory = Number(document.getElementById("memory")?.value || 2048);
        const slotRaw = (document.getElementById("slot")?.value || "").trim();
        const slot = slotRaw === "" ? null : Number(slotRaw);
        const diskGbRaw = (document.getElementById("diskGb")?.value || "").trim();
        const diskGb = diskGbRaw === "" ? null : Number(diskGbRaw);
        const vmUser = (document.getElementById("vmUser")?.value || "").trim();
        const vmPass = (document.getElementById("vmPass")?.value || "").trim();
        const role = getRole();
        const requestedVmid = role === "admin" ? slot : null;
        const effectivePool = getPool() || (role === "admin" ? "mojevm" : "");
        const normalizedName = normalizeVmName(name);

        if (!meta) {
          setStatus("Neplatná šablona.", "error", 6000);
          return;
        }
        if (!name) {
          setStatus("Chybí název VM.", "error", 6000);
          return;
        }
        if (pendingNameConflict(name, effectivePool)) {
          setStatus(`VM s názvem "${name}" se už vytváří.`, "error", 6000);
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
        if (role === "admin") {
          if (requestedVmid !== null && (!Number.isInteger(requestedVmid) || requestedVmid < 100 || requestedVmid > 999999)) {
            setStatus("Admin může zadat celé VMID od 100 výš.", "error", 6000);
            return;
          }
        } else {
          if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot > 99)) {
            setStatus("ID musí být 0–99.", "error", 6000);
            return;
          }
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
        if (requestedVmid && pendingVmidConflict(requestedVmid)) {
          setStatus(`VMID ${requestedVmid} je už rezervováno jiným právě vytvářeným strojem v tomto prohlížeči.`, "error", 6000);
          return;
        }

        if (quotaCache) {
          const pending = pendingUsage();
          const usedNow = {
            vms: quotaCache.vms + pending.vms,
            cores: quotaCache.cores + pending.cores,
            ramBytes: quotaCache.ramBytes + pending.ramBytes,
            diskBytes: quotaCache.diskBytes + pending.diskBytes,
          };

          const reqDiskGb = diskGb || meta.defaultDisk;
          const reqDiskBytes = reqDiskGb * 1024 * 1024 * 1024;

          if (role !== "admin") {
            if (usedNow.vms + 1 > QUOTA.maxVms) {
              setStatus("Limit: počet VM překročen.", "error", 6000);
              return;
            }
            if (usedNow.cores + cores > QUOTA.maxCores) {
              setStatus("Limit: CPU překročen.", "error", 6000);
              return;
            }
            if (usedNow.ramBytes + memory * 1024 * 1024 > QUOTA.maxRamBytes) {
              setStatus("Limit: RAM překročen.", "error", 6000);
              return;
            }
            if (usedNow.diskBytes + reqDiskBytes > QUOTA.maxDiskBytes) {
              setStatus("Limit: Disk překročen.", "error", 6000);
              return;
            }
          }
        }

        requestKey = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        addPendingCreate({
          requestKey,
          createdAt: Date.now(),
          name: normalizedName,
          template,
          pool: effectivePool,
          username: getUsername(),
          requestedVmid,
          displaySlot: slot,
          cores,
          memory,
          diskGb: diskGb || meta.defaultDisk,
          phase: "queued",
          status: "running",
        });

        renderQuotaBox();

        const payload = {
          name,
          template,
          cores,
          memory,
          diskGb,
          vmUser,
          vmPass,
          requestKey,
        };

        if (role === "admin") payload.vmid = requestedVmid;
        else payload.slot = slot;

        let createRes;
        try {
          createRes = await apiPost("/api/vm/create", payload);
        } catch (e) {
          const raw = JSON.parse(localStorage.getItem(PENDING_CREATE_KEY) || "[]");
          const next = raw.map((x) => x.requestKey === requestKey ? {
            ...x,
            phase: "error",
            status: "error",
            error: String(e.message || e),
          } : x);
          savePendingCreates(next);
          throw e;
        }

        const acceptedRequestKey = createRes?.requestKey || requestKey;
        {
          const raw = JSON.parse(localStorage.getItem(PENDING_CREATE_KEY) || "[]");
          const next = raw.map((x) => x.requestKey === requestKey ? {
            ...x,
            requestKey: acceptedRequestKey,
            phase: "queued",
            status: "running",
            error: null,
          } : x);
          savePendingCreates(next);
        }

        setStatus("Požadavek byl přijat. Přesměrovávám…", "success", 1200);
        setTimeout(() => {
          window.location.href = "myvm.html";
        }, 250);
        return;
      } catch (e) {
        if (requestKey) removePendingCreateByKey(requestKey);
        renderQuotaBox();
        setStatus(String(e.message || e), "error", 6000);
      } finally {
        btnCreate.disabled = false;
      }
    });
  }
});
