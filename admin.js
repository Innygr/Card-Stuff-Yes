"use strict";

const statusEl = document.getElementById("admin-status");
const userEl = document.getElementById("admin-user");
const contentEl = document.getElementById("admin-content");
const logoutButton = document.getElementById("logout-button");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "var(--color-error,#ff6666)" : "";
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Accept": "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || "Invalid server response." }; }

  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function verifyAdmin() {
  try {
    const data = await api("/api/admin/me");
    userEl.textContent = `Signed in as ${data.admin.username} (${data.admin.rank})`;
    setStatus("Admin session verified.");
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      window.location.replace("./admin-login.html");
      return;
    }
    setStatus(error.message, true);
  }
}

function renderSection(section) {
  const names = {
    dashboard: ["Dashboard", "Server and player overview."],
    sets: ["Set Manager", "Card/set management goes here."],
    packs: ["Pack Manager", "Pack configuration goes here."],
    news: ["News", "News publishing tools go here."],
    howtoplay: ["How to Play", "Player documentation tools go here."],
    players: ["Players", "Player management tools go here."],
    rewards: ["Rewards", "Reward distribution tools go here."],
    server: ["Server", "Server administration tools go here."]
  };
  const [title, description] = names[section] || names.dashboard;
  contentEl.innerHTML = `<h2>${title}</h2><p>${description}</p>`;
}

document.querySelectorAll("[data-section]").forEach(button => {
  button.addEventListener("click", () => renderSection(button.dataset.section));
});

logoutButton.addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
  } finally {
    window.location.replace("./admin-login.html");
  }
});

verifyAdmin();
