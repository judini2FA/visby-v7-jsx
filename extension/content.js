// content.js — injected at document_idle on every page.
// config.js is injected before this file (see manifest.json content_scripts order).

(function () {
  'use strict';

  // Idempotent guard — never inject twice in the same page lifetime.
  if (window.__visbyInjected) return;
  window.__visbyInjected = true;

  // Per-session dismiss flag — reset on navigation / tab close.
  let dismissed = false;

  // ── Checkout detection ──────────────────────────────────────────────────────
  // Score-based: only act when score >= THRESHOLD to minimise false positives.
  const THRESHOLD = 3;

  function score() {
    let s = 0;

    // Strong signals (each = 2 pts)
    if (document.querySelector('input[autocomplete~="cc-number"]')) s += 2;
    if (document.querySelector('iframe[src*="js.stripe.com"]')) s += 2;
    if (document.querySelector('#checkout, [data-shopify]')) s += 2;

    // Medium signals (each = 1 pt)
    if (document.querySelector('input[name*="card" i]')) s += 1;
    if (document.querySelector('input[name*="credit" i]')) s += 1;
    if (document.querySelector('input[autocomplete*="cc" i]')) s += 1;

    // Button / text signals (1 pt if found)
    const btnRx = /pay now|place order|complete (purchase|order)|checkout/i;
    const buttons = document.querySelectorAll('button, [type="submit"], [role="button"]');
    for (const btn of buttons) {
      if (btnRx.test(btn.textContent)) { s += 1; break; }
    }

    // Price near a submit control (1 pt)
    const priceRx = /\$[\d,]+\.?\d{0,2}|USD\s[\d,]+|£[\d,]+|€[\d,]+/;
    if (priceRx.test(document.body.innerText || '')) s += 1;

    return s;
  }

  // ── Shadow DOM pill + panel ─────────────────────────────────────────────────

  function buildUI(partnerResult) {
    if (dismissed) return;

    const host = document.createElement('div');
    host.id = 'visby-ext-root';
    host.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:20px',
      'z-index:2147483647',
      'font-family:-apple-system,system-ui,"Segoe UI",sans-serif',
    ].join(';');
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });

    const isPartner = partnerResult && partnerResult.partner;
    const merchantName = (partnerResult && partnerResult.merchant_name) || null;

    const css = `
      *{box-sizing:border-box;margin:0;padding:0;}
      .pill{
        display:inline-flex;align-items:center;gap:8px;
        padding:10px 18px;border-radius:999px;cursor:pointer;
        background:linear-gradient(135deg,#25CDB8,#2A8AED 50%,#BC2DE6);
        color:#fff;font-size:14px;font-weight:600;letter-spacing:-.01em;
        box-shadow:0 4px 20px rgba(37,205,184,.35),0 1px 4px rgba(0,0,0,.18);
        border:none;outline:none;
        transition:transform .1s ease,box-shadow .15s ease;
        -webkit-tap-highlight-color:transparent;
      }
      .pill:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(37,205,184,.4),0 2px 6px rgba(0,0,0,.2);}
      .pill:active{transform:translateY(0);}
      .pill svg{flex-shrink:0;}

      .panel{
        display:none;
        flex-direction:column;gap:0;
        width:320px;
        background:rgba(255,255,255,.72);
        backdrop-filter:blur(20px) saturate(1.5);
        -webkit-backdrop-filter:blur(20px) saturate(1.5);
        border:1px solid rgba(255,255,255,.55);
        border-radius:20px;
        box-shadow:0 8px 40px rgba(37,205,184,.18),0 2px 12px rgba(0,0,0,.14);
        overflow:hidden;
      }
      .panel.open{display:flex;}

      .panel-header{
        display:flex;align-items:center;justify-content:space-between;
        padding:14px 16px 10px;
        background:linear-gradient(135deg,#25CDB8,#2A8AED 50%,#BC2DE6);
      }
      .wordmark{
        font-size:18px;font-weight:700;letter-spacing:-.02em;color:#fff;
        display:flex;align-items:center;gap:6px;
      }
      .close-btn{
        background:rgba(255,255,255,.25);border:none;border-radius:50%;
        width:26px;height:26px;cursor:pointer;color:#fff;
        display:flex;align-items:center;justify-content:center;
        font-size:14px;font-weight:700;
        transition:background .15s;
      }
      .close-btn:hover{background:rgba(255,255,255,.4);}

      .panel-body{padding:16px;}

      .nft-badge{
        display:flex;align-items:center;gap:8px;
        padding:10px 12px;border-radius:12px;
        font-size:13px;font-weight:600;line-height:1.3;
        margin-bottom:14px;
      }
      .nft-badge.partner{
        background:rgba(37,205,184,.12);
        color:#0d8c7c;
        border:1px solid rgba(37,205,184,.3);
      }
      .nft-badge.non-partner{
        background:rgba(255,59,92,.08);
        color:#b5142a;
        border:1px solid rgba(255,59,92,.25);
      }
      .nft-badge svg{flex-shrink:0;}

      .coming-soon{
        font-size:12px;color:rgba(60,50,80,.65);line-height:1.5;
        margin-bottom:14px;
        padding:10px 12px;
        background:rgba(100,80,120,.06);
        border-radius:10px;
      }

      .cta-btn{
        width:100%;padding:13px;border-radius:999px;
        background:linear-gradient(135deg,#25CDB8,#2A8AED 50%,#BC2DE6);
        color:#fff;font-size:15px;font-weight:700;
        border:none;cursor:pointer;letter-spacing:-.01em;
        box-shadow:0 3px 14px rgba(37,205,184,.3);
        transition:filter .15s,box-shadow .15s;
      }
      .cta-btn:hover{filter:brightness(1.06);box-shadow:0 4px 18px rgba(37,205,184,.4);}
    `;

    const style = document.createElement('style');
    style.textContent = css;
    shadow.appendChild(style);

    // ── Pill ─────────────────────────────────────────────────────────────────
    const pill = document.createElement('button');
    pill.className = 'pill';
    pill.setAttribute('aria-label', 'Pay with Visby');
    pill.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="white" stroke-width="2" stroke-linejoin="round"/>
        <path d="M12 7l5 3v4l-5 3-5-3v-4l5-3z" fill="white" fill-opacity=".6"/>
      </svg>
      Pay with Visby
    `;

    // ── Panel ─────────────────────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.className = 'panel';

    const headerTitle = merchantName
      ? `Visby at ${merchantName}`
      : 'Pay with Visby';

    panel.innerHTML = `
      <div class="panel-header">
        <span class="wordmark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="white" stroke-width="2" stroke-linejoin="round"/>
            <path d="M12 7l5 3v4l-5 3-5-3v-4l5-3z" fill="white" fill-opacity=".7"/>
          </svg>
          ${headerTitle}
        </span>
        <button class="close-btn" aria-label="Dismiss">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1l10 10M11 1L1 11" stroke="white" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="panel-body">
        ${isPartner ? `
          <div class="nft-badge partner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 12l2 2 4-4" stroke="#0d8c7c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="12" cy="12" r="9" stroke="#0d8c7c" stroke-width="2"/>
            </svg>
            Includes Visby NFT provenance — ownership recorded on Solana.
          </div>
        ` : `
          <div class="nft-badge non-partner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="9" stroke="#b5142a" stroke-width="2"/>
              <path d="M12 7v6M12 16v1" stroke="#b5142a" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
            Payment only — no provenance NFT (this is not a Visby partner store).
          </div>
          <div class="coming-soon">
            Pay with Visby card payment is coming to this store. The card rail is not live yet — your Visby methods are shown read-only below.
          </div>
        `}
        ${isPartner ? `
          <button class="cta-btn" id="visby-continue">Continue with Visby</button>
        ` : `
          <button class="cta-btn" id="visby-signin" style="background:rgba(100,80,120,.12);color:rgba(40,32,60,.75);box-shadow:none;">
            Sign in to Visby to see your methods
          </button>
        `}
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:10px;';
    wrapper.appendChild(panel);
    wrapper.appendChild(pill);
    shadow.appendChild(wrapper);

    // ── Events ────────────────────────────────────────────────────────────────

    pill.addEventListener('click', () => {
      panel.classList.toggle('open');
    });

    const closeBtn = panel.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
      dismissed = true;
      host.remove();
    });

    if (isPartner) {
      const continueBtn = panel.querySelector('#visby-continue');
      continueBtn.addEventListener('click', () => {
        // The hosted checkout URL for partner sites is opened via the background.
        // Content scripts don't have access to window.open across origins reliably.
        const checkoutUrl = `${VISBY_ORIGIN}/sdk/checkout?origin=${encodeURIComponent(location.origin)}`;
        chrome.runtime.sendMessage({ type: 'openCheckout', url: checkoutUrl });
      });
    } else {
      const signinBtn = panel.querySelector('#visby-signin');
      signinBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'openCheckout', url: `${VISBY_ORIGIN}/login` });
      });
    }
  }

  // ── Main entry ───────────────────────────────────────────────────────────────

  function tryInject() {
    if (dismissed) return;
    if (document.querySelector('#visby-ext-root')) return; // already injected

    if (score() < THRESHOLD) return;

    const domain = location.hostname.replace(/^www\./, '');
    chrome.runtime.sendMessage({ type: 'partnerCheck', domain }, (result) => {
      // Extension context may be invalidated (reload); guard against that.
      if (chrome.runtime.lastError) return;
      buildUI(result || { partner: false, merchant_name: null });
    });
  }

  // Run once on idle, then watch for SPA route changes / dynamic DOM updates.
  tryInject();

  // MutationObserver catches dynamically rendered checkout forms (React, Vue, etc.)
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(tryInject, 800);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
