import React, { createContext, useContext, useMemo } from 'react';
import type { SupramarkDiagramConfig } from '@supramark/core';
import { createDiagramEngine, type DiagramRenderService } from '@supramark/diagram-engine';

interface DiagramRenderProviderProps {
  children: React.ReactNode;
  /**
   * Optional: render timeout in ms, default 10000ms (10s).
   */
  timeout?: number;
  /**
   * Optional: cache configuration
   */
  cacheOptions?: {
    maxSize?: number;
    ttl?: number;
    enabled?: boolean;
  };
  /**
   * Optional: diagram subsystem configuration.
   * Provides defaults for timeout and cache strategy.
   */
  diagramConfig?: SupramarkDiagramConfig;
}

const DiagramRenderContext = createContext<DiagramRenderService | null>(null);

export const DiagramRenderProvider: React.FC<DiagramRenderProviderProps> = ({
  children,
  timeout,
  cacheOptions = {},
  diagramConfig,
}) => {
  const service = useMemo<DiagramRenderService>(() => {
    const effectiveTimeout = timeout ?? diagramConfig?.defaultTimeoutMs ?? 10000;
    const resolvedCache = {
      maxSize: cacheOptions.maxSize ?? diagramConfig?.defaultCache?.maxSize ?? 100,
      ttl: cacheOptions.ttl ?? diagramConfig?.defaultCache?.ttl ?? 300000,
      enabled: cacheOptions.enabled ?? diagramConfig?.defaultCache?.enabled ?? true,
    };

    const plantumlServer = diagramConfig?.engines?.plantuml?.server;

    return createDiagramEngine({
      timeout: effectiveTimeout,
      plantumlServer,
      cache: resolvedCache,
    });
  }, [timeout, cacheOptions, diagramConfig]);

  return <DiagramRenderContext.Provider value={service}>{children}</DiagramRenderContext.Provider>;
};

export function useDiagramRender(): DiagramRenderService {
  const ctx = useContext(DiagramRenderContext);
  if (!ctx) {
    throw new Error('useDiagramRender must be used within DiagramRenderProvider');
  }
  return ctx;
}

export type { DiagramRenderService };
