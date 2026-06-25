'use client';

import { useEffect } from 'react';

// Registers the service worker so Visby is installable as a PWA. Best-effort and silent — a failure
// (unsupported browser, blocked SW) never affects the app.
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
