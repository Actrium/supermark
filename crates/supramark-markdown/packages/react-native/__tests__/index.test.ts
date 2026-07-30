import { describe, expect, it, mock } from 'bun:test';
import {
  getNativeParserAdapter,
  listNativeParserAdapters,
} from '@supramark/core/rn';

// Records the calls the mock native module received, verifying the wrapper
// does not bypass the RN bridge.
const nativeCalls: string[] = [];

// Simulates NativeModules.SupramarkMarkdownNative under the Old Architecture.
const nativeMarkdownModule = {
  parseJson: async (source: string) => {
    nativeCalls.push(`parse:${source}`);
    return JSON.stringify({ type: 'root', ast_version: 2, source });
  },
  getVersion: async () => {
    nativeCalls.push('version');
    return 'mock-markdown-native';
  },
};

mock.module('react-native', () => ({
  NativeModules: {
    SupramarkMarkdownNative: nativeMarkdownModule,
  },
  Platform: {
    select: (options: Record<string, string | undefined>) => options.default ?? '',
  },
  TurboModuleRegistry: {
    getEnforcing: () => undefined,
  },
}));

describe('@supramark/markdown-native-rn', () => {
  it('registers the native parser adapter on package import and forwards calls to the RN native module', async () => {
    expect(listNativeParserAdapters()).toEqual([]);

    const markdownNative = await import('../src/index');
    const adapter = getNativeParserAdapter();

    expect(adapter).toBeDefined();
    expect(listNativeParserAdapters()).toEqual([adapter]);
    expect(await adapter?.parseJson('# title')).toBe(
      JSON.stringify({ type: 'root', ast_version: 2, source: '# title' })
    );
    expect(await markdownNative.parseJsonNative('direct')).toBe(
      JSON.stringify({ type: 'root', ast_version: 2, source: 'direct' })
    );
    expect(await markdownNative.getNativeVersion()).toBe('mock-markdown-native');
    expect(nativeCalls).toEqual(['parse:# title', 'parse:direct', 'version']);
  });
});
