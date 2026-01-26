import React from 'react';
import { View, Text, Image } from 'react-native';
import type { SupramarkConfig } from '@supramark/core';

export interface RNContainerRenderArgs {
  node: any;
  key: number;
  styles: any;
  config?: SupramarkConfig;
  renderChildren: (children: any[]) => React.ReactNode;
}

export function renderWeatherContainerRN({ node, key, styles }: RNContainerRenderArgs): React.ReactNode {
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
    <View key={key} style={[styles?.codeBlock ?? {}, { padding: 12, borderRadius: 10 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={[styles?.strong ?? {}, { fontWeight: '600' }]}>{city}</Text>
        <Text style={[styles?.strong ?? {}, { fontWeight: '700' }]}>{tempText}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {data.icon ? (
          <Image
            source={{ uri: data.icon }}
            style={{ width: 28, height: 28, marginRight: 8 }}
          />
        ) : null}
        <Text style={styles?.paragraph ?? {}}>{condition}</Text>
      </View>
    </View>
  );
}
