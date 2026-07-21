import { createContext } from 'react';
import type { SupramarkSourceState } from '@supramark/core';

// Standalone renderer usage treats Markdown as complete unless the host explicitly marks it streaming.
export const SourceStateContext = createContext<SupramarkSourceState>('complete');
