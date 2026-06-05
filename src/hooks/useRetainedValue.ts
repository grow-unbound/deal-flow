'use client';

import { useRef } from 'react';

export function useRetainedValue<T>(value: T | undefined): T | undefined {
  const ref = useRef<T | undefined>(value);

  if (value !== undefined) {
    ref.current = value;
  }

  return value ?? ref.current;
}
