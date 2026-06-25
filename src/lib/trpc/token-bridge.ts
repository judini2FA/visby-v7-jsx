// Lets the module-level tRPC client attach a fresh Privy access token without itself being a React hook.
// A component inside PrivyProvider registers getAccessToken here; the httpBatchLink headers fn reads it.
// Robust by design: if nothing is registered or the getter throws, it yields null and the request goes
// out unauthenticated — so a token hiccup can only fail protectedProcedures, never all of tRPC.
let getter: (() => Promise<string | null>) | null = null;

export function registerTrpcToken(fn: (() => Promise<string | null>) | null) {
  getter = fn;
}

export async function getTrpcToken(): Promise<string | null> {
  if (!getter) return null;
  try {
    return await getter();
  } catch {
    return null;
  }
}
