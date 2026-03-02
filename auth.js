// auth.js
var API_BASE = window.API_BASE || (window.API_BASE = "https://api.jisavl22.fun");

function getToken() {
  return localStorage.getItem("token");
}

function setSession({ token, role, pool, username }) {
  if (token) localStorage.setItem("token", token);
  if (role != null) localStorage.setItem("role", role);
  if (pool != null) localStorage.setItem("pool", pool);
  if (username != null) localStorage.setItem("username", username);
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("pool");
  localStorage.removeItem("username");
}

function authHeaders(extra = {}) {
  const t = getToken();
  return t ? { ...extra, Authorization: `Bearer ${t}` } : { ...extra };
}

async function apiFetch(path, options = {}) {
  const r = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });

  if (r.status === 401) {
    clearSession();
    if (document.body?.dataset?.requireAuth === "1") {
      window.location.href = "index.html";
    }
    throw new Error("Unauthorized");
  }

  const txt = await r.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = txt; }

  if (!r.ok) {
    const msg = data?.error || data?.message || String(data);
    throw new Error(`HTTP ${r.status}: ${msg}`);
  }
  return data;
}

async function syncWhoAmI() {
  // Server-side pravda: role/pool se bere z mapování, ne z tokenu
  const me = await apiFetch("/api/auth/whoami");
  // očekáváš: { ok:true, username, role, pool, pveId }
  setSession({
    username: me.username,
    role: me.role,
    pool: me.pool ?? "",
  });
  return me;
}

function applyRoleUI(role) {
  document.documentElement.dataset.role = role || "user";

  // jen admin
  document.querySelectorAll('[data-role="admin"]').forEach(el => {
    el.style.display = (role === "admin") ? "" : "none";
  });
}

function bindUserUI({ username, role, pool }) {
  document.querySelectorAll('[data-bind="username"]').forEach(el => el.textContent = username || "—");
  document.querySelectorAll('[data-bind="role"]').forEach(el => el.textContent = role || "—");
  document.querySelectorAll('[data-bind="pool"]').forEach(el => el.textContent = pool || "—");
}

function applyTheme() {
  const theme = localStorage.getItem("theme") || "light";
  document.body.classList.remove("theme-light", "theme-dark");
  document.body.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
  document.documentElement.dataset.theme = theme;
}

function setupThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const cur = localStorage.getItem("theme") || "light";
    const next = (cur === "dark") ? "light" : "dark";
    localStorage.setItem("theme", next);
    applyTheme();
  });
}

function setupLogout() {
  const a = document.getElementById("logoutLink");
  if (!a) return;
  a.addEventListener("click", (e) => {
    e.preventDefault();
    clearSession();
    window.location.href = "index.html";
  });
}

async function requireAuthPage() {
  if (document.body?.dataset?.requireAuth !== "1") return;
  if (!getToken()) {
    window.location.href = "index.html";
    return;
  }
  const me = await syncWhoAmI();
  applyRoleUI(me.role);
  bindUserUI(me);
}

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme();
  setupThemeToggle();
  setupLogout();

  try {
    await requireAuthPage();
  } catch {
    // redirect už proběhne
  }
});

window.__api = { apiFetch, syncWhoAmI, getToken, setSession, clearSession };
