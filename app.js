const API_BASE = "https://api.jisavl22.fun";

async function apiTest() {
  const out = document.getElementById("out");
  out.textContent = "Testuji backend...";

  try {
    const r = await fetch(`${API_BASE}/api/test`, { method: "GET" });
    const data = await r.json();
    out.textContent = `OK (${r.status}): ${JSON.stringify(data)}`;
  } catch (e) {
    out.textContent = `CHYBA: ${e.message}`;
  }
}

async function vmCreate() {
  const out = document.getElementById("out");
  const name = document.getElementById("vm_name").value.trim();
  const newidRaw = document.getElementById("vm_newid").value.trim();
  const newid = Number(newidRaw);

  if (!name) return (out.textContent = "Chybí name");
  if (!Number.isInteger(newid) || newid < 100 || newid > 999999) {
    return (out.textContent = "Neplatné newid (doporučuju 100–999999)");
  }

  out.textContent = "Vytvářím VM (clone)...";

  try {
    const r = await fetch(`${API_BASE}/api/vm/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, newid }),
    });

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!r.ok) {
      out.textContent = `HTTP ${r.status}: ${JSON.stringify(data)}`;
      return;
    }

    out.textContent = `OK (${r.status}): ${JSON.stringify(data)}`;
  } catch (e) {
    out.textContent = `CHYBA: ${e.message}`;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const btnTest = document.getElementById("btn_test");
  const btnCreate = document.getElementById("btn_create");

  if (btnTest) btnTest.addEventListener("click", apiTest);
  if (btnCreate) btnCreate.addEventListener("click", vmCreate);
});
