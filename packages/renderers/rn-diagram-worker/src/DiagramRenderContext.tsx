import React, { createContext, useContext, useMemo, useRef } from 'react';
import type { SupramarkDiagramConfig } from '@supramark/core';
import { createDiagramEngine, type DiagramRenderService } from '@supramark/diagram-engine';
import { DiagramWebViewBridge } from './DiagramWebViewBridge';
import type { DiagramWebViewBridgeHandle } from './DiagramWebViewBridge';
import { createEChartsBridge } from './bridges';
import type { BridgeEngine } from './bridges';

interface DiagramRenderProviderProps {
  children: React.ReactNode;
  timeout?: number;
  cacheOptions?: {
    maxSize?: number;
    ttl?: number;
    enabled?: boolean;
  };
  diagramConfig?: SupramarkDiagramConfig;
}

interface DiagramRenderContextValue {
  service: DiagramRenderService;
  webViewBridge: React.RefObject<DiagramWebViewBridgeHandle | null>;
}

const DiagramRenderContext = createContext<DiagramRenderContextValue | null>(null);

export const DiagramRenderProvider: React.FC<DiagramRenderProviderProps> = ({
  children,
  timeout,
  cacheOptions = {},
  diagramConfig,
}) => {
  const bridgeRef = useRef<DiagramWebViewBridgeHandle | null>(null);

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

  const bridgeEngines = useMemo<readonly BridgeEngine[]>(() => {
    const echartsCdn = (diagramConfig?.engines?.echarts as any)?.cdnUrl as string | undefined;
    // 目前只有 echarts 走 WebView bridge；vega/vega-lite 仍走 diagram-engine（远端 Kroki）。
    // 后续需要时在此数组追加 createVegaBridge() 等即可启用。
    return [
      createEChartsBridge(echartsCdn),
    ];
  }, [diagramConfig]);

  const bridgeTimeout = diagramConfig?.defaultTimeoutMs;

  const value = useMemo<DiagramRenderContextValue>(
    () => ({ service, webViewBridge: bridgeRef }),
    [service],
  );

  return (
    <DiagramRenderContext.Provider value={value}>
      <DiagramWebViewBridge
        ref={bridgeRef}
        engines={bridgeEngines}
        timeoutMs={bridgeTimeout}
      />
      {children}
    </DiagramRenderContext.Provider>
  );
};

export function useDiagramRender(): DiagramRenderService {
  const ctx = useContext(DiagramRenderContext);
  if (!ctx) {
    throw new Error('useDiagramRender must be used within DiagramRenderProvider');
  }
  return ctx.service;
}

export function useDiagramWebViewBridge(): React.RefObject<DiagramWebViewBridgeHandle | null> {
  const ctx = useContext(DiagramRenderContext);
  if (!ctx) {
    throw new Error('useDiagramWebViewBridge must be used within DiagramRenderProvider');
  }
  return ctx.webViewBridge;
}

export type { DiagramRenderService };
