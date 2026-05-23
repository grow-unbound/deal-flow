'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';
import { type Surface, type ThemeMode, surfaceClass } from '@/lib/theme/theme-config';

interface ThemeContextValue {
  surface: Surface;
  mode: ThemeMode;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  surface: Surface;
  children: ReactNode;
}

export function ThemeProvider({ surface, children }: ThemeProviderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const html = document.documentElement;
    // Remove any previous surface classes
    html.classList.remove('theme-seller', 'theme-buyer');
    html.classList.add(surfaceClass[surface]);
  }, [surface]);

  // Avoid flash of unstyled content — render children immediately with SSR-safe class
  if (!mounted) {
    return (
      <ThemeContext.Provider value={{ surface, mode: 'light' }}>
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={{ surface, mode: 'light' }}>
      {children}
    </ThemeContext.Provider>
  );
}
