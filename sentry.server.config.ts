import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Error-only for now: skips OpenTelemetry auto-instrumentation setup, which
  // hooks every Node require/import via `import-in-the-middle` — that
  // hooking is what made `next dev` startup jump from ~2s to ~50s.
  // captureException/onRequestError still work fully without it.
  skipOpenTelemetrySetup: true,
  tracesSampleRate: 0,
  ignoreErrors: ['AbortError'],
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }
    return event;
  },
});
