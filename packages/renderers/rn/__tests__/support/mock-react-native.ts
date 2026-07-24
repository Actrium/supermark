import { mock } from 'bun:test';

// react-native's JS entry contains Flow syntax (import typeof) that bun cannot load,
// so tests always run against a mock. bun's mock.module registry is process-wide:
// when multiple test files each register their own mock, a later narrow surface
// clobbers an earlier wide one, and already-loaded modules then fail to resolve the
// missing exports (ActivityIndicator disappeared when DiagramNode.test and
// styles.test shared one process). Register the react-native mock here once with
// the full surface; test files import this module instead of calling
// mock.module('react-native') themselves.
// String host components are rendered by react-test-renderer as host nodes,
// which keeps testID-based assertions simple.
mock.module('react-native', () => ({
  View: 'View',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  ScrollView: 'ScrollView',
  Linking: { openURL: () => Promise.resolve() },
  TouchableOpacity: 'TouchableOpacity',
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  StyleSheet: { create: (s: unknown) => s },
}));
