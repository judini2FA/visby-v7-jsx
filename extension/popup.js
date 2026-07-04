// popup.js — toolbar popup logic
// config.js is loaded before this file (see popup.html script order).

(function () {
  'use strict';

  const signinBtn = document.getElementById('signin-btn');
  const openVisbytBtn = document.getElementById('open-visby-btn');
  const signedOutView = document.getElementById('signed-out-view');
  const methodsList = document.getElementById('methods-list');

  function openTab(url) {
    chrome.tabs.create({ url });
  }

  // Blueprint 5.4 — sign in through the auth-relay page, passing this extension's id so the page can
  // hand the Privy session token back to the extension after login (Privy can't run in the popup).
  signinBtn.addEventListener('click', () => openTab(VISBY_ORIGIN + '/extension-auth?ext=' + encodeURIComponent(chrome.runtime.id)));
  openVisbytBtn.addEventListener('click', () => openTab(VISBY_ORIGIN));

  // ── Auth state ─────────────────────────────────────────────────────────────

  function renderMethods(methods) {
    if (!methods || methods.length === 0) return;

    signedOutView.style.display = 'none';
    signinBtn.style.display = 'none';
    methodsList.style.display = 'flex';

    methods.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'method-row';
      // Inline SVG card icon — no emojis
      row.innerHTML = `
        <svg width="20" height="14" viewBox="0 0 20 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x=".5" y=".5" width="19" height="13" rx="2.5" stroke="rgba(26,18,40,.25)"/>
          <rect y="3" width="20" height="3" fill="rgba(26,18,40,.1)"/>
        </svg>
        <span>${m.label || 'Visby method'}</span>
      `;
      methodsList.appendChild(row);
    });
  }

  function renderSignedOut() {
    signedOutView.style.display = 'block';
    signinBtn.style.display = 'block';
    methodsList.style.display = 'none';
  }

  // ── Fetch payment methods (scaffolded — real auth in future iteration) ──────
  // Checks auth state from background, then tries to load methods from the API.
  // Falls back gracefully to signed-out state on any error.

  async function loadMethods(authPayload) {
    try {
      const resp = await fetch(VISBY_ORIGIN + '/api/payment-methods/order', {
        headers: {
          'Content-Type': 'application/json',
          // Future: send Privy session token once auth flow is wired
          ...(authPayload && authPayload.token
            ? { Authorization: 'Bearer ' + authPayload.token }
            : {}),
        },
      });
      if (!resp.ok) return renderSignedOut();
      const data = await resp.json();
      const methods = Array.isArray(data) ? data : data.methods || [];
      if (methods.length > 0) {
        renderMethods(methods);
      } else {
        renderSignedOut();
      }
    } catch {
      renderSignedOut();
    }
  }

  // Ask the background for auth state, then try to load methods.
  function checkAuth() {
    chrome.runtime.sendMessage({ type: 'getAuth' }, (authPayload) => {
      if (chrome.runtime.lastError || !authPayload) {
        renderSignedOut();
        return;
      }
      loadMethods(authPayload);
    });
  }

  // Re-render live when the auth-relay page (5.4) drops a token into storage while this popup is open.
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.visbyAuth) checkAuth();
    });
  }

  checkAuth();

})();
