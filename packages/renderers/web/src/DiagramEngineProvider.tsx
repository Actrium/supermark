import React, { createContext, useMemo } from 'react';
import type { DiagramRenderService, DiagramEngineOptions } from '@supramark/diagram-engine';
import { createDiagramEngine } from '@supramark/diagram-engine';

export const DiagramEngineContext = createContext<DiagramRenderService | null>(null);

export interface DiagramEngineProviderProps {
  children: React.ReactNode;
  /** Pre-created engine instance (takes precedence over options) */
  engine?: DiagramRenderService;
  /** Options to create a new engine instance */
  options?: DiagramEngineOptions;
}

export const DiagramEngineProvider: React.FC<DiagramEngineProviderProps> = ({
  children,
  engine,
  options,
}) => {
  const service = useMemo(() => {
    if (engine) return engine;
    return createDiagramEngine(options);
  }, [engine, options]);

  return <DiagramEngineContext.Provider value={service}>{children}</DiagramEngineContext.Provider>;
};
