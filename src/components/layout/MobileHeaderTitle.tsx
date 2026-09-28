'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface MobileHeader {
  title: string | null;
  phone: string | null;
}

interface MobileHeaderTitleValue extends MobileHeader {
  setHeader: (header: MobileHeader) => void;
}

const EMPTY_HEADER: MobileHeader = { title: null, phone: null };

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

/** Phone number the top bar exposes as a tap-to-call icon (deep customer screens). */
export function useMobileHeaderPhoneValue(): string | null {
  return useContext(MobileHeaderTitleContext).phone;
}

/** Sets the mobile top-bar title (and optional tap-to-call phone) while the calling screen
 * is mounted. Pass null to keep the default. */
export function useMobileHeaderTitle(title: string | null | undefined, options?: { phone?: string | null }) {
  const { setHeader } = useContext(MobileHeaderTitleContext);
  const phone = options?.phone ?? null;
  useEffect(() => {
    setHeader({ title: title ?? null, phone: title ? phone : null });
    return () => setHeader(EMPTY_HEADER);
  }, [title, phone, setHeader]);
}
