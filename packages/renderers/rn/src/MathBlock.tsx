import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { SupramarkMathBlockNode } from '@supramark/core';
import { normalizeSvg } from './svgUtils';

/**
 * 公共 LaTeX → SVG 渲染服务。
 * RN 环境无法直接运行 KaTeX（输出 HTML，RN 不支持），
 * 因此通过远程服务将 TeX 转换为 SVG，再用 react-native-svg 渲染。
 */
const LATEX_SVG_BASE = 'https://latex.codecogs.com/svg.latex';

interface MathBlockProps {
  node: SupramarkMathBlockNode;
}

export const MathBlock: React.FC<MathBlockProps> = ({ node }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSvg(null);

    // 拼接 \displaystyle 以块级模式渲染，提升 DPI 适配高分屏
    const tex = `\\dpi{200} \\displaystyle ${node.value}`;
    const url = `${LATEX_SVG_BASE}?${encodeURIComponent(tex)}`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(svgText => {
        if (cancelled) return;
        if (!svgText.includes('<svg')) {
          throw new Error('Response is not valid SVG');
        }
        try {
          const normalized = normalizeSvg(svgText);
          setSvg(normalized);
        } catch (err) {
          if (__DEV__) {
            console.error('[Supramark MathBlock] normalize svg failed, fallback to TeX:', err);
          }
        }
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        if (__DEV__) {
          console.error('[Supramark MathBlock] fetch SVG failed, fallback to TeX:', err);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [node.value]);

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
