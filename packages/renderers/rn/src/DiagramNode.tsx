import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { SupramarkDiagramNode, SupramarkDiagramConfig } from '@supramark/core';
import { useDiagramRender } from '@supramark/rn-diagram-worker';
import { normalizeSvg } from './svgUtils';

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
  const { render } = useDiagramRender();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  const maxRetries = 2;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSvg(null);

    const attemptRender = () => {
      const options = buildRenderOptions(node.engine, node.meta, diagramConfig);
      render({ engine: node.engine, code: node.code, options })
        .then(result => {
          if (cancelled) return;

          if (!result.success) {
            // 渲染失败，显示错误
            const errorMsg = result.error
              ? `${result.error.message}: ${result.error.details || result.payload}`
              : result.payload || '未知错误';

            // 如果是超时错误且未达到重试上限，自动重试
            if (result.error?.code === 'timeout' && retryCount < maxRetries) {
              // debug: Diagram render timeout, retrying...
              setRetryCount(retryCount + 1);
              setTimeout(attemptRender, 1000); // 1秒后重试
              return;
            }

            setError(errorMsg);
            setLoading(false);
            return;
          }

          if (result.format === 'svg') {
            let normalized;
            try {
              normalized = normalizeSvg(result.payload);
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
        })
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
  }, [node.engine, node.code, node.meta, diagramConfig, render, retryCount]);

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
        <Text style={styles.errorText}>图表渲染错误：{error}</Text>
      </View>
    );
  }

  if (svg) {
    // 从 SVG 中提取 viewBox 来计算合适的高度
    const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
    let height = 300; // 默认高度

    if (viewBoxMatch) {
      const viewBoxParts = viewBoxMatch[1].split(/\s+/);
      if (viewBoxParts.length === 4) {
        const viewBoxWidth = parseFloat(viewBoxParts[2]);
        const viewBoxHeight = parseFloat(viewBoxParts[3]);
        if (viewBoxWidth > 0 && viewBoxHeight > 0) {
          // 根据 viewBox 的宽高比计算高度
          // 假设容器宽度为 350（接近典型手机屏幕宽度）
          const containerWidth = 350;
          height = (viewBoxHeight / viewBoxWidth) * containerWidth;
          // 限制最大高度为 500
          height = Math.min(height, 500);
        }
      }
    }

    return (
      <View style={styles.diagram}>
        <SvgXml xml={svg} width="100%" height={height} />
      </View>
    );
  }

  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>[diagram: {node.engine}]</Text>
    </View>
  );
};

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
