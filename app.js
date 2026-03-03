/* app.js (dashboard bubliny + tečky + slot + barevný status) */
var API_BASE = window.API_BASE || (window.API_BASE = "https://api.jisavl22.fun");

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

  const dot = makeDot(vm.status);
  left.appendChild(dot);

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
  btnStart.onclick = async () => { await apiPost(`/api/vm/${vm.vmid}/start`, {}); await refreshVmList(); };

  const btnStop = document.createElement("button");
  btnStop.textContent = "Stop";
  btnStop.className = "btn btn-sm btn-warning";
  btnStop.onclick = async () => { await apiPost(`/api/vm/${vm.vmid}/stop`, {}); await refreshVmList(); };

  actions.appendChild(btnConsole);
  actions.appendChild(btnStart);
  actions.appendChild(btnStop);

  if (role === "admin") {
    const btnDelete = document.createElement("button");
    btnDelete.textContent = "Smazat";
    btnDelete.className = "btn btn-sm btn-danger";
    btnDelete.onclick = async () => {
      if (!confirm(`Smazat VM ${vm.vmid}?`)) return;
      const r = await fetch(`${API_BASE}/api/vm/${vm.vmid}`, { method: "DELETE", headers: authHeaders() });
      if (r.status === 401) { localStorage.clear(); window.location.href = "index.html"; return; }
      const d = await parseResponse(r);
      if (!r.ok) throw new Error(d?.error || String(d));
      await refreshVmList();
    };
    actions.appendChild(btnDelete);
  }

  row.appendChild(left);
  row.appendChild(actions);
  return row;
}

async function refreshVmList() {
  const out = document.getElementById("out");
  if (!out) return;

  const data = await apiGet("/api/vm/list");
  const vms = data?.vms || [];
  updateStats(vms);

  out.innerHTML = "";
  if (!vms.length) {
    out.textContent = "Žádné VM.";
    return;
  }

  const role = getRole();
  const isDashboard = document.body?.dataset?.page === "dashboard";
  const hasPool = vms.some(v => v.pool !== undefined && v.pool !== null);

  // Admin bubliny jen na dashboardu
  if (role === "admin" && isDashboard && hasPool) {
    const map = new Map();
    for (const vm of vms) {
      const p = vm.pool || "neznamy";
      if (!map.has(p)) map.set(p, []);
      map.get(p).push(vm);
    }

    // admin pool nahoře
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

      const summary = document.createElement("summary");
      summary.textContent = `${p} (${group.length})`;

      const content = document.createElement("div");
      content.className = "vm-bubble-content";
      for (const vm of group) content.appendChild(makeVmRow(vm, role));

      details.appendChild(summary);
      details.appendChild(content);
      out.appendChild(details);
    }
    return;
  }

  // default list
  for (const vm of vms) out.appendChild(makeVmRow(vm, role));
}

document.addEventListener("DOMContentLoaded", () => {
  const isCreate = document.body?.dataset?.page === "create";

  // listy jen mimo create stránku
  if (!isCreate) {
    const btnRefresh = document.getElementById("refreshBtn");
    if (btnRefresh) btnRefresh.addEventListener("click", refreshVmList);
    refreshVmList().catch(e => setStatus(String(e.message || e), "error"));
  }

  // create stránka
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
        if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot > 99)) {
          setStatus("VMID slot musí být celé číslo 0–99.", "error");
          return;
        }

        if (!name) { setStatus("Chybí název VM.", "error"); return; }
        if (!Number.isInteger(cores) || cores < 1 || cores > 8) { setStatus("CPU musí být celé 1–8.", "error"); return; }
        if (!Number.isInteger(memory) || memory < 512 || memory > 16384) { setStatus("RAM musí být 512–16384 MB.", "error"); return; }

        await apiPost("/api/vm/create", { name, template, cores, memory, slot });

        setStatus("Hotovo. Přesměrovávám na Moje VM…", "success");
        setTimeout(() => { window.location.href = "myvm.html"; }, 600);
      } catch (e) {
        setStatus(String(e.message || e), "error");
      }
    });
  }
});
