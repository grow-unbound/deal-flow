export type Surface = 'seller' | 'buyer';
export type ThemeMode = 'light'; // 'dark' reserved for future seller dark mode

export const SURFACES = {
  seller: 'seller',
  buyer: 'buyer',
} as const;

// CSS class applied to <html> for surface-specific overrides
export const surfaceClass: Record<Surface, string> = {
  seller: 'theme-seller',
  buyer: 'theme-buyer',
};
