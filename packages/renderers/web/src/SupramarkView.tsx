import React from 'react';
import { Supramark, type SupramarkWebProps } from './Supramark.js';

export interface SupramarkViewProps extends SupramarkWebProps {
  /** 容器自定义类名 */
  className?: string;
  /** 容器自定义样式 */
  style?: React.CSSProperties;
}

/**
 * SupramarkView - 标准展示容器
 *
 * 这是一个带有标准排版样式的组件。
 *
 * 注意：必须通过 `config.features` 传入需要启用的插件列表。
 * 推荐配合 `allFeatures` 使用，或按需加载。
 */
export const SupramarkView: React.FC<SupramarkViewProps> = ({
  className,
  style,
  config,
  ...props
}) => {
  const defaultStyle: React.CSSProperties = {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px',
    lineHeight: '1.6',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  };

  return (
    <div
      className={`supramark-view-container ${className || ''}`}
      style={{ ...defaultStyle, ...style }}
    >
      <Supramark {...props} config={config} />
    </div>
  );
};
