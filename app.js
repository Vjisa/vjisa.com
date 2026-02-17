const API_BASE = "https://api.jisavl22.fun";
const api = (path) => `${API_BASE}${path}`;


function out(obj) {
  const el = document.getElementById("out");
  el.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

async function apiGet(path) {
  const r = await fetch(`${API_BASE}${path}`, { method: "GET" });
  const txt = await r.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = txt; }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${typeof data === "string" ? data : (data?.message || txt)}`);
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
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${typeof data === "string" ? data : (data?.message || txt)}`);
  return data;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnTest").addEventListener("click", async () => {
    try {
      out("Volám /api/test …");
      const data = await apiGet("/api/test");
      out(data);
    } catch (e) {
      out({ ok: false, error: String(e.message || e) });
    }
  });

  document.getElementById("btnCreate").addEventListener("click", async () => {
    async function pollTask(upid) {
  while (true) {
    const r = await apiGet(`/api/task/status?upid=${encodeURIComponent(upid)}`);
    const t = r.task;
    out.textContent = `Task: ${t.type}\nStatus: ${t.status}\nExit: ${t.exitstatus || ""}`;

    if (t.status === "stopped") {
      if (t.exitstatus === "OK") return true;
      throw new Error(`Task failed: ${t.exitstatus || "unknown"}`);
    }
    await new Promise(res => setTimeout(res, 3000));
  }
}

    const name = (document.getElementById("name").value || "").trim();
    const newidRaw = (document.getElementById("newid").value || "").trim();
    const newid = Number(newidRaw);

    if (!name) return out({ ok: false, error: "Chybí název VM." });
    if (!Number.isInteger(newid) || newid < 100 || newid > 999999) {
      return out({ ok: false, error: "VMID musí být celé číslo (doporučuju >= 100)." });
    }

    const resp = await fetch(`${API_BASE}/api/vm/create`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload) // payload = {name, template, cores, memory}
});

const out = await resp.json();

if (!resp.ok || out.ok === false) {
  throw new Error(out.error || `Create HTTP ${resp.status}`);
}

// tady máš UPID(y) z backendu
const { vmid, upidClone, upidStart } = out;

// 1) počkej na clone
await pollTask(upidClone);

// 2) počkej na start (pokud ho vracíš)
if (upidStart) await pollTask(upidStart);

// tady už jen vypiš úspěch do UI
console.log("Hotovo, VMID:", vmid);

  });
});
