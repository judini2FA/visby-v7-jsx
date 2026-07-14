#!/usr/bin/env node
/**
 * Visby SDK burner merchant — a throwaway test storefront for the "Pay with Visby" SDK.
 *
 * It plays the role of a real third-party merchant: it holds your secret key SERVER-SIDE,
 * creates checkout sessions against Visby, and embeds the real <visby-button> so you can run
 * a full test purchase (test items + serial-number logging + test checkout) end-to-end.
 *
 * Run:
 *   VISBY_SECRET_KEY=sk_visby_xxx node sdk-sandbox/server.mjs
 * then open http://localhost:4000
 *
 * Env:
 *   VISBY_SECRET_KEY  (required) your merchant secret from visby.me/merchant
 *   VISBY_BASE        (default https://visby.me) — use http://localhost:3000 to hit a local Visby
 *   PORT              (default 4000)
 *
 * No npm install — Node 18+ built-ins only.
 */
import { createServer } from 'node:http';

const VISBY_BASE = (process.env.VISBY_BASE || 'https://visby.me').replace(/\/$/, '');
const SECRET_KEY = process.env.VISBY_SECRET_KEY || '';
const PORT = Number(process.env.PORT || 4000);

const DEFAULT_ITEMS = [
  { name: "Air Max 1 '86 OG",       price: 99.0,  prefix: 'SNKR' },
  { name: 'Speedmaster Professional', price: 3800.0, prefix: 'WTCH' },
  { name: 'Birkin 30 Togo',          price: 12000.0, prefix: 'BAG'  },
];

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

// The merchant-server call: creates a checkout session with the SECRET key (never in the browser).
async function createSession(body) {
  const { product_name, serial_number, price, image_url } = body || {};
  const res = await fetch(`${VISBY_BASE}/api/sdk/checkout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_name,
      serial_number,
      price,
      currency: 'USD',
      image_url: image_url || undefined,
      success_url: `http://localhost:${PORT}/?paid=1`,
      cancel_url: `http://localhost:${PORT}/?cancelled=1`,
    }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/session') {
    if (!SECRET_KEY) return json(res, 400, { error: 'No VISBY_SECRET_KEY set on the sandbox server. Restart with your sk_visby_ key.' });
    const body = await readBody(req);
    try {
      const { status, data } = await createSession(body);
      // Pass Visby's response straight through so the log shows the real status (401/422/etc.).
      return json(res, status, data);
    } catch (e) {
      return json(res, 502, { error: 'Could not reach Visby at ' + VISBY_BASE + ': ' + (e && e.message ? e.message : String(e)) });
    }
  }
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    const html = page();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log('\n  Visby SDK burner merchant');
  console.log('  ─────────────────────────');
  console.log('  Storefront : http://localhost:' + PORT);
  console.log('  Visby base : ' + VISBY_BASE);
  console.log('  Secret key : ' + (SECRET_KEY ? 'set (…' + SECRET_KEY.slice(-4) + ')' : 'MISSING — restart with VISBY_SECRET_KEY'));
  console.log('');
});

