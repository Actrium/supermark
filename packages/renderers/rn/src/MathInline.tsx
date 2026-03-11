import React, { useState, useEffect } from 'react';
import { Image, Text } from 'react-native';

/**
 * 行内公式渲染：通过公共服务获取 PNG 图片，用 Image 嵌入 Text 流中。
 * 使用 PNG 而非 SVG，因为 RN 的 Image 组件支持 PNG 且可嵌套在 Text 内实现行内排版。
 */
const LATEX_PNG_BASE = 'https://latex.codecogs.com/png.latex';

interface MathInlineProps {
  value: string;
  textStyle?: { fontSize?: number; color?: string };
}

export const MathInline: React.FC<MathInlineProps> = ({
  value,
  textStyle,
}) => {
  const fontSize = textStyle?.fontSize ?? 16;
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  const tex = `\\dpi{150} ${value}`;
  const url = `${LATEX_PNG_BASE}?${encodeURIComponent(tex)}`;

  useEffect(() => {
    setFailed(false);
    setDimensions(null);

    Image.getSize(
      url,
      (w, h) => {
        // 按行高等比缩放，保持与周围文字对齐
        const targetHeight = fontSize * 1.2;
        const scale = targetHeight / h;
        setDimensions({
          width: Math.ceil(w * scale),
          height: Math.ceil(targetHeight),
        });
      },
      () => setFailed(true),
    );
  }, [url, fontSize]);

  // 加载失败或等待尺寸时，用带样式标记的 TeX 源码兜底
  if (failed || !dimensions) {
    return (
      <Text
        style={{
          fontFamily: 'Menlo',
          fontSize: fontSize * 0.8,
          backgroundColor: '#f0eaff',
          color: '#6b21a8',
          paddingHorizontal: 3,
          borderRadius: 2,
        }}
      >
        {value}
      </Text>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={{ width: dimensions.width, height: dimensions.height }}
      resizeMode="contain"
    />
  );
};
