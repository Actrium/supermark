import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { SupramarkMathBlockNode } from '@supramark/core';
import { useDiagramRender } from '@supramark/rn-diagram-worker';
import { normalizeSvg } from './svgUtils';

interface MathBlockProps {
  node: SupramarkMathBlockNode;
}

export const MathBlock: React.FC<MathBlockProps> = ({ node }) => {
  const { render } = useDiagramRender();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSvg(null);

    render({
      engine: 'math',
      code: node.value,
      options: { displayMode: true },
    })
      .then((result) => {
        if (cancelled) return;

        if (!result.success || result.format !== 'svg') {
          const msg =
            result.error?.message ||
            result.payload ||
            'Math rendering failed';
          setError(msg);
          setLoading(false);
          return;
        }

        try {
          const normalized = normalizeSvg(result.payload);
          setSvg(normalized);
          setLoading(false);
        } catch (err) {
          setError(String(err));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [node.value, render]);

  if (loading && !svg && !error) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator size="small" />
        <Text style={styles.placeholderText}>正在渲染公式...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.errorText}>公式渲染错误：{error}</Text>
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

  // 完全没有结果时，回退为原始 TeX 文本
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>{node.value}</Text>
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
  errorText: {
    fontSize: 12,
    color: '#d4380d',
  },
});

