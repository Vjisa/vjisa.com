const API_BASE = "https://api.jisavl22.fun";

function setOut(v) {
  const out = document.getElementById("out");
  if (!out) return;

  let log = document.getElementById("log");
  if (!log) {
    log = document.createElement("pre");
    log.id = "log";
    log.style.whiteSpace = "pre-wrap";
    log.style.margin = "8px 0";
    out.parentNode.insertBefore(log, out);

    const links = document.createElement("div");
    links.id = "logLinks";
    links.style.margin = "6px 0 12px 0";
    out.parentNode.insertBefore(links, out);
  }

  log.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

async function parseResponse(r) {
  const txt = await r.text();
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

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
  const r = await fetchRetry(`${API_BASE}${path}`, {});
  const data = await parseResponse(r);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${data?.error || data?.message || String(data)}`);
  return data;
}

async function apiPost(path, body) {
  const r = await fetchRetry(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseResponse(r);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${data?.error || data?.message || String(data)}`);
  return data;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function pollTask(upid, label = "Probíhá…", intervalMs = 2000, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();

  while (true) {
    let r;

    try {
      r = await apiGet(`/api/task/status?upid=${encodeURIComponent(upid)}`);
    } catch (e) {
      // krátký výpadek backendu/nginx při restartu -> retry
      const msg = String(e.message || e);
      if (/HTTP (502|503|504)/.test(msg) && Date.now() - start < timeoutMs) {
        await sleep(intervalMs);
        continue;
      }
      throw e;
    }

    const t = r.task || {};
    const state =
      r.state ||
      (t.status === "stopped" ? (t.exitstatus === "OK" ? "done" : "error") : "running");

    setOut(
      `${label}\nState: ${state}\nTask: ${t.type || ""}\nExit: ${r.exitstatus || t.exitstatus || ""}`
    );

    if (state !== "running") return r;
    if (Date.now() - start > timeoutMs) throw new Error("Task timeout");

    await sleep(intervalMs);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btnTest = document.getElementById("btnTest");
  const btnCreate = document.getElementById("btnCreate");


  
  if (btnTest) {
    btnTest.addEventListener("click", async () => {
      try {
        setOut("Volám /api/test…");
        const data = await apiGet("/api/test");
        setOut(data);
      } catch (e) {
        setOut({ ok: false, error: String(e.message || e) });
      }
    });
  }

  if (btnCreate) {
    btnCreate.addEventListener("click", async () => {
      let storageKey;

      try {
        const name = (document.getElementById("name")?.value || "").trim();
        const template = (document.getElementById("template")?.value || "ubuntu").trim();
        const cores = Number(document.getElementById("cores")?.value || 2);
        const memory = Number(document.getElementById("memory")?.value || 2048);

        if (!name) return setOut({ ok: false, error: "Chybí název VM." });
        if (!Number.isInteger(cores) || cores < 1 || cores > 8)
          return setOut({ ok: false, error: "cores musí být 1–8." });
        if (!Number.isInteger(memory) || memory < 512 || memory > 16384)
          return setOut({ ok: false, error: "memory musí být 512–16384 MB." });

        storageKey = `create:${name}`;

        let requestId = localStorage.getItem(storageKey);
        if (!requestId) {
          requestId = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
          localStorage.setItem(storageKey, requestId);
        }

        setOut("Odesílám create…");
        const data = await apiPost("/api/vm/create", { name, template, cores, memory, requestId });

        setOut({ step: "create-accepted", ...data });

        const rClone = await pollTask(data.upidClone, "Klonuji…");
        if (rClone.exitstatus && rClone.exitstatus !== "OK")
          throw new Error(`Clone failed: ${rClone.exitstatus}`);

        if (data.upidStart) {
          const rStart = await pollTask(data.upidStart, "Spouštím…");
          if (rStart.exitstatus && rStart.exitstatus !== "OK")
            throw new Error(`Start failed: ${rStart.exitstatus}`);
        }

        if (storageKey) localStorage.removeItem(storageKey);
        setOut({ ok: true, vmid: data.vmid, message: "Hotovo", console: `https://api.jisavl22.fun/console?vmid=${data.vmid}` });
const consoleUrl = `https://api.jisavl22.fun/console?vmid=${data.vmid}`;

const links = document.getElementById("logLinks");
if (links) {
  links.innerHTML = "";
  const a = document.createElement("a");
  a.href = consoleUrl;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "Otevřít konzoli";
  links.appendChild(a);
}

await refreshVmList();
        .open(`https://api.jisavl22.fun/console?vmid=${data.vmid}`, "_blank");
      } catch (e) {
        if (storageKey) localStorage.removeItem(storageKey);
        setOut({ ok: false, error: String(e.message || e) });
      }
    });
  }

  async function refreshVmList() {
  const data = await apiGet("/api/vm/list");
  const out = document.getElementById("out");
  out.innerHTML = "";

  const vms = data.vms || [];
  if (!vms.length) {
    out.textContent = "Žádné VM v poolu mojevm.";
    return;
  }

  for (const vm of vms) {
    const row = document.createElement("div");
    row.style.padding = "8px";
    row.style.borderBottom = "1px solid #333";

    const title = document.createElement("div");
    title.textContent = `VM ${vm.vmid} | ${vm.name} | ${vm.status}`;
    row.appendChild(title);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginTop = "6px";

    const btnConsole = document.createElement("button");
    btnConsole.textContent = "Konzole";
    btnConsole.onclick = () => .open(vm.consoleUrl, "_blank");

    const btnStart = document.createElement("button");
    btnStart.textContent = "Start";
    btnStart.onclick = async () => {
  setOut("Startuji…");
  const r = await apiPost(`/api/vm/${vm.vmid}/start`, {});
  setOut(r);
  if (r?.upid) await pollTask(r.upid, "Startuji…");
  await refreshVmList();
};

    const btnStop = document.createElement("button");
    btnStop.textContent = "Stop";
    btnStop.onclick = async () => {
  setOut("Zastavuji…");
  const r = await apiPost(`/api/vm/${vm.vmid}/stop`, {});
  setOut(r);
  if (r?.upid) await pollTask(r.upid, "Zastavuji…");
  await refreshVmList();
};

    const btnDelete = document.createElement("button");
    btnDelete.textContent = "Smazat";
    btnDelete.onclick = async () => {
  if (!confirm(`Smazat VM ${vm.vmid}?`)) return;

  setOut("Mažu…");
  const r = await fetch(`${API_BASE}/api/vm/${vm.vmid}`, { method: "DELETE" });
  const d = await parseResponse(r);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${d?.error || String(d)}`);

  setOut(d);
  if (d?.upid) await pollTask(d.upid, "Mažu…");
  await refreshVmList();
};

    actions.appendChild(btnConsole);
    actions.appendChild(btnStart);
    actions.appendChild(btnStop);
    actions.appendChild(btnDelete);

    row.appendChild(actions);
    out.appendChild(row);
  }
}

refreshVmList().catch(e => setOut({ ok: false, error: String(e.message || e) }));
  
});
