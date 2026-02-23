const API_BASE = "https://api.jisavl22.fun";

function setOut(v) {
  const el = document.getElementById("out");
  el.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`);
  const txt = await r.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = txt; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${data?.error || data?.message || txt}`);
  return data;
}

async function apiPost(path, body) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = txt; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${data?.error || data?.message || txt}`);
  return data;
}

async function pollTask(upid, label = "Probíhá…", intervalMs = 2000, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();
  while (true) {
    let r;
    try {
      r = await apiGet(`/api/task/status?upid=${encodeURIComponent(upid)}`);
    } catch (e) {
      // když se ti na chvíli objeví 502 (restart backendu), jen to zkus znovu
      const msg = String(e.message || e);
      if (/HTTP (502|503|504)/.test(msg) && Date.now() - start < timeoutMs) {
        await new Promise(res => setTimeout(res, intervalMs));
        continue;
      }
      throw e;
    }

    const t = r.task;
    const state = r.state || (t.status === "stopped" ? (t.exitstatus === "OK" ? "done" : "error") : "running");

    setOut(`${label}\nState: ${state}\nTask: ${t.type}\nExit: ${r.exitstatus || t.exitstatus || ""}`);

    if (state !== "running") return r;
    if (Date.now() - start > timeoutMs) throw new Error("Task timeout");
    await new Promise(res => setTimeout(res, intervalMs));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnTest").addEventListener("click", async () => {
    try {
      setOut("Volám /api/test…");
      const data = await apiGet("/api/test");
      setOut(data);
    } catch (e) {
      setOut({ ok: false, error: String(e.message || e) });
    }
  });

  document.getElementById("btnCreate").addEventListener("click", async () => {
    try {
      const name = (document.getElementById("name").value || "").trim();
      const template = (document.getElementById("template").value || "ubuntu").trim();
      const cores = Number(document.getElementById("cores").value || 2);
      const memory = Number(document.getElementById("memory").value || 2048);

      if (!name) return setOut({ ok: false, error: "Chybí název VM." });
      if (!Number.isInteger(cores) || cores < 1 || cores > 8) return setOut({ ok: false, error: "cores musí být 1–8." });
      if (!Number.isInteger(memory) || memory < 512 || memory > 16384) return setOut({ ok: false, error: "memory musí být 512–16384 MB." });
const storageKey = `create:${name}`;
let requestId = localStorage.getItem(storageKey);
if (!requestId) {
  requestId = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  localStorage.setItem(storageKey, requestId);
}

      setOut("Odesílám create…");
      const data = await apiPost("/api/vm/create", { name, template, cores, memory, requestId }); // 202 + upidClone

      setOut({ step: "clone-started", ...data });

      const rClone = await pollTask(data.upidClone, "Klonuji…");
      if (tClone.exitstatus && tClone.exitstatus !== "OK") throw new Error(`Clone failed: ${tClone.exitstatus}`);

      if (data.upidStart) {
        const tStart = await pollTask(data.upidStart);
        if (tStart.exitstatus && tStart.exitstatus !== "OK") throw new Error(`Start failed: ${tStart.exitstatus}`);
      }

      setOut({ ok: true, vmid: data.vmid, message: "Hotovo" });
    } catch (e) {
      setOut({ ok: false, error: String(e.message || e) });
      localStorage.removeItem(storageKey);
    }
  });
});
