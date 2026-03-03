// app.js
var API_BASE = window.API_BASE || (window.API_BASE = "https://api.jisavl22.fun");

function getRole() {
  return localStorage.getItem("role") || "user";
}

function authHeaders(extra = {}) {
  const token = localStorage.getItem("token");
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
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

function setStatus(msg, type = "info") {
  const el = document.getElementById("status");
  if (!el) return;

  el.textContent = msg;

  // reset
  el.classList.remove("text-danger", "text-success", "text-muted");
  // barvy
  if (type === "error") el.classList.add("text-danger");
  else if (type === "success") el.classList.add("text-success");
  else el.classList.add("text-muted");
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

async function refreshVmList() {
  const out = document.getElementById("out");
  if (!out) return;

  const data = await apiGet("/api/vm/list");
  const vms = data?.vms || [];

  updateStats(vms);

  out.innerHTML = "";
  if (!vms.length) {
    out.textContent = "Žádné VM v tomto poolu.";
    return;
  }

  const role = getRole();

  for (const vm of vms) {
    const row = document.createElement("div");
    row.style.padding = "10px 0";
    row.style.borderBottom = "1px solid rgba(148,163,184,0.25)";

    const title = document.createElement("div");
    title.textContent = `VM ${vm.vmid} | ${vm.name} | ${vm.status}`;
    row.appendChild(title);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginTop = "8px";
    actions.style.flexWrap = "wrap";

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

    // delete jen admin UI (backend stejně musí vynutit)
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

    row.appendChild(actions);
    out.appendChild(row);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const isCreate = document.body?.dataset?.page === "create";

  // listujeme jen na home/myvm
  if (!isCreate) {
    const btnRefresh = document.getElementById("refreshBtn");
    if (btnRefresh) btnRefresh.addEventListener("click", refreshVmList);
    refreshVmList().catch(e => setStatus(String(e.message || e)));
  }

  // create page: jen vytvoření (žádný výstup seznamu)
  const btnCreate = document.getElementById("btnCreate");
  if (btnCreate) {
    btnCreate.addEventListener("click", async () => {
      try {
        const name = (document.getElementById("name")?.value || "").trim();
        const template = (document.getElementById("template")?.value || "ubuntu").trim();
        const cores = Number(document.getElementById("cores")?.value || 2);
        const memory = Number(document.getElementById("memory")?.value || 2048);

        if (!name) return setStatus("Chybí název VM.");
        if (!Number.isInteger(cores) || cores < 1 || cores > 8) return setStatus("CPU musí být celé 1–8.");
        if (!Number.isInteger(memory) || memory < 512 || memory > 16384) return setStatus("RAM musí být 512–16384 MB.");

        setStatus("Vytvářím…");
        await apiPost("/api/vm/create", { name, template, cores, memory });

        setStatus("Hotovo. Přesměrovávám na Moje VM…");
        setTimeout(() => { window.location.href = "myvm.html"; }, 600);
      } catch (e) {
        setStatus(String(e.message || e));
      }
    });
  }
});
