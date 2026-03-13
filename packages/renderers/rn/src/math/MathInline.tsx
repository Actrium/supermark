import React, { useState, useEffect } from 'react';
import { Text, type TextStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { normalizeSvgLight } from '../svgUtils';
import { getSvgViewBoxSize, renderMathJaxSvg } from './mathjax';

interface MathInlineProps {
  value: string;
  textStyle?: TextStyle;
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
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setDimensions(null);
    setSvg(null);

    renderMathJaxSvg(value, { displayMode: false })
      .then(result => {
        if (cancelled) return;
        const normalized = normalizeSvgLight(result);
        const size = getSvgViewBoxSize(normalized);
        if (!size) {
          throw new Error('Math SVG viewBox is missing');
        }

        const targetHeight = fontSize * 1.2;
        const scale = targetHeight / size.height;
        setSvg(normalized);
        setDimensions({
          width: Math.max(1, Math.ceil(size.width * scale)),
          height: Math.max(1, Math.ceil(targetHeight)),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [value, fontSize]);

  if (failed || !dimensions || !svg) {
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
    <SvgXml
      xml={svg}
      width={dimensions.width}
      height={dimensions.height}
    />
  );
};