function page() {
  const items = JSON.stringify(DEFAULT_ITEMS);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mercury — Visby SDK sandbox</title>
<script src="${VISBY_BASE}/sdk/v1/button.js" async></script>
<style>
  :root { --ink:#1c1a24; --muted:#6b6478; --line:#e7e2ef; --bg:#faf9fc; --card:#fff; --brandA:#25CDB8; --brandB:#2A8AED; --brandC:#BC2DE6; --ok:#00996b; --err:#d13a5a; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Manrope,sans-serif; color:var(--ink); background:var(--bg); }
  .wrap { max-width:960px; margin:0 auto; padding:24px 20px 80px; }
  h1 { font-size:22px; font-weight:700; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:14px; margin:0 0 20px; }
  .banner { font-size:12.5px; padding:10px 14px; border-radius:10px; border:1px solid var(--line); background:var(--card); margin-bottom:20px; display:flex; gap:16px; flex-wrap:wrap; }
  .banner b { color:var(--ink); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:14px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:10px; }
  .name { font-weight:600; font-size:15px; }
  .price { font-weight:700; font-size:16px; background:linear-gradient(135deg,var(--brandA),var(--brandB) 50%,var(--brandC)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
  label { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); display:block; margin-bottom:4px; }
  input { width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:8px; font-size:13px; font-family:ui-monospace,Menlo,monospace; }
  .row { display:flex; gap:8px; align-items:flex-end; }
  .row > div { flex:1; }
  button.mini { padding:8px 12px; border:1px solid var(--line); background:#fff; border-radius:8px; font-size:13px; cursor:pointer; white-space:nowrap; }
  button.mini:hover { border-color:#cfc8d8; }
  .status { font-size:12px; color:var(--muted); min-height:16px; }
  .status.ok { color:var(--ok); } .status.err { color:var(--err); }
  visby-button { display:block; }
  h2 { font-size:15px; margin:28px 0 10px; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); background:#fbfafd; }
  td.mono { font-family:ui-monospace,Menlo,monospace; font-size:11.5px; word-break:break-all; }
  .pill { display:inline-block; padding:1px 8px; border-radius:999px; font-size:11px; font-weight:600; }
  .pill.session { background:#eef4ff; color:#2a63c7; } .pill.minted { background:#e6f7f0; color:var(--ok); } .pill.error { background:#fdeaf0; color:var(--err); }
  .add { margin:28px 0; background:var(--card); border:1px dashed #cfc8d8; border-radius:14px; padding:16px; }
  code { font-family:ui-monospace,Menlo,monospace; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Mercury Test Shop</h1>
  <p class="sub">A burner merchant for testing the Pay with Visby SDK. Every button here creates a real checkout session and mints a real (devnet) Tally on completion.</p>

  <div class="banner">
    <span>Visby: <b>${VISBY_BASE}</b></span>
    <span>Secret key: <b>${SECRET_KEY ? 'set ✓' : 'MISSING �— restart the server with VISBY_SECRET_KEY'}</b></span>
    <span>Test card: <b>4242 4242 4242 4242</b></span>
  </div>

  <div id="grid" class="grid"></div>

  <div class="add">
    <div class="name" style="margin-bottom:10px">Add a custom test item</div>
    <div class="row">
      <div><label>Product name</label><input id="c_name" placeholder="e.g. Kelly 25" /></div>
      <div style="max-width:120px"><label>Price (USD)</label><input id="c_price" value="150" /></div>
      <button class="mini" onclick="addCustom()">Add</button>
    </div>
  </div>

  <h2>Serial log</h2>
  <table>
    <thead><tr><th>Time</th><th>Item</th><th>Serial</th><th>Session / status</th><th>Order &rarr; Tally NFT</th></tr></thead>
    <tbody id="log"><tr><td colspan="5" style="color:var(--muted)">No sessions yet — click a Buy button above.</td></tr></tbody>
  </table>
</div>

<script>
  var DEFAULTS = ${items};
  var counter = 0;
  function uid(prefix) {
    counter++;
    return 'SANDBOX-' + prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + counter;
  }
  function logRow(id) { return document.getElementById('logrow-' + id); }
  function addLog(id, item, serial) {
    var tb = document.getElementById('log');
    if (tb.querySelector('td[colspan]')) tb.innerHTML = '';
    var tr = document.createElement('tr');
    tr.id = 'logrow-' + id;
    var time = new Date().toLocaleTimeString();
    tr.innerHTML = '<td>' + time + '</td><td>' + item + '</td><td class="mono">' + serial +
      '</td><td class="status-cell">…</td><td class="order-cell mono">—</td>';
    tb.prepend(tr);
  }
  function setStatus(id, cls, html) {
    var row = logRow(id); if (!row) return;
    row.querySelector('.status-cell').innerHTML = '<span class="pill ' + cls + '">' + html + '</span>';
  }
  function setOrder(id, html) { var row = logRow(id); if (row) row.querySelector('.order-cell').innerHTML = html; }

  async function prepare(card, item) {
    var serial = card.querySelector('.serial').value.trim() || uid(item.prefix || 'ITEM');
    card.querySelector('.serial').value = serial;
    var st = card.querySelector('.status');
    st.className = 'status'; st.textContent = 'Creating session…';
    var rowId = 'r' + Date.now() + '_' + counter;
    addLog(rowId, item.name, serial);
    setStatus(rowId, 'session', 'creating…');
    try {
      var res = await fetch('/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_name: item.name, serial_number: serial, price: Number(item.price) })
      });
      var data = await res.json();
      if (!res.ok || !(data.checkout_url || data.url)) {
        var msg = (data && data.error) ? data.error : ('HTTP ' + res.status);
        st.className = 'status err'; st.textContent = msg;
        setStatus(rowId, 'error', msg);
        return;
      }
      var url = data.checkout_url || data.url;
      var sid = data.session_id || (url.split('/').pop());
      st.className = 'status ok'; st.textContent = 'Session ready — click Pay with Visby';
      setStatus(rowId, 'session', 'session ' + sid.slice(0, 12) + '…');
      // Mount the real Visby button with the server-provided checkout URL.
      var holder = card.querySelector('.btnholder');
      holder.innerHTML = '';
      var vb = document.createElement('visby-button');
      vb.setAttribute('checkout-url', url);
      vb.addEventListener('visby:complete', function (e) {
        st.className = 'status ok'; st.textContent = 'Paid + minted ✓';
        setStatus(rowId, 'minted', 'minted ✓');
        var oid = e.detail && e.detail.order_id ? e.detail.order_id : '—';
        var nft = e.detail && e.detail.nft_address ? e.detail.nft_address : '—';
        var link = nft !== '—' ? '<a href="${VISBY_BASE}/item/' + oid + '" target="_blank">' + oid + '</a> · ' + nft : oid;
        setOrder(rowId, link);
      });
      holder.appendChild(vb);
    } catch (err) {
      st.className = 'status err'; st.textContent = 'Network error: ' + err.message;
      setStatus(rowId, 'error', 'network');
    }
  }

  function renderItem(item) {
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<div class="name">' + item.name + '</div>' +
      '<div class="price">$' + Number(item.price).toFixed(2) + '</div>' +
      '<div><label>Serial number (auto)</label><input class="serial" placeholder="auto-generated" /></div>' +
      '<button class="mini" style="align-self:flex-start">Prepare &amp; get button</button>' +
      '<div class="btnholder"></div>' +
      '<div class="status"></div>';
    card.querySelector('button').addEventListener('click', function () { prepare(card, item); });
    return card;
  }

  function addCustom() {
    var name = document.getElementById('c_name').value.trim();
    var price = document.getElementById('c_price').value.trim();
    if (!name) return;
    var card = renderItem({ name: name, price: price || 0, prefix: 'CUSTOM' });
    document.getElementById('grid').prepend(card);
    document.getElementById('c_name').value = '';
  }

  var grid = document.getElementById('grid');
  DEFAULTS.forEach(function (it) { grid.appendChild(renderItem(it)); });
</script>
</body>
</html>`;
}
