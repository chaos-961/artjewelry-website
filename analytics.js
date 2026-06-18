import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getDatabase,
  increment,
  ref,
  serverTimestamp,
  update
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

const visitSessionCookie = "artjewelry_visit_session";
const trackingTimeoutMs = 1500;
const validLinks = new Set(["email", "phone", "whatsapp"]);

function isFirebaseConfigured(config) {
  return Boolean(
    config
    && typeof config.apiKey === "string"
    && !config.apiKey.startsWith("PASTE_")
    && typeof config.appId === "string"
    && !config.appId.startsWith("PASTE_")
    && typeof config.authDomain === "string"
    && !config.authDomain.startsWith("PASTE_")
    && typeof config.databaseURL === "string"
    && !config.databaseURL.startsWith("PASTE_")
    && typeof config.projectId === "string"
    && !config.projectId.startsWith("PASTE_")
  );
}

function getVisitSessionId() {
  const cookie = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${visitSessionCookie}=`));

  return cookie ? decodeURIComponent(cookie.slice(visitSessionCookie.length + 1)) : "";
}

function createEventId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function setVisitSessionCookie(sessionId) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${visitSessionCookie}=${encodeURIComponent(sessionId)}; Path=/; SameSite=Lax${secure}`;
}

async function initializeStatistics() {
  const config = window.ARTJEWELRY_FIREBASE_CONFIG;

  if (!isFirebaseConfigured(config)) {
    throw new Error("Firebase statistics are waiting for the Art Jewelry Web App configuration.");
  }

  const firebaseApp = initializeApp(config);
  const auth = getAuth(firebaseApp);

  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.warn("Firebase Auth persistence is unavailable; using this page session.", error);
  }

  await auth.authStateReady();
  const user = auth.currentUser || (await signInAnonymously(auth)).user;

  return {
    createdAt: Date.parse(user.metadata.creationTime) || Date.now(),
    database: getDatabase(firebaseApp),
    uid: user.uid
  };
}

const statisticsContextPromise = initializeStatistics().catch((error) => {
  console.warn(error.message);
  return null;
});

async function getStatisticsContext() {
  const context = await statisticsContextPromise;

  if (!context) {
    throw new Error("Firebase statistics are unavailable.");
  }

  return context;
}

async function recordSessionVisit() {
  const context = await getStatisticsContext();
  const existingSessionId = getVisitSessionId();
  const basePath = `users/${context.uid}`;
  const updates = {
    [`${basePath}/profile/createdAt`]: context.createdAt,
    [`${basePath}/activity/lastSeenAt`]: serverTimestamp()
  };

  if (existingSessionId) {
    await update(ref(context.database), updates).catch(() => {});
    return;
  }

  const sessionId = createEventId();
  updates[`${basePath}/visits/count`] = increment(1);
  updates[`${basePath}/visits/lastAt`] = serverTimestamp();
  updates[`${basePath}/sessionHistory/${sessionId}/startedAt`] = serverTimestamp();

  try {
    await update(ref(context.database), updates);
  } catch {
    await update(ref(context.database), {
      [`${basePath}/visits/count`]: increment(1),
      [`${basePath}/visits/lastAt`]: serverTimestamp()
    });
  }
  setVisitSessionCookie(sessionId);
}

async function recordLinkClick(linkName) {
  if (!validLinks.has(linkName)) {
    return Promise.reject(new Error("Unknown tracked link."));
  }

  const context = await getStatisticsContext();
  const basePath = `users/${context.uid}`;
  const eventId = createEventId();

  try {
    await update(ref(context.database), {
      [`${basePath}/profile/createdAt`]: context.createdAt,
      [`${basePath}/activity/lastSeenAt`]: serverTimestamp(),
      [`${basePath}/linkClicks/${linkName}/count`]: increment(1),
      [`${basePath}/linkClicks/${linkName}/lastAt`]: serverTimestamp(),
      [`${basePath}/clickHistory/${eventId}/type`]: linkName,
      [`${basePath}/clickHistory/${eventId}/at`]: serverTimestamp()
    });
  } catch {
    await update(ref(context.database), {
      [`${basePath}/linkClicks/${linkName}/count`]: increment(1),
      [`${basePath}/linkClicks/${linkName}/lastAt`]: serverTimestamp()
    });
  }
}

// email (mailto:) and phone (tel:) hand off to another app without unloading
// the page, and WhatsApp opens in a new tab (target="_blank"), so the current
// page stays alive long enough for a fire-and-forget write to land. We never
// block the user's navigation: the click is recorded in the background.
function handleTrackedLinkClick(event) {
  const link = event.target instanceof Element
    ? event.target.closest("a[data-track-link]")
    : null;

  if (!link || event.defaultPrevented || event.button !== 0) return;

  const linkName = link.dataset.trackLink;
  if (!validLinks.has(linkName)) return;

  void Promise.race([
    recordLinkClick(linkName).catch(() => {}),
    new Promise((resolve) => window.setTimeout(resolve, trackingTimeoutMs))
  ]);
}

document.addEventListener("click", handleTrackedLinkClick);
void recordSessionVisit().catch((error) => {
  console.warn("Visit tracking failed.", error);
});
