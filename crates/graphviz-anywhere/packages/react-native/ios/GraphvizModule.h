/*
 * GraphvizModule.h
 *
 * React Native native module for Graphviz rendering.
 * Supports both old architecture (RCTBridgeModule) and
 * new architecture (TurboModules) via RCT_NEW_ARCH_ENABLED.
 *
 * Licensed under the Apache License, Version 2.0
 */

#import <React/RCTBridgeModule.h>

#ifdef RCT_NEW_ARCH_ENABLED
#import <GraphvizNativeSpec/GraphvizNativeSpec.h>
#endif

@interface GraphvizModule : NSObject <RCTBridgeModule
#ifdef RCT_NEW_ARCH_ENABLED
  , NativeGraphvizSpec
#endif
>

@end
