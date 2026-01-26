import React from 'react';
import type { SupramarkConfig } from '@supramark/core';

export interface WebContainerRenderArgs {
  node: any;
  key: number;
  classNames: any;
  config?: SupramarkConfig;
  renderChildren: (children: any[]) => React.ReactNode;
}

export function renderWeatherContainerWeb({ node, key, classNames }: WebContainerRenderArgs): React.ReactNode {
  const data = (node?.data ?? {}) as {
    city?: string;
    condition?: string;
    tempC?: number;
    icon?: string;
  };

  const city = data.city ?? 'Unknown city';
  const condition = data.condition ?? 'Unknown';
  const tempText = typeof data.tempC === 'number' && !Number.isNaN(data.tempC) ? `${data.tempC}°C` : '--';

  return (
    <div key={key} className={`sm-weather-card ${classNames.paragraph ?? ''}`.trim()}>
      <div className="sm-weather-header">
        <div className="sm-weather-city">{city}</div>
        <div className="sm-weather-temp">{tempText}</div>
      </div>
      <div className="sm-weather-body">
        {data.icon ? <img className="sm-weather-icon" src={data.icon} alt={condition} /> : null}
        <div className="sm-weather-condition">{condition}</div>
      </div>
    </div>
  );
}
