'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface MobileHeaderTitleValue {
  title: string | null;
  setTitle: (title: string | null) => void;
}

const MobileHeaderTitleContext = createContext<MobileHeaderTitleValue>({ title: null, setTitle: () => {} });

/** Lets a deep mobile screen name itself in the shared top bar (buyer name, entry title...)
 * instead of the bar falling back to the static route-segment title ("Today"). */
export function MobileHeaderTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const value = useMemo(() => ({ title, setTitle }), [title]);
  return <MobileHeaderTitleContext.Provider value={value}>{children}</MobileHeaderTitleContext.Provider>;
}

export function useMobileHeaderTitleValue(): string | null {
  return useContext(MobileHeaderTitleContext).title;
}

/** Sets the mobile top-bar title while the calling screen is mounted. Pass null to keep the default. */
export function useMobileHeaderTitle(title: string | null | undefined) {
  const { setTitle } = useContext(MobileHeaderTitleContext);
  useEffect(() => {
    setTitle(title ?? null);
    return () => setTitle(null);
  }, [title, setTitle]);
}
