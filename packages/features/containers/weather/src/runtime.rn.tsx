/**
 * Weather React Native renderer
 *
 * Implements the ContainerRNRenderer interface
 *
 * @packageDocumentation
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getMockWeather } from './mock-weather.js';
import type { ContainerRNRenderArgs } from '@supramark/core';
import type { WeatherData } from './feature.js';

/**
 * condition index → RN emoji (platform-specific, not in shared layer)
 *
 * Shared derivation (temp/humidity/wind/conditionIndex) lives in
 * mock-weather.ts; this only maps the condition for this platform.
 */
const RN_CONDITIONS = ['☀️', '☁️', '🌧️'] as const;

const localStyles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    backgroundColor: '#667eea',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  location: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
  format: {
    fontSize: 10,
    color: 'white',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  icon: {
    fontSize: 48,
  },
  temp: {
    fontSize: 48,
    fontWeight: '300',
    color: 'white',
  },
  unit: {
    fontSize: 24,
    color: 'white',
  },
  details: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  detail: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  error: {
    backgroundColor: '#ffebee',
    borderRadius: 8,
    padding: 12,
    marginVertical: 12,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#c62828',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#c62828',
  },
  errorCode: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#333',
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
});

/**
 * RN renderer for :::weather
 */
export function renderWeatherContainerRN({
  node,
  key,
}: ContainerRNRenderArgs): React.ReactNode {
  const data = (node?.data ?? {}) as unknown as WeatherData;
  const { format, location, units = 'metric', parseError, rawConfig } = data;

  // Show an error message when parsing failed
  if (parseError) {
    return (
      <View key={key} style={localStyles.error}>
        <Text style={localStyles.errorTitle}>⚠️ Weather config error</Text>
        <Text style={localStyles.errorText}>{parseError}</Text>
        {rawConfig && (
          <Text style={localStyles.errorCode}>{rawConfig}</Text>
        )}
      </View>
    );
  }

  // Missing required config
  if (!location) {
    return (
      <View key={key} style={localStyles.error}>
        <Text style={localStyles.errorTitle}>⚠️ Missing location config</Text>
        <Text style={localStyles.errorText}>Please specify the location field in the config</Text>
      </View>
    );
  }

  // Fetch mock weather data
  const weather = getMockWeather(location, units);

  return (
    <View key={key} style={localStyles.container}>
      <View style={localStyles.header}>
        <Text style={localStyles.location}>{location}</Text>
        <Text style={localStyles.format}>{format.toUpperCase()}</Text>
      </View>
      <View style={localStyles.main}>
        <Text style={localStyles.icon}>{RN_CONDITIONS[weather.conditionIndex]}</Text>
        <Text style={localStyles.temp}>
          {weather.temp}
          <Text style={localStyles.unit}>{weather.unit}</Text>
        </Text>
      </View>
      <View style={localStyles.details}>
        <Text style={localStyles.detail}>💧 {weather.humidity}%</Text>
        <Text style={localStyles.detail}>💨 {weather.wind} {weather.windUnit}</Text>
      </View>
    </View>
  );
}
