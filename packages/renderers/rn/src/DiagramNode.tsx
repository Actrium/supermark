import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { SupramarkDiagramNode, SupramarkDiagramConfig } from '@supramark/core';
import type { DiagramRenderResult } from '@supramark/diagram-engine';
import { useDiagramRender, useDiagramWebViewBridge } from '@supramark/rn-diagram-worker';
import { normalizeSvg, normalizeSvgLight } from './svgUtils';

export interface DiagramNodeProps {
  node: SupramarkDiagramNode;
  /**
   * 图表子系统配置
   *
   * - 由上层通过 SupramarkConfig.diagram 传入；
   * - 用于给特定 engine 注入默认的 server / timeout 等选项；
   * - 单个 diagram 的 meta（node.meta）仍然可以覆盖这些默认值。
   */
  diagramConfig?: SupramarkDiagramConfig;
}

export const DiagramNode: React.FC<DiagramNodeProps> = ({ node, diagramConfig }) => {
  const diagramRender = useDiagramRender();
  const webViewBridgeRef = useDiagramWebViewBridge();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  const maxRetries = 2;

  useEffect(() => {
    let cancelled = false;
    let renderedViaBridge = false;
    setLoading(true);
    setError(null);
    setSvg(null);

    const handleResult = (result: DiagramRenderResult) => {
      if (cancelled) return;

      if (!result.success) {
        const errorMsg = result.error
          ? `${result.error.message}: ${result.error.details || result.payload}`
          : result.payload || '未知错误';

        if (result.error?.code === 'timeout' && retryCount < maxRetries) {
          setRetryCount(retryCount + 1);
          setTimeout(attemptRender, 1000);
          return;
        }

        setError(errorMsg);
        setLoading(false);
        return;
      }

      if (result.format === 'svg') {
        let normalized;
        try {
          // WebView bridge 产出的 SVG 已内联 CSS、结构干净，用轻量清理；
          // SSR / 远端产出（如 mermaid）可能含 <style> 块，用完整清理。
          const useLightNormalize = renderedViaBridge;
          normalized = useLightNormalize
            ? normalizeSvgLight(result.payload)
            : normalizeSvg(result.payload);
        } catch (err) {
          setError(`SVG 处理错误: ${err}`);
          setLoading(false);
          return;
        }

        setSvg(normalized);
        setLoading(false);
      } else {
        setError(`Unsupported diagram format: ${result.format}`);
        setLoading(false);
      }
    };

    const attemptRender = () => {
      const engine = normalizeBridgeEngineName(node.engine);
      const bridge = webViewBridgeRef.current;

      if (bridge && bridge.engines.includes(engine)) {
        renderedViaBridge = true;
        bridge
          .render({
            engine,
            code: node.code,
            options: node.meta as Record<string, unknown> | undefined,
          })
          .then(handleResult)
          .catch(() => {
            if (cancelled) return;
            renderedViaBridge = false;
            if (isBridgeOnlyEngine(engine)) {
              setError(`${engine} WebView render failed`);
              setLoading(false);
              return;
            }
            attemptViaEngine();
          });
        return;
      }

      attemptViaEngine();
    };

    const attemptViaEngine = () => {
      const options = buildRenderOptions(node.engine, node.meta, diagramConfig);
      diagramRender.render({ engine: node.engine, code: node.code, options })
        .then(handleResult)
        .catch(err => {
          if (cancelled) return;
          setError(String(err));
          setLoading(false);
        });
    };

    attemptRender();

    return () => {
      cancelled = true;
    };
  }, [node.engine, node.code, node.meta, diagramConfig, diagramRender, webViewBridgeRef, retryCount]);

  if (loading && !svg && !error) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator size="small" />
        <Text style={styles.placeholderText}>正在渲染图表（{node.engine}）...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.errorText}>图表渲染错误？：{error}</Text>
      </View>
    );
  }

  if (svg) {
    const { width: screenWidth } = Dimensions.get('window');
    const containerWidth = screenWidth - 32; // account for typical padding

    // Try viewBox first, then fall back to width/height attributes
    const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
    const widthAttrMatch = svg.match(/<svg[^>]*\bwidth="([^"]+)"/);
    const heightAttrMatch = svg.match(/<svg[^>]*\bheight="([^"]+)"/);

    let svgWidth = 0;
    let svgHeight = 0;

    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].split(/[\s,]+/);
      if (parts.length === 4) {
        svgWidth = parseFloat(parts[2]);
        svgHeight = parseFloat(parts[3]);
      }
    }

    // Fall back to explicit width/height attributes
    if (svgWidth <= 0 && widthAttrMatch) svgWidth = parseFloat(widthAttrMatch[1]);
    if (svgHeight <= 0 && heightAttrMatch) svgHeight = parseFloat(heightAttrMatch[1]);

    let height = 300;
    if (svgWidth > 0 && svgHeight > 0) {
      height = (svgHeight / svgWidth) * containerWidth;
      height = Math.min(height, 500);
    }

    // Ensure SVG has viewBox and no fixed dimensions for proper scaling
    let scalableSvg = svg;
    if (!viewBoxMatch && svgWidth > 0 && svgHeight > 0) {
      scalableSvg = scalableSvg.replace(
        /<svg([^>]*)>/,
        `<svg$1 viewBox="0 0 ${svgWidth} ${svgHeight}">`
      );
    }
    // Remove fixed width/height from SVG root so SvgXml controls sizing
    scalableSvg = scalableSvg
      .replace(/(<svg[^>]*)\bwidth="[^"]*"/, '$1')
      .replace(/(<svg[^>]*)\bheight="[^"]*"/, '$1');

    return (
      <View style={[styles.diagram, { width: containerWidth, height }]}>
        <SvgXml xml={scalableSvg} width={containerWidth} height={height} />
      </View>
    );
  }

  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>[diagram: {node.engine}]</Text>
    </View>
  );
};

function normalizeBridgeEngineName(engine: string): string {
  const normalized = engine.toLowerCase();
  if (normalized === 'graphviz') {
    return 'dot';
  }
  return normalized;
}

function isBridgeOnlyEngine(engine: string): boolean {
  return engine === 'vega' || engine === 'vega-lite' || engine === 'mermaid';
}

/**
 * 根据全局 diagramConfig 和节点自身的 meta 构造渲染选项。
 *
 * 优先级约定：
 * - diagramConfig.engines[engine] 提供引擎级默认值（server / timeout 等）；
 * - node.meta 中的字段可以覆盖这些默认值；
 * - 未提供任何配置时，返回 node.meta 原样。
 */
function buildRenderOptions(
  engine: string,
  meta: SupramarkDiagramNode['meta'],
  diagramConfig?: SupramarkDiagramConfig
): Record<string, unknown> | undefined {
  const base: Record<string, unknown> = {};

  const engineConfig = diagramConfig?.engines?.[engine];
  if (engineConfig) {
    if (typeof engineConfig.server === 'string') {
      // worker 中同时支持 server / plantumlServer 两种字段
      base.server = engineConfig.server;
      base.plantumlServer = engineConfig.server;
    }
    if (typeof engineConfig.timeoutMs === 'number') {
      base.timeout = engineConfig.timeoutMs;
    }
    if (engineConfig.cache) {
      base.cache = engineConfig.cache;
    }
  }

  if (!meta) {
    return Object.keys(base).length > 0 ? base : undefined;
  }

  return { ...base, ...meta };
}

const styles = StyleSheet.create({
  diagram: {
    marginBottom: 8,
  },
  placeholder: {
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ccc',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 6,
  },
  errorText: {
    fontSize: 12,
    color: '#d4380d',
  },
});
