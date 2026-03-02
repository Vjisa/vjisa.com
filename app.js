const API_BASE = "https://api.jisavl22.fun";

function getRole() {
  return (window.__auth?.getUserRole?.() || localStorage.getItem("role") || "user");
}

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Na create stránce nepíšeme logy, jen krátký status do #status
function setOut(v) {
  const isCreate = document.body?.dataset?.page === "create";
  if (isCreate) {
    const status = document.getElementById("status");
    if (!status) return;
    const txt = (typeof v === "string") ? v : (v?.message || v?.error || JSON.stringify(v));
    status.textContent = txt;
    return;
  }

  const out = document.getElementById("out");
  if (!out) return;
  out.textContent = (typeof v === "string") ? v : JSON.stringify(v, null, 2);
}

async function parseResponse(r) {
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return txt; }
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function fetchRetry(url, options, tries = 4, delayMs = 400) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, options);
      if ([502, 503, 504].includes(r.status) && i < tries - 1) {
        await sleep(delayMs);
        continue;
      }
      return r;
    } catch (e) {
      if (i >= tries - 1) throw e;
      await sleep(delayMs);
    }
  }
}

async function apiGet(path) {
  const r = await fetchRetry(`${API_BASE}${path}`, { headers: { ...authHeaders() } });
  const data = await parseResponse(r);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${data?.error || data?.message || String(data)}`);
  return data;
}

async function apiPost(path, body) {
  const r = await fetchRetry(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = await parseResponse(r);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${data?.error || data?.message || String(data)}`);
  return data;
}

async function pollTask(upid, label = "Probíhá…", intervalMs = 2000, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();
  while (true) {
    const r = await apiGet(`/api/task/status?upid=${encodeURIComponent(upid)}`);
    const t = r.task || {};
    const state =
      r.state || (t.status === "stopped" ? (t.exitstatus === "OK" ? "done" : "error") : "running");

    setOut(`${label} (${state})`);

    if (state !== "running") return r;
    if (Date.now() - start > timeoutMs) throw new Error("Task timeout");
    await sleep(intervalMs);
  }
}

async function refreshVmList() {
  const out = document.getElementById("out");
  if (!out) return;

  const data = await apiGet("/api/vm/list");
  out.innerHTML = "";

  const vms = data.vms || [];
  if (!vms.length) {
    out.textContent = "Žádné VM v poolu mojevm.";
    return;
  }

  const role = getRole();

  for (const vm of vms) {
    const row = document.createElement("div");
    row.style.padding = "10px 0";
    row.style.borderBottom = "1px solid rgba(148, 163, 184, 0.25)";

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
    btnStart.onclick = async () => {
      setOut("Startuji…");
      const r = await apiPost(`/api/vm/${vm.vmid}/start`, {});
      if (r?.upid) await pollTask(r.upid, "Startuji…");
      await refreshVmList();
    };

    const btnStop = document.createElement("button");
    btnStop.textContent = "Stop";
    btnStop.className = "btn btn-sm btn-warning";
    btnStop.onclick = async () => {
      setOut("Zastavuji…");
      const r = await apiPost(`/api/vm/${vm.vmid}/stop`, {});
      if (r?.upid) await pollTask(r.upid, "Zastavuji…");
      await refreshVmList();
    };

    actions.appendChild(btnConsole);
    actions.appendChild(btnStart);
    actions.appendChild(btnStop);

    // Smazat pouze admin UI (backend musí stejně vynutit!)
    if (role === "admin") {
      const btnDelete = document.createElement("button");
      btnDelete.textContent = "Smazat";
      btnDelete.className = "btn btn-sm btn-danger";
      btnDelete.onclick = async () => {
        if (!confirm(`Smazat VM ${vm.vmid}?`)) return;
        setOut("Mažu…");
        const r = await fetch(`${API_BASE}/api/vm/${vm.vmid}`, { method: "DELETE", headers: { ...authHeaders() } });
        const d = await parseResponse(r);
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${d?.error || String(d)}`);
        if (d?.upid) await pollTask(d.upid, "Mažu…");
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

  const btnTest = document.getElementById("btnTest");
  const btnCreate = document.getElementById("btnCreate");

  if (btnTest) {
    btnTest.addEventListener("click", async () => {
      try {
        setOut("Testuji backend…");
        const data = await apiGet("/api/test");
        setOut(data?.ok ? "Backend OK." : data);
      } catch (e) {
        setOut({ ok: false, error: String(e.message || e) });
      }
    });
  }

  if (btnCreate) {
    btnCreate.addEventListener("click", async () => {
      try {
        const name = (document.getElementById("name")?.value || "").trim();
        const template = (document.getElementById("template")?.value || "ubuntu").trim();
        const cores = Number(document.getElementById("cores")?.value || 2);
        const memory = Number(document.getElementById("memory")?.value || 2048);

        if (!name) return setOut("Chybí název VM.");
        if (!Number.isInteger(cores) || cores < 1 || cores > 8) return setOut("cores musí být 1–8.");
        if (!Number.isInteger(memory) || memory < 512 || memory > 16384) return setOut("RAM musí být 512–16384 MB.");

        setOut("Odesílám požadavek…");
        const data = await apiPost("/api/vm/create", { name, template, cores, memory });

        if (data?.upidClone) await pollTask(data.upidClone, "Klonuji…");
        if (data?.upidStart) await pollTask(data.upidStart, "Spouštím…");

        // po vytvoření přesměruj na Moje VM (tam uvidíš výsledky)
        setOut("Hotovo. Přesměrovávám na Moje VM…");
        setTimeout(() => { window.location.href = "myvm.html"; }, 700);

      } catch (e) {
        setOut(String(e.message || e));
      }
    });
  }

  // seznam VM jen na stránkách, kde má být (home/myvm), ne na create
  if (!isCreate) {
    refreshVmList().catch(e => setOut({ ok: false, error: String(e.message || e) }));
  }
});
