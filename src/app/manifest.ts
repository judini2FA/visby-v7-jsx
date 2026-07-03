import type { MetadataRoute } from 'next';

// Web App Manifest — makes Visby installable to the home screen on iOS & Android (and a richer
// PWA install on Chrome). Served by Next at /manifest.webmanifest. Icons live in /public.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Visby — Provenance Marketplace',
    short_name: 'Visby',
    description: 'Buy and sell real-world luxury goods with chain-verified provenance.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAF9FC',
    theme_color: '#FAF9FC',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Full-bleed (white) icons double as maskable — the mark sits inside the safe zone.
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
