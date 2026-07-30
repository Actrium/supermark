import {
  __resetNativeParserRegistryForTests,
  getNativeParserAdapter,
  listNativeParserAdapters,
  parseViaNative,
  registerNativeParserAdapter,
  type NativeParserAdapter,
} from '../src/parser-native-adapter';
import { loadRustMarkdownModule } from '../src/plugin-loader-rn';

describe('native markdown parser adapter', () => {
  beforeEach(() => {
    // Each test case starts from an empty registry, avoiding last-wins state leaking
    // into the next test.
    __resetNativeParserRegistryForTests();
  });

  it('returns an empty routing result when no native adapter is registered', async () => {
    expect(getNativeParserAdapter()).toBeUndefined();
    expect(listNativeParserAdapters()).toEqual([]);
    expect(await parseViaNative('# title')).toBeNull();
  });

  it('returns the AST JSON via parseViaNative once a native adapter is registered', async () => {
    // Simulate the AST v2 JSON string returned by an RN native module.
    const rootJson = JSON.stringify({ type: 'root', ast_version: 2, children: [] });

    // Register a minimal native adapter to verify the registry forwards the
    // Markdown source through to it.
    const adapter: NativeParserAdapter = {
      parseJson: async source => JSON.stringify({ source, parsed: rootJson }),
      getVersion: async () => 'test-native',
    };

    registerNativeParserAdapter(adapter);

    expect(getNativeParserAdapter()).toBe(adapter);
    expect(listNativeParserAdapters()).toEqual([adapter]);
    expect(await adapter.getVersion?.()).toBe('test-native');
    expect(await parseViaNative('# title')).toBe(
      JSON.stringify({ source: '# title', parsed: rootJson })
    );
  });

  it('is last-wins across multiple native adapter registrations, while keeping the diagnostic list order', async () => {
    // The first adapter simulates an old native module instance.
    const firstAdapter: NativeParserAdapter = {
      parseJson: async () => JSON.stringify({ type: 'root', from: 'first' }),
    };

    // The second adapter simulates the native module instance after a hot reload or
    // a test-time replacement.
    const secondAdapter: NativeParserAdapter = {
      parseJson: async () => JSON.stringify({ type: 'root', from: 'second' }),
    };

    registerNativeParserAdapter(firstAdapter);
    registerNativeParserAdapter(secondAdapter);

    expect(getNativeParserAdapter()).toBe(secondAdapter);
    expect(listNativeParserAdapters()).toEqual([firstAdapter, secondAdapter]);
    expect(await parseViaNative('source')).toBe(JSON.stringify({ type: 'root', from: 'second' }));
  });

  it('the RN loader throws a clear onboarding error when no native adapter is registered', async () => {
    // Capture the RN loader's error object, to assert it doesn't silently fall back
    // to wasm.
    let thrown: unknown;

    try {
      await loadRustMarkdownModule();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('RN runtime requires native markdown parser adapter');
    expect((thrown as Error).message).toContain("import '@supramark/markdown-native-rn'");
  });

  it('the RN loader exposes an async parseJson once a native adapter is registered', async () => {
    // Simulate the Promise<string> return value of the native bridge, covering the
    // RN TurboModule async path.
    const nativeJson = JSON.stringify({ type: 'root', ast_version: 2, children: [] });

    registerNativeParserAdapter({
      parseJson: async source => JSON.stringify({ source, nativeJson }),
    });

    const mod = await loadRustMarkdownModule();

    expect(typeof mod.parseJson).toBe('function');
    expect(await mod.parseJson?.('hello')).toBe(JSON.stringify({ source: 'hello', nativeJson }));
  });
});
