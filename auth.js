// auth.js

function getRoleFromJwt(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json);
    return data.role || (data.admin ? "admin" : null) || null;
  } catch {
    return null;
  }
}

function getUserRole() {
  const token = localStorage.getItem("token");
  const fromJwt = token ? getRoleFromJwt(token) : null;
  return fromJwt || localStorage.getItem("role") || "user";
}

function applyRoleUI() {
  const role = getUserRole();
  document.documentElement.dataset.role = role;

  // vše s data-role="admin" uvidí jen admin
  document.querySelectorAll('[data-role="admin"]').forEach(el => {
    el.style.display = (role === "admin") ? "" : "none";
  });
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

document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  applyRoleUI();
  setupThemeToggle();
});

// export pro jiné skripty
window.__auth = { getUserRole, applyRoleUI, applyTheme };
