'use client';

import { createContext, useContext } from 'react';

interface RecoWidgetCtx {
  widget: string;
  sourceProductId?: string;
}

const RecoWidgetContext = createContext<RecoWidgetCtx | null>(null);

export const RecoWidgetProvider = RecoWidgetContext.Provider;

export function useRecoWidget(): RecoWidgetCtx | null {
  return useContext(RecoWidgetContext);
}
