import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getDatabase, onValue, ref } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";
import { summarizeStatistics } from "./stats-core.mjs?v=1";

const adminEmail = "admin@artjewelry.work";
const firebaseApp = initializeApp(window.ARTJEWELRY_FIREBASE_CONFIG, "artjewelry-admin");
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);
const authReady = setPersistence(auth, inMemoryPersistence);
let unsubscribe = null;
let dashboard = null;

const formatNumber = new Intl.NumberFormat();
const formatDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function setState(state, message) {
  if (!dashboard) return;
  dashboard.dataset.state = state;
  const status = dashboard.querySelector("[data-stats-status]");
  if (status) status.textContent = message;
}

function setMetric(name, value) {
  const element = dashboard?.querySelector(`[data-stat="${name}"]`);
  if (element) element.textContent = value;
}

function relativeTime(timestamp) {
  if (!timestamp) return "Unknown";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return formatDate.format(timestamp);
}

function renderLinks(links) {
  links.forEach((link) => {
    const card = dashboard.querySelector(`[data-link-card="${link.type}"]`);
    if (!card) return;
    card.querySelector("[data-link-total]").textContent = formatNumber.format(link.total);
    card.querySelector("[data-link-rate]").textContent = `${link.userRate}% of visitors`;
    card.querySelector("[data-link-unique]").textContent = `${formatNumber.format(link.uniqueUsers)} unique`;
    card.querySelector("[data-link-share]").textContent = `${link.share}% share`;
    card.style.setProperty("--link-rate", `${Math.max(2, link.userRate)}%`);
  });
}

function renderTrend(days) {
  const chart = dashboard.querySelector("[data-stats-trend]");
  if (!chart) return;
  const max = Math.max(1, ...days.flatMap((day) => [day.sessions, day.clicks]));
  chart.innerHTML = days.map((day) => `
    <div class="stats-day">
      <div class="stats-bars" title="${day.label} · ${day.sessions} sessions · ${day.clicks} clicks" aria-label="${day.label}: ${day.sessions} sessions, ${day.clicks} clicks">
        <i class="stats-bar is-sessions" style="--bar:${Math.max(3, (day.sessions / max) * 100)}%"></i>
        <i class="stats-bar is-clicks" style="--bar:${Math.max(3, (day.clicks / max) * 100)}%"></i>
      </div>
      <span>${day.label}</span>
    </div>
  `).join("");
}

function renderRecent(users) {
  const body = dashboard.querySelector("[data-stats-users]");
  if (!body) return;
  if (!users.length) {
    body.innerHTML = '<tr><td colspan="4">No visitors recorded yet.</td></tr>';
    return;
  }
  body.innerHTML = users.map((user) => {
    const shortUid = `${user.uid.slice(0, 7)}…${user.uid.slice(-4)}`;
    return `
      <tr>
        <td>
          <span class="stats-uid">
            <code>${shortUid}</code>
            <button type="button" class="stats-copy" data-copy-uid="${user.uid}" aria-label="Copy full visitor ID" title="Copy full ID">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
            </button>
          </span>
        </td>
        <td>${relativeTime(user.lastAt)}</td>
        <td>${formatNumber.format(user.visitCount)}</td>
        <td>${formatNumber.format(user.clickCount)}</td>
      </tr>
    `;
  }).join("");
}

function handleCopyClick(event) {
  const button = event.target.closest("[data-copy-uid]");
  if (!button) return;
  const uid = button.getAttribute("data-copy-uid");
  navigator.clipboard?.writeText(uid).then(() => {
    button.classList.add("is-copied");
    window.setTimeout(() => button.classList.remove("is-copied"), 1200);
  }).catch(() => {});
}

function renderStatistics(rawUsers) {
  const stats = summarizeStatistics(rawUsers);
  setMetric("total-users", formatNumber.format(stats.totalUsers));
  setMetric("new-today", formatNumber.format(stats.newToday));
  setMetric("active-now", formatNumber.format(stats.activeNow));
  setMetric("active-7d", formatNumber.format(stats.active7d));
  setMetric("active-30d", formatNumber.format(stats.active30d));
  setMetric("sessions", formatNumber.format(stats.sessionTotal));
  setMetric("today-sessions", `${formatNumber.format(stats.todaySessions)} today`);
  setMetric("clicks", formatNumber.format(stats.clickTotal));
  setMetric("today-clicks", `${formatNumber.format(stats.todayClicks)} today`);
  setMetric("returning-rate", `${stats.returningRate}%`);
  setMetric("returning-detail", `${formatNumber.format(stats.returningUsers)} returning visitors`);
  setMetric("engaged-rate", `${stats.engagedRate}%`);
  setMetric("engaged-detail", `${formatNumber.format(stats.engagedUsers)} visitors clicked`);
  setMetric("sessions-user", stats.sessionsPerUser.toFixed(1));
  setMetric("clicks-session", stats.clicksPerSession.toFixed(2));
  renderLinks(stats.links);
  renderTrend(stats.days);
  renderRecent(stats.recentUsers);
  setState("ready", `Live · updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
}

async function authenticate(password) {
  await authReady;
  await signOut(auth).catch(() => {});
  return signInWithEmailAndPassword(auth, adminEmail, password);
}

async function open() {
  dashboard = document.getElementById("analyticsDashboard");
  if (!dashboard) return;
  if (!dashboard.dataset.copyBound) {
    dashboard.addEventListener("click", handleCopyClick);
    dashboard.dataset.copyBound = "true";
  }
  setState("loading", "Connecting securely…");

  try {
    await authReady;
    if (!auth.currentUser) {
      setState("error", "Your secure session has expired. Log out and sign in again.");
      return;
    }
    if (unsubscribe) unsubscribe();
    unsubscribe = onValue(
      ref(database, "users"),
      (snapshot) => renderStatistics(snapshot.val() || {}),
      () => setState("error", "Analytics access was denied. Publish the latest database rules.")
    );
  } catch (error) {
    setState("error", "Analytics connection failed. Log out and sign in again.");
  }
}

async function close() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  dashboard = null;
  await signOut(auth).catch(() => {});
}

window.ARTJEWELRY_ADMIN_STATS = Object.freeze({ authenticate, open, close });
document.dispatchEvent(new Event("artjewelry-admin-stats-ready"));
