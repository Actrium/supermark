import React, { useState, useEffect } from 'react';
import { Image, PixelRatio, Text, type TextStyle } from 'react-native';
import { useOptionalDiagramWebViewBridge } from '@supramark/rn-diagram-worker';

/**
 * 行内公式渲染：通过 headless WebView 中的 MathJax 先生成 SVG，再光栅化为 PNG，
 * 最终仍用 Image 嵌入 Text 流中，保留 RN 行内排版能力。
 */
interface MathInlineProps {
  value: string;
  textStyle?: TextStyle;
}

export const MathInline: React.FC<MathInlineProps> = ({
  value,
  textStyle,
}) => {
  const webViewBridgeRef = useOptionalDiagramWebViewBridge();
  const fontSize = textStyle?.fontSize ?? 16;
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setDimensions(null);
    setUri(null);

    const bridge = webViewBridgeRef?.current;
    if (!bridge || !bridge.engines.includes('math')) {
      setFailed(true);
      return;
    }

    bridge.render({
      engine: 'math',
      code: value,
      options: {
        displayMode: false,
        output: 'png',
        pixelRatio: PixelRatio.get(),
      },
    })
      .then(result => {
        if (cancelled) return;
        if (!result.success || result.format !== 'png' || !result.payload.startsWith('data:image/png')) {
          throw new Error(result.error?.details || result.payload || 'Math PNG render failed');
        }

        const pngUri = result.payload;
        setUri(pngUri);
        Image.getSize(
          pngUri,
          (w, h) => {
            if (cancelled) return;
            const targetHeight = fontSize * 1.2;
            const scale = targetHeight / h;
            setDimensions({
              width: Math.ceil(w * scale),
              height: Math.ceil(targetHeight),
            });
          },
          () => {
            if (cancelled) return;
            setFailed(true);
          },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [value, fontSize, webViewBridgeRef]);

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
      source={{ uri: uri ?? undefined }}
      style={{ width: dimensions.width, height: dimensions.height }}
      resizeMode="contain"
    />
  );
};
