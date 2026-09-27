'use client';

import { useEffect, useState } from 'react';

const DESKTOP_QUERY = '(min-width: 768px)';

/** Matches EntitySplitShell's breakpoint — true below 768px. Defaults to false
 * (desktop) until the client mounts, same as EntitySplitShell's own isDesktop
 * state, so SSR/first paint never assumes mobile. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    setIsMobile(!query.matches);
    const onChange = () => setIsMobile(!query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}
