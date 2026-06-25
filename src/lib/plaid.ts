import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

// Server-side Plaid client. Sandbox today; flip PLAID_ENV to 'development'/'production' once approved.
// Access tokens this returns are bank-read credentials — keep them server-only (never to the browser).
const env = (process.env.PLAID_ENV ?? 'sandbox') as keyof typeof PlaidEnvironments;

let _client: PlaidApi | null = null;
export function plaidClient(): PlaidApi | null {
  const id = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!id || !secret) return null; // not configured — callers fail closed
  if (!_client) {
    _client = new PlaidApi(new Configuration({
      basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
      baseOptions: { headers: { 'PLAID-CLIENT-ID': id, 'PLAID-SECRET': secret } },
    }));
  }
  return _client;
}
