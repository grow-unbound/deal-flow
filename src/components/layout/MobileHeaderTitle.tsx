'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface MobileHeader {
  title: string | null;
  eyebrow: string | null;
}

interface MobileHeaderTitleValue extends MobileHeader {
  setHeader: (header: MobileHeader) => void;
}

const EMPTY_HEADER: MobileHeader = { title: null, eyebrow: null };

const MobileHeaderTitleContext = createContext<MobileHeaderTitleValue>({ ...EMPTY_HEADER, setHeader: () => {} });

/** Lets a deep mobile screen name itself in the shared top bar (buyer name, entry title...)
 * instead of the bar falling back to the static route-segment title ("Today"). */
export function MobileHeaderTitleProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<MobileHeader>(EMPTY_HEADER);
  const value = useMemo(() => ({ ...header, setHeader }), [header]);
  return <MobileHeaderTitleContext.Provider value={value}>{children}</MobileHeaderTitleContext.Provider>;
}

export function useMobileHeaderTitleValue(): string | null {
  return useContext(MobileHeaderTitleContext).title;
}

/** Parent-context line shown above the title on depth-2 screens (e.g. the buyer name). */
export function useMobileHeaderEyebrowValue(): string | null {
  return useContext(MobileHeaderTitleContext).eyebrow;
}

/** Sets the mobile top-bar title (and optional parent-context eyebrow) while the calling screen
 * is mounted. Pass null to keep the default. */
export function useMobileHeaderTitle(title: string | null | undefined, options?: { eyebrow?: string | null }) {
  const { setHeader } = useContext(MobileHeaderTitleContext);
  const eyebrow = options?.eyebrow ?? null;
  useEffect(() => {
    setHeader({ title: title ?? null, eyebrow: title ? eyebrow : null });
    return () => setHeader(EMPTY_HEADER);
  }, [title, eyebrow, setHeader]);
}
