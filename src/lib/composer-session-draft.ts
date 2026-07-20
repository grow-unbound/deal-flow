/**
 * Client-side session draft persistence for composer UIs.
 * Stores in-progress form state in sessionStorage so navigating away and back
 * restores the user's work. Cleared on explicit save, send, or discard.
 * Never touches the server — POST happens only on user action.
 */

export type ComposerDraftKey = 'estimate' | 'order' | 'invoice';

const KEY_PREFIX = 'composer:draft:';

function storageKey(entity: ComposerDraftKey): string {
  return `${KEY_PREFIX}${entity}`;
}

export function saveComposerDraft<D, L>(
  entity: ComposerDraftKey,
  document: D,
  lines: L[],
): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(entity), JSON.stringify({ document, lines }));
  } catch {
    // sessionStorage unavailable or quota exceeded — silently ignore
  }
}

export function loadComposerDraft<D, L>(
  entity: ComposerDraftKey,
): { document: D; lines: L[] } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(storageKey(entity));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { document?: D; lines?: L[] };
    if (!parsed.document) return null;
    return { document: parsed.document, lines: parsed.lines ?? [] };
  } catch {
    return null;
  }
}

export function clearComposerDraft(entity: ComposerDraftKey): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(storageKey(entity));
  } catch {}
}
