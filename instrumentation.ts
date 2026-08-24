// Skip loading @sentry/nextjs in local dev entirely — even a bare `import *`
// of the package pulls in @sentry/node + OpenTelemetry, which is what pushed
// `next dev`'s "Compiling instrumentation" step from ~2s to 10-20s+. Sentry's
// job here is catching production errors (WineYard's live traffic); local
// dev errors are already visible in this terminal. Verify server-side
// capture against a Vercel preview/prod deploy instead.
const isDev = process.env.NODE_ENV === 'development';

export async function register() {
  if (isDev) return;
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = isDev
  ? undefined
  : async (...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>) => {
      const Sentry = await import('@sentry/nextjs');
      return Sentry.captureRequestError(...args);
    };
