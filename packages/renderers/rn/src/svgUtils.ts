// 统一的 SVG 预处理工具，用于将 Mermaid / MathJax 生成的 SVG
// 调整为更适合 react-native-svg 渲染的形式。

/**
 * Lightweight SVG cleanup for engines (like ECharts) that already produce
 * well-formed SVG with inline styles.
 *
 * Only strips XML prolog / doctype / comments / metadata that
 * react-native-svg cannot handle. Does NOT inject default
 * Mermaid-oriented fills/strokes, and does NOT strip inter-tag text
 * nodes aggressively.
 */
export function normalizeSvgLight(xml: string): string {
  let normalized = xml;

  normalized = normalized
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!doctype[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title[\s\S]*?<\/title>/gi, '')
    .replace(/<desc[\s\S]*?<\/desc>/gi, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '');

  // Remove <style> blocks (already inlined by WebView bridge)
  normalized = normalized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Collapse whitespace-only text nodes between tags (safe)
  normalized = normalized.replace(/>\s+</g, '><');

  return normalized;
}

/**
 * 规范化 SVG：
 * - 移除 <style> 标签（react-native-svg 不支持内联 CSS）
 * - 为常见元素添加一些默认样式（主要针对 Mermaid 导出的图表）
 *
 * 对于 MathJax 导出的公式 SVG，即使没有这些默认样式，也能正常显示；
 * 因此本函数可以安全地复用于 diagram / math 两类场景。
 */
export function normalizeSvg(xml: string): string {
  let normalized = xml;

  // Preserve semantic text nodes first. We'll strip other inter-tag raw text later.
  const preservedTextNodes: string[] = [];
  normalized = normalized.replace(/<text\b[\s\S]*?<\/text>/gi, match => {
    const token = `<smtext_placeholder data-i="${preservedTextNodes.length}" />`;
    preservedTextNodes.push(match);
    return token;
  });

  // Remove XML prolog / doctype / metadata-ish nodes that react-native-svg may not handle.
  normalized = normalized
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!doctype[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title[\s\S]*?<\/title>/gi, '')
    .replace(/<desc[\s\S]*?<\/desc>/gi, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '');

  // Collapse inter-tag whitespace text nodes, which can otherwise become
  // raw string children in react-native-svg AST rendering.
  normalized = normalized.replace(/>\s+</g, '><');
  // Drop any remaining raw text nodes between tags (outside preserved <text> nodes),
  // because RN SVG AST cannot host bare string children in many containers.
  normalized = normalized.replace(/>[^<]+</g, '><');

  const styleMatch = normalized.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  let defaultTextFill = '#333';
  let defaultFontFamily = 'Arial, sans-serif';
  let defaultFontSize = '16px';
  let defaultNodeFill = '#ECECFF';
  let defaultStroke = '#9370DB';
  let defaultStrokeWidth = '1px';

  if (styleMatch) {
    const styleContent = styleMatch[1];

    const textFillMatch = styleContent.match(/\.label[^}]*fill\s*:\s*([^;}\s]+)/);
    if (textFillMatch) defaultTextFill = textFillMatch[1];

    const fontFamilyMatch = styleContent.match(/font-family\s*:\s*([^;}\n]+)/);
    if (fontFamilyMatch) defaultFontFamily = fontFamilyMatch[1];

    const fontSizeMatch = styleContent.match(/font-size\s*:\s*([^;}\s]+)/);
    if (fontSizeMatch) defaultFontSize = fontSizeMatch[1];

    const nodeFillMatch = styleContent.match(/\.node\s+rect[^}]*fill\s*:\s*([^;}\s]+)/);
    if (nodeFillMatch) defaultNodeFill = nodeFillMatch[1];

    const strokeMatch = styleContent.match(/\.node\s+rect[^}]*stroke\s*:\s*([^;}\s]+)/);
    if (strokeMatch) defaultStroke = strokeMatch[1];

    const strokeWidthMatch = styleContent.match(/\.node\s+rect[^}]*stroke-width\s*:\s*([^;}\s]+)/);
    if (strokeWidthMatch) defaultStrokeWidth = strokeWidthMatch[1];
  }

  // 移除 <style>...</style> 标签（react-native-svg 不支持）
  normalized = normalized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // 为所有 text 元素添加默认样式
  normalized = normalized.replace(
    /<text([^>]*?)style="([^"]*)"/gi,
    (match, attrs, existingStyle) => {
      const styles: string[] = [];
      if (existingStyle && existingStyle.trim()) styles.push(existingStyle.trim());

      if (!existingStyle.includes('fill:')) styles.push(`fill: ${defaultTextFill}`);
      if (!existingStyle.includes('font-family:')) styles.push(`font-family: ${defaultFontFamily}`);
      if (!existingStyle.includes('font-size:')) styles.push(`font-size: ${defaultFontSize}`);

      const attrsWithSpace = attrs && attrs.trim() ? attrs + ' ' : attrs;
      return `<text${attrsWithSpace}style="${styles.join('; ')}"`;
    }
  );

  // 为所有 rect 元素添加默认样式
  normalized = normalized.replace(
    /<rect([^>]*?)style="([^"]*)"/gi,
    (match, attrs, existingStyle) => {
      const styles: string[] = [];
      if (existingStyle && existingStyle.trim()) styles.push(existingStyle.trim());

      if (!existingStyle?.includes('fill:')) styles.push(`fill: ${defaultNodeFill}`);
      if (!existingStyle?.includes('stroke:')) styles.push(`stroke: ${defaultStroke}`);
      if (!existingStyle?.includes('stroke-width:'))
        styles.push(`stroke-width: ${defaultStrokeWidth}`);

      const attrsWithSpace = attrs && attrs.trim() ? attrs + ' ' : attrs;
      return `<rect${attrsWithSpace}style="${styles.join('; ')}"`;
    }
  );

  // 为 path 元素添加默认样式（主要用于箭头等）
  normalized = normalized.replace(
    /<path\s+([^>]*?)style="([^"]*)"/gi,
    (match, attrs, existingStyle) => {
      const styles: string[] = [];
      if (existingStyle && existingStyle.trim()) {
        styles.push(existingStyle.trim());
      }

      if (!existingStyle?.includes('fill:')) {
        styles.push(`fill: ${defaultStroke}`);
      }
      if (!existingStyle?.includes('stroke:') && !existingStyle?.includes('stroke-width:')) {
        styles.push(`stroke: ${defaultStroke}`);
      }

      return `<path ${attrs}style="${styles.join('; ')}"`;
    }
  );

  // Restore preserved text-bearing SVG nodes.
  normalized = normalized.replace(
    /<smtext_placeholder\s+data-i="(\d+)"\s*\/>/g,
    (_m, indexText) => preservedTextNodes[Number(indexText)] ?? ''
  );

  return normalized;
}
