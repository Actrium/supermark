import React from 'react';
import { Supramark, type SupramarkWebProps } from './Supramark.js';

export interface SupramarkViewProps extends SupramarkWebProps {
  /** Custom className for the container */
  className?: string;
  /** Custom style for the container */
  style?: React.CSSProperties;
}

/**
 * SupramarkView - standard display container
 *
 * A component with standard typography styles applied.
 *
 * Note: the list of plugins to enable must be passed via `config.features`.
 * Recommended to pair with `allFeatures`, or load features on demand.
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
