// background.js — MV3 service worker
// config.js is NOT imported here (service workers can't share scripts with content).
// Duplicate the origin constant here so the service worker is self-contained.
const VISBY_ORIGIN_BG = 'https://visby.me';

// ── Partner-check with session-cache ─────────────────────────────────────────

async function checkPartner(domain) {
  const cacheKey = 'partner:' + domain;

  // Try session cache first (cleared when the browser session ends).
  const cached = await chrome.storage.session.get(cacheKey).catch(() => ({}));
  if (cached[cacheKey] !== undefined) return cached[cacheKey];

  let result = { partner: false, merchant_name: null };
  try {
    const resp = await fetch(
      `${VISBY_ORIGIN_BG}/api/sdk/partner-check?domain=${encodeURIComponent(domain)}`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    if (resp.ok) result = await resp.json();
  } catch {
    // Network error → treat as non-partner; do not cache so a retry is allowed.
    return result;
  }

  await chrome.storage.session.set({ [cacheKey]: result }).catch(() => {});
  return result;
}

// ── Auth state helpers ────────────────────────────────────────────────────────
// Full Privy auth is a future iteration. These handlers define the message
// contract so popup and content scripts can already call them.

async function getAuth() {
  const { visbyAuth } = await chrome.storage.local.get('visbyAuth').catch(() => ({}));
  return visbyAuth ?? null;
}

async function setAuth(payload) {
  await chrome.storage.local.set({ visbyAuth: payload }).catch(() => {});
  return true;
}

// ── Message router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === 'partnerCheck') {
    checkPartner(msg.domain).then(sendResponse);
    return true; // keep channel open for async sendResponse
  }

  if (msg.type === 'getAuth') {
    getAuth().then(sendResponse);
    return true;
  }

  if (msg.type === 'setAuth') {
    setAuth(msg.payload).then(sendResponse);
    return true;
  }

  if (msg.type === 'openCheckout') {
    chrome.tabs.create({ url: msg.url });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// ── External auth relay (blueprint 5.4) ─────────────────────────────────────────
// The web page at VISBY_ORIGIN/extension-auth relays the user's Privy session token here after they
// sign in (Privy's web SDK can't run in an MV3 popup). Only origins in the manifest's
// `externally_connectable.matches` can reach this listener; we additionally verify the sender origin
// as defense-in-depth before trusting a relayed token.
const ALLOWED_AUTH_ORIGINS = ['https://app.visby.me', 'https://visby.me', 'http://localhost:3000'];

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const origin = sender && sender.origin;
  if (!origin || !ALLOWED_AUTH_ORIGINS.includes(origin)) { sendResponse({ ok: false }); return false; }
  if (!msg || msg.type !== 'visbyAuth' || !msg.payload || typeof msg.payload.token !== 'string') {
    sendResponse({ ok: false });
    return false;
  }
  setAuth(msg.payload).then(() => sendResponse({ ok: true }));
  return true; // async sendResponse
});
