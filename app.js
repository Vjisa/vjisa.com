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
    const name = (document.getElementById("name").value || "").trim();
    const newidRaw = (document.getElementById("newid").value || "").trim();
    const newid = Number(newidRaw);

    if (!name) return out({ ok: false, error: "Chybí název VM." });
    if (!Number.isInteger(newid) || newid < 100 || newid > 999999) {
      return out({ ok: false, error: "VMID musí být celé číslo (doporučuju >= 100)." });
    }

    try {
      out("Volám /api/vm/create …");
      const data = await apiPost("/api/vm/create", { name, newid });
      out(data);
    } catch (e) {
      out({ ok: false, error: String(e.message || e) });
    }
  });
});
