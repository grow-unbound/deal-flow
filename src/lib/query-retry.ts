import type { Query } from '@tanstack/react-query';

function isRetryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

export function noQueryRetry() {
  return false;
}

export function transientQueryRetry(failureCount: number, error: unknown, _query?: Query) {
  if (failureCount >= 1) return false;

  const status = getErrorStatus(error);
  if (status == null) return true;

  return isRetryableStatus(status);
}

export function makeHttpError(message: string, status: number) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}
