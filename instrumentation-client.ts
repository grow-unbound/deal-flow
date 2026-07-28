import posthog from 'posthog-js';

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: '/ingest',
  ui_host: 'https://us.posthog.com',
  defaults: '2026-01-30',
  capture_pageview: false,
  capture_exceptions: false,
  disable_surveys: true,
  debug: process.env.NODE_ENV === 'development',
});
