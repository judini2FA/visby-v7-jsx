/*!
 * Visby "VisbyPay" button — SDK v1
 * Defines the <visby-button> custom element.
 *
 * Runs on third-party merchant sites: framework-free, dependency-free,
 * self-contained vanilla JS. No build step, no external fonts, no imports.
 *
 * The button holds NO secret and says NOTHING about what's inside — it's just
 * the VisbyPay brand lockup. The merchant's server creates a checkout session
 * (Authorization: Bearer sk_visby_...) and passes the resulting absolute Visby
 * checkout URL down to this element via `checkout-url`. Everything else — the
 * provenance NFT, sign-up, the purchase preview — lives in the popup that opens
 * on click.
 *
 * Usage:
 *   <script src="https://VISBY_HOST/sdk/v1/button.js" async></script>
 *   <visby-button checkout-url="https://VISBY_HOST/sdk/checkout/<id>"></visby-button>
 *   <script>
 *     document.querySelector('visby-button')
 *       .addEventListener('visby:complete', (e) => {
 *         console.log(e.detail.order_id, e.detail.nft_address);
 *       });
 *   </script>
 */
(function () {
  'use strict';

  // Don't redefine if the script is included twice on the same page.
  if (typeof customElements === 'undefined' || customElements.get('visby-button')) return;

  var POPUP_NAME = 'visby_checkout';
  var POPUP_W = 480;
  var POPUP_H = 760;

  // Resolve Visby's origin from this script's own <src> so we can load the brand
  // mark. A relative path would resolve to the MERCHANT's domain, not Visby's.
  var ORIGIN = (function () {
    try {
      var s = document.currentScript;
      if (s && s.src) return new URL(s.src).origin;
      var all = document.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].src && all[i].src.indexOf('/sdk/v1/button.js') !== -1) return new URL(all[i].src).origin;
      }
    } catch (e) { /* fall through to inline mark */ }
    return '';
  })();
  var MARK_URL = ORIGIN ? ORIGIN + '/visby-logo-mark.png' : '';

  // Pastel brand gradient + dark-grey lockup. Lives in the shadow root so the
  // merchant's page CSS can't reach in and break it, and ours can't leak out.
  var INK = '#33303D';
  // The wordmark is always Quicksand. @font-face is ignored inside a shadow root, so the font MUST be
  // registered on the host document — inject the Google Fonts <link> once, then the shadow tree can use it.
  function ensureQuicksand() {
    try {
      if (document.getElementById('visby-quicksand-font')) return;
      var link = document.createElement('link');
      link.id = 'visby-quicksand-font';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap';
      (document.head || document.documentElement).appendChild(link);
    } catch (e) { /* fall back to system font */ }
  }

  var STYLE = [
    ':host{display:inline-block;line-height:0;}',
    '.visby-btn{',
    '  font-family:"Quicksand",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;',
    '  display:inline-flex;align-items:center;justify-content:center;gap:8px;',
    '  box-sizing:border-box;border:0;margin:0;cursor:pointer;width:100%;',
    '  padding:15px 28px;border-radius:999px;',
    '  font-style:italic;font-weight:600;font-size:18px;letter-spacing:-.01em;line-height:1;',
    '  color:' + INK + ';',
    '  background:linear-gradient(95deg,#3FD0BA 0%,#86A9F0 50%,#CF6FE0 100%);',
    '  box-shadow:0 2px 12px rgba(120,110,160,.30),0 1px 2px rgba(16,18,21,.12);',
    '  transition:transform .08s ease, box-shadow .18s ease, filter .18s ease;',
    '  -webkit-tap-highlight-color:transparent;-webkit-appearance:none;appearance:none;',
    '}',
    '.visby-btn:hover{filter:brightness(1.04) saturate(1.06);box-shadow:0 5px 18px rgba(120,110,160,.36),0 1px 2px rgba(16,18,21,.14);}',
    '.visby-btn:active{transform:translateY(1px);}',
    '.visby-btn:focus-visible{outline:2px solid #2A8AED;outline-offset:3px;}',
    '.visby-btn[disabled]{opacity:.55;cursor:not-allowed;filter:saturate(.65);}',
    // brightness(0) flattens the colourful mark to a solid silhouette; opacity makes it dark grey.
    '.visby-mark{height:23px;width:auto;display:block;flex:0 0 auto;margin-left:-6px;filter:brightness(0);opacity:.92;}',
    '.visby-label{white-space:nowrap;}'
  ].join('');

  // Inline fallback mark (descending equalizer) — only used if the PNG origin
  // can't be resolved, so the lockup is never wordmark-only.
  var INLINE_MARK =
    '<svg class="visby-mark" viewBox="0 0 40 28" fill="' + INK + '" aria-hidden="true" focusable="false" style="filter:none;">' +
    '<rect x="0"  y="6"  width="3.4" height="16" rx="1.7"/>' +
    '<rect x="6"  y="2"  width="3.4" height="24" rx="1.7"/>' +
    '<rect x="12" y="0"  width="3.4" height="28" rx="1.7"/>' +
    '<rect x="18" y="5"  width="3.4" height="18" rx="1.7"/>' +
    '<rect x="24" y="10" width="3.4" height="11" rx="1.7"/>' +
    '<rect x="30" y="14" width="3.4" height="7"  rx="1.7"/>' +
    '<rect x="36" y="17" width="3.4" height="4"  rx="1.7"/>' +
    '</svg>';

  function markHTML() {
    if (MARK_URL) {
      return '<img class="visby-mark" src="' + MARK_URL + '" alt="" aria-hidden="true" ' +
        'onerror="this.replaceWith();">';
    }
    return INLINE_MARK;
  }

  var VisbyButton = class extends HTMLElement {
    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
      this._popup = null;
      // Bound so we can add AND remove the exact same reference.
      this._onMessage = this._handleMessage.bind(this);
      this._onClick = this._handleClick.bind(this);
    }

    static get observedAttributes() {
      return ['label', 'checkout-url'];
    }

    connectedCallback() {
      ensureQuicksand();
      this._render();
      window.addEventListener('message', this._onMessage);
    }

    disconnectedCallback() {
      window.removeEventListener('message', this._onMessage);
      if (this._btn) this._btn.removeEventListener('click', this._onClick);
    }

    attributeChangedCallback(name) {
      if (name === 'label' && this._labelEl) {
        this._labelEl.textContent = this._label();
      }
      if (name === 'checkout-url') this._reflectEnabled();
    }

    // Default lockup is the brand name. A merchant can override the word, but
    // never the gradient/mark — the lockup stays recognisably VisbyPay.
    _label() {
      var l = this.getAttribute('label');
      return l && l.trim() ? l : 'VisbyPay';
    }

    // Disable the button until a checkout-url is present, so a buyer can't click a dead button.
    _reflectEnabled() {
      if (!this._btn) return;
      var ready = !!(this.getAttribute('checkout-url') || '').trim();
      if (ready) { this._btn.removeAttribute('disabled'); this._btn.removeAttribute('aria-disabled'); }
      else { this._btn.setAttribute('disabled', ''); this._btn.setAttribute('aria-disabled', 'true'); }
    }

    _render() {
      // Idempotent: re-rendering reuses the same nodes.
      if (this._btn) {
        this._labelEl.textContent = this._label();
        return;
      }
      var style = document.createElement('style');
      style.textContent = STYLE;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'visby-btn';
      btn.setAttribute('part', 'button');
      btn.setAttribute('aria-label', 'Pay with Visby');
      btn.innerHTML = markHTML();

      var label = document.createElement('span');
      label.className = 'visby-label';
      label.textContent = this._label();
      btn.appendChild(label);

      btn.addEventListener('click', this._onClick);

      this._root.appendChild(style);
      this._root.appendChild(btn);
      this._btn = btn;
      this._labelEl = label;
      this._reflectEnabled();
    }

    _handleClick() {
      this.open();
    }

    open(urlOverride) {
      var url = urlOverride || this.getAttribute('checkout-url');
      if (!url) {
        // Missing the required attribute → loud no-op, never navigate blindly.
        console.error('[visby-button] missing required "checkout-url" attribute');
        return;
      }

      // Center the popup over the current window (multi-monitor aware).
      var dualLeft = window.screenLeft != null ? window.screenLeft : window.screenX;
      var dualTop = window.screenTop != null ? window.screenTop : window.screenY;
      var w = window.innerWidth || document.documentElement.clientWidth || screen.width;
      var h = window.innerHeight || document.documentElement.clientHeight || screen.height;
      var left = dualLeft + Math.max(0, (w - POPUP_W) / 2);
      var top = dualTop + Math.max(0, (h - POPUP_H) / 2);

      var features =
        'popup=1,scrollbars=1,resizable=1' +
        ',width=' + POPUP_W +
        ',height=' + POPUP_H +
        ',left=' + Math.round(left) +
        ',top=' + Math.round(top);

      var popup = window.open(url, POPUP_NAME, features);

      // Popup blocked (window.open returned null) → fall back to a full
      // redirect so the merchant's customer can still reach checkout.
      if (!popup) {
        window.location.assign(url);
        return;
      }

      this._popup = popup;
      try { popup.focus(); } catch (e) { /* cross-origin focus may throw */ }
    }

    _handleMessage(event) {
      // Require the message to come from the popup WE opened. Window-reference identity holds even
      // cross-origin, so this blocks any other frame (ads, chat widgets, a malicious opener) from
      // spoofing a 'visby:complete', and means we only listen while a checkout is actually open.
      if (!this._popup || event.source !== this._popup) return;

      var data = event && event.data;
      // Accept ONLY Visby's completion signal. We deliberately do NOT pin event.origin to a constant
      // (the Visby host varies across environments), but we require the source/type markers and read
      // only the two non-sensitive fields off the payload.
      if (!data || data.source !== 'visby' || data.type !== 'visby:complete') return;

      var detail = {
        order_id: data.order_id != null ? data.order_id : null,
        nft_address: data.nft_address != null ? data.nft_address : null
      };

      this.dispatchEvent(
        new CustomEvent('visby:complete', {
          detail: detail,
          bubbles: true,
          composed: true
        })
      );

      // Best-effort: close the checkout popup now that we're done.
      try {
        if (this._popup && !this._popup.closed) this._popup.close();
      } catch (e) { /* cross-origin close may throw — ignore */ }
      this._popup = null;
    }
  };

  customElements.define('visby-button', VisbyButton);
})();
