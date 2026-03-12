import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { SupramarkMathBlockNode } from '@supramark/core';
import { useOptionalDiagramWebViewBridge } from '@supramark/rn-diagram-worker';
import { normalizeSvg } from './svgUtils';

interface MathBlockProps {
  node: SupramarkMathBlockNode;
}

export const MathBlock: React.FC<MathBlockProps> = ({ node }) => {
  const webViewBridgeRef = useOptionalDiagramWebViewBridge();
  const [svg, setSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSvg(null);

    const bridge = webViewBridgeRef?.current;
    if (!bridge || !bridge.engines.includes('math')) {
      setLoading(false);
      return;
    }

    bridge.render({
      engine: 'math',
      code: node.value,
      options: { displayMode: true },
    })
      .then(result => {
        if (cancelled) return;
        if (!result.success || result.format !== 'svg' || !result.payload.includes('<svg')) {
          throw new Error(result.error?.details || result.payload || 'Math SVG render failed');
        }
        const normalized = normalizeSvg(result.payload);
        setSvg(normalized);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        if (__DEV__) {
          console.error('[Supramark MathBlock] MathJax WebView render failed, fallback to TeX:', err);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [node.value, webViewBridgeRef]);

  if (loading && !svg) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator size="small" />
        <Text style={styles.placeholderText}>正在渲染公式...</Text>
      </View>
    );
  }

  if (svg) {
    const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
    let height = 80;

    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].split(/\s+/);
      if (parts.length === 4) {
        const w = parseFloat(parts[2]);
        const h = parseFloat(parts[3]);
        if (w > 0 && h > 0) {
          const containerWidth = 300;
          height = Math.min((h / w) * containerWidth, 200);
        }
      }
    }

    return (
      <View style={styles.mathContainer}>
        <SvgXml xml={svg} width="100%" height={height} />
      </View>
    );
  }

  // 统一降级：源码文本
  return (
    <View style={styles.codeBlock}>
      <Text style={styles.codeText}>{node.value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  mathContainer: {
    marginVertical: 8,
  },
  placeholder: {
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ccc',
    marginVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
  },
  codeBlock: {
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 4,
    marginVertical: 8,
  },
  codeText: {
    fontFamily: 'Menlo',
    fontSize: 12,
    color: '#262626',
  },
});
