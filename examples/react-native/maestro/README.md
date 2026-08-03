# Selection E2E

This folder contains Maestro flows for the React Native selection demo.

Run the iOS flow from a macOS machine with a booted simulator:

```bash
MAESTRO_DEVICE_UDID=<simulator-udid> bun --filter @supramark/example-react-native e2e:selection:ios
```

The runner sets `SUPRAMARK_RN_E2E=selection`, starts the Expo dev server,
builds and installs the selection-only iOS harness, runs the Maestro flow, and
restores generated CocoaPods/Xcode files before exiting.

If macOS system proxying is enabled, make sure `localhost` and `127.0.0.1` are
in the bypass list. The iOS simulator loads the Metro bundle through that local
URL.
