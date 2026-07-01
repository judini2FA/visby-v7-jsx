'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// Captures React render errors that escape the root layout (the one class the money-path
// captureError calls can't see). Reports to Sentry, then shows a minimal fallback.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h2 style={{ fontWeight: 500 }}>Something went wrong.</h2>
          <p style={{ opacity: 0.7 }}>Please refresh and try again.</p>
        </div>
      </body>
    </html>
  );
}
