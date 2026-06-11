'use client';

import { useCallback, useRef, useState } from 'react';

export type ComposerSubmitAction = 'save' | 'send' | 'confirm';

export function composerSubmitFooterLabel(action: ComposerSubmitAction | null): string | null {
  switch (action) {
    case 'save':
      return 'Saving…';
    case 'send':
      return 'Sending…';
    case 'confirm':
      return 'Confirming…';
    default:
      return null;
  }
}

export function useComposerLeaveGuard() {
  const isLeavingRef = useRef(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [submitAction, setSubmitAction] = useState<ComposerSubmitAction | null>(null);

  const beginLeaving = useCallback((action: ComposerSubmitAction): void => {
    isLeavingRef.current = true;
    setIsLeaving(true);
    setSubmitAction(action);
  }, []);

  const resetLeaving = useCallback((): void => {
    isLeavingRef.current = false;
    setIsLeaving(false);
    setSubmitAction(null);
  }, []);

  const shouldBlockComposer = useCallback(
    (workingId: string | null, isLoading: boolean, hasDocument: boolean): boolean => {
      if (isLeaving) return false;
      return Boolean((workingId && isLoading) || !hasDocument);
    },
    [isLeaving],
  );

  const isSubmitting = submitAction !== null;

  return {
    isLeaving,
    isLeavingRef,
    isSubmitting,
    submitAction,
    beginLeaving,
    resetLeaving,
    shouldBlockComposer,
  };
}
