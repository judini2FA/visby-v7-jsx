import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Next 15's onRequestError hook — routes server/RSC render errors (including nested React Server
// Components) to Sentry. Without it those errors are silently dropped.
export const onRequestError = Sentry.captureRequestError;
