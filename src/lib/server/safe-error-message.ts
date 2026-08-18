/**
 * Route handlers that forward `error.message` straight into a client-facing JSON
 * response risk leaking internal detail — mostly harmless app-thrown messages, but
 * some wrap raw Postgres/Supabase errors that can include table/column names.
 * Gate on NODE_ENV so dev/staging keeps the detailed message for debugging while
 * production always gets the generic fallback.
 */
export function safeErrorMessage(error: unknown, fallback: string): string {
  if (process.env.NODE_ENV === 'production') return fallback;
  return error instanceof Error ? error.message : fallback;
}
