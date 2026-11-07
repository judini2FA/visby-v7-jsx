export function beacon(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.('/api/links/track', new Blob([body], { type: 'application/json' }))) return;
  } catch {}
  fetch('/api/links/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}
