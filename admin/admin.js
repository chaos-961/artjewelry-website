/*
 * Admin sign-in. The password unlocks a local data bundle and signs in to the
 * backend; access to private data is enforced by the backend account and the
 * database rules. The password is never hard-coded — it lives only in the
 * gitignored .env.local and is used to (re)generate admin/payload.js.
 */
(function () {
  const form = document.getElementById("adminLoginForm");
  const passwordInput = document.getElementById("adminPassword");
  const passwordToggle = document.getElementById("adminPasswordToggle");
  const submitButton = document.getElementById("adminSubmit");
  const status = document.getElementById("adminStatus");
  const loginView = document.getElementById("loginView");
  const adminContent = document.getElementById("adminContent");
  const logoutButton = document.getElementById("adminLogout");

  const payload = window.ARTJEWELRY_ADMIN_PAYLOAD;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let failedAttempts = 0;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  };

  const base64ToBytes = (value) => {
    const binary = window.atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  };

  const deriveKey = async (password, salt, iterations) => {
    const baseKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
  };

  const decryptPayload = async (password) => {
    if (!payload || payload.algorithm !== "AES-GCM" || payload.kdf !== "PBKDF2-SHA-256") {
      throw new Error("Missing admin payload.");
    }

    const salt = base64ToBytes(payload.salt);
    const iv = base64ToBytes(payload.iv);
    const ciphertext = base64ToBytes(payload.ciphertext);
    const key = await deriveKey(password, salt, payload.iterations);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return JSON.parse(decoder.decode(plaintext));
  };

  const analyticsMarkup = `
    <section class="stats-dashboard" id="analyticsDashboard" data-state="loading" aria-labelledby="stats-title">
      <div class="stats-heading">
        <div>
          <p class="stats-kicker">Private analytics</p>
          <h2 id="stats-title">Audience pulse</h2>
          <p class="stats-caption">Live totals, contact intent, and visitor activity for artjewelry.work.</p>
        </div>
        <p class="stats-status" data-stats-status role="status" aria-live="polite">Connecting securely…</p>
      </div>

      <div class="stats-metrics" aria-label="Audience overview">
        <article class="stats-metric is-primary"><span>Total unique</span><strong data-stat="total-users">—</strong><small>anonymous visitors</small></article>
        <article class="stats-metric"><span>New today</span><strong data-stat="new-today">—</strong><small>first-time visitors</small></article>
        <article class="stats-metric"><span>Active now</span><strong data-stat="active-now">—</strong><small>last 15 minutes</small></article>
        <article class="stats-metric"><span>Active 7 days</span><strong data-stat="active-7d">—</strong><small>unique visitors</small></article>
        <article class="stats-metric"><span>Active 30 days</span><strong data-stat="active-30d">—</strong><small>unique visitors</small></article>
        <article class="stats-metric"><span>Sessions</span><strong data-stat="sessions">—</strong><small data-stat="today-sessions">— today</small></article>
        <article class="stats-metric"><span>Contact actions</span><strong data-stat="clicks">—</strong><small data-stat="today-clicks">— today</small></article>
      </div>

      <div class="stats-section-head"><div><span>Conversion paths</span><h3>What visitors choose</h3></div><small>Unique clickers ÷ total visitors</small></div>
      <div class="stats-links">
        <article class="stats-link" data-link-card="email"><span>Email</span><strong data-link-total>—</strong><div class="stats-rate"><i></i></div><p><b data-link-rate>—</b><small data-link-unique>—</small><small data-link-share>—</small></p></article>
        <article class="stats-link" data-link-card="phone"><span>Phone</span><strong data-link-total>—</strong><div class="stats-rate"><i></i></div><p><b data-link-rate>—</b><small data-link-unique>—</small><small data-link-share>—</small></p></article>
        <article class="stats-link" data-link-card="whatsapp"><span>WhatsApp</span><strong data-link-total>—</strong><div class="stats-rate"><i></i></div><p><b data-link-rate>—</b><small data-link-unique>—</small><small data-link-share>—</small></p></article>
      </div>

      <div class="stats-detail-grid">
        <article class="stats-panel stats-trend-panel">
          <div class="stats-panel-head"><div><span>Last 7 days</span><h3>Sessions + clicks</h3></div><div class="stats-legend"><i></i>Sessions <i></i>Clicks</div></div>
          <div class="stats-trend" data-stats-trend aria-label="Seven day activity chart"></div>
        </article>
        <article class="stats-panel stats-insights">
          <div class="stats-panel-head"><div><span>Quality</span><h3>Audience signals</h3></div></div>
          <dl>
            <div><dt>Returning rate</dt><dd data-stat="returning-rate">—</dd><small data-stat="returning-detail">—</small></div>
            <div><dt>Engaged visitors</dt><dd data-stat="engaged-rate">—</dd><small data-stat="engaged-detail">—</small></div>
            <div><dt>Sessions / visitor</dt><dd data-stat="sessions-user">—</dd></div>
            <div><dt>Clicks / session</dt><dd data-stat="clicks-session">—</dd></div>
          </dl>
        </article>
      </div>

      <article class="stats-panel stats-users-panel">
        <div class="stats-panel-head"><div><span>Recent activity</span><h3>Anonymous visitors</h3></div><small>IDs are shortened for display</small></div>
        <div class="stats-table-wrap"><table><thead><tr><th>User</th><th>Last active</th><th>Sessions</th><th>Actions</th></tr></thead><tbody data-stats-users><tr><td colspan="4">Loading visitors…</td></tr></tbody></table></div>
      </article>
    </section>
  `;

  const getAdminStats = () => new Promise((resolve, reject) => {
    if (window.ARTJEWELRY_ADMIN_STATS) {
      resolve(window.ARTJEWELRY_ADMIN_STATS);
      return;
    }

    const timeout = window.setTimeout(() => {
      reject(new Error("Admin authentication failed to load."));
    }, 8000);

    document.addEventListener("artjewelry-admin-stats-ready", () => {
      window.clearTimeout(timeout);
      resolve(window.ARTJEWELRY_ADMIN_STATS);
    }, { once: true });
  });

  const connectAdminStats = () => {
    const connect = () => window.ARTJEWELRY_ADMIN_STATS?.open();
    if (window.ARTJEWELRY_ADMIN_STATS) {
      connect();
      return;
    }
    document.addEventListener("artjewelry-admin-stats-ready", connect, { once: true });
  };

  const renderAdmin = (bundle) => {
    // The dashboard is fully defined in analyticsMarkup; the decrypted bundle
    // is optional extra content (kept for parity with the shared admin design).
    if (bundle && bundle.css) {
      const style = document.createElement("style");
      style.id = "adminPayloadStyles";
      style.textContent = bundle.css;
      document.head.appendChild(style);
    }

    adminContent.innerHTML = analyticsMarkup + (bundle && bundle.html ? bundle.html : "");
    loginView.hidden = true;
    adminContent.hidden = false;
    logoutButton.hidden = false;
    document.body.classList.add("is-authed");

    if (bundle && bundle.script) {
      const script = document.createElement("script");
      script.id = "adminPayloadScript";
      script.textContent = bundle.script;
      document.body.appendChild(script);
    }

    connectAdminStats();
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const setBusy = (busy) => {
    form.classList.toggle("is-busy", busy);
    submitButton.disabled = busy;
    passwordInput.disabled = busy;
  };

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  if (!window.crypto || !window.crypto.subtle) {
    setStatus("This browser cannot open the admin page.", true);
    setBusy(true);
    return;
  }

  logoutButton.addEventListener("click", () => {
    window.ARTJEWELRY_ADMIN_STATS?.close();
    window.location.reload();
  });

  passwordToggle?.addEventListener("click", () => {
    const reveal = passwordInput.type === "password";
    passwordInput.type = reveal ? "text" : "password";
    passwordToggle.textContent = reveal ? "Hide" : "Show";
    passwordToggle.setAttribute("aria-pressed", String(reveal));
    passwordToggle.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
    passwordInput.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    let password = passwordInput.value;

    setBusy(true);
    setStatus("Logging in...");

    try {
      const stats = await getAdminStats();
      const [bundle] = await Promise.all([
        decryptPayload(password),
        stats.authenticate(password)
      ]);
      failedAttempts = 0;
      passwordInput.value = "";
      renderAdmin(bundle);
      password = "";
    } catch (error) {
      await window.ARTJEWELRY_ADMIN_STATS?.close();
      password = "";
      failedAttempts += 1;
      await wait(Math.min(2200, 400 * failedAttempts));
      passwordInput.value = "";
      if (passwordToggle && passwordInput.type === "text") {
        passwordInput.type = "password";
        passwordToggle.textContent = "Show";
        passwordToggle.setAttribute("aria-pressed", "false");
        passwordToggle.setAttribute("aria-label", "Show password");
      }
      passwordInput.focus();
      setBusy(false);
      setStatus("Check the password.", true);
    }
  });
})();
