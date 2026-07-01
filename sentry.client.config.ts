import * as Sentry from '@sentry/nextjs';

// Browser-side capture (client errors, unhandled promise rejections, React render errors). The
// existing src/lib/monitoring.ts still handles server money-path errors with structured context;
// this adds the client + unhandled coverage that lib intentionally didn't.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
