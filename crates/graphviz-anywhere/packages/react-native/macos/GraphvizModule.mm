/*
 * GraphvizModule.mm (macOS)
 *
 * React Native native module implementation for macOS.
 * Manages a singleton Graphviz context and dispatches rendering
 * to a background queue to keep the JS thread responsive.
 *
 * This is functionally identical to the iOS implementation, built
 * separately to allow platform-specific podspec configuration.
 *
 * Licensed under the Apache License, Version 2.0
 */

#import "GraphvizModule.h"
#import "graphviz_api.h"

#import <React/RCTLog.h>

@implementation GraphvizModule {
    gv_context_t *_context;
    dispatch_queue_t _renderQueue;
}

RCT_EXPORT_MODULE(GraphvizNative)

- (instancetype)init {
    self = [super init];
    if (self) {
        _renderQueue = dispatch_queue_create("com.graphviznative.render", DISPATCH_QUEUE_SERIAL);
        _context = NULL;
    }
    return self;
}

- (void)dealloc {
    if (_context) {
        gv_context_free(_context);
        _context = NULL;
    }
}

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

/**
 * Lazily initializes the Graphviz context on the render queue.
 * Must be called from within a dispatch to _renderQueue.
 */
- (gv_context_t *)ensureContext {
    if (!_context) {
        _context = gv_context_new();
        if (!_context) {
            RCTLogError(@"GraphvizNative: failed to create Graphviz context");
        }
    }
    return _context;
}

/**
 * Map native error codes to JS-friendly error code strings.
 */
static NSString *errorCodeToString(gv_error_t err) {
    switch (err) {
        case GV_ERR_NULL_INPUT:       return @"NULL_INPUT";
        case GV_ERR_INVALID_DOT:      return @"INVALID_DOT";
        case GV_ERR_LAYOUT_FAILED:    return @"LAYOUT_FAILED";
        case GV_ERR_RENDER_FAILED:    return @"RENDER_FAILED";
        case GV_ERR_INVALID_ENGINE:   return @"INVALID_ENGINE";
        case GV_ERR_INVALID_FORMAT:   return @"INVALID_FORMAT";
        case GV_ERR_OUT_OF_MEMORY:    return @"OUT_OF_MEMORY";
        case GV_ERR_NOT_INITIALIZED:  return @"NOT_INITIALIZED";
        default:                      return @"UNKNOWN";
    }
}

/**
 * Returns YES for text-based output formats that do not need base64 encoding.
 */
static BOOL isTextFormat(NSString *format) {
    static NSSet *textFormats;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        textFormats = [NSSet setWithArray:@[@"svg", @"json", @"dot", @"xdot", @"plain"]];
    });
    return [textFormats containsObject:format];
}

RCT_EXPORT_METHOD(renderDot:(NSString *)dot
                  engine:(NSString *)engine
                  format:(NSString *)format
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    dispatch_async(_renderQueue, ^{
        gv_context_t *ctx = [self ensureContext];
        if (!ctx) {
            reject(@"NOT_INITIALIZED", @"Failed to initialize Graphviz context", nil);
            return;
        }

        char *outData = NULL;
        size_t outLength = 0;

        gv_error_t err = gv_render(
            ctx,
            [dot UTF8String],
            [engine UTF8String],
            [format UTF8String],
            &outData,
            &outLength
        );

        if (err != GV_OK) {
            NSString *code = errorCodeToString(err);
            NSString *message = [NSString stringWithUTF8String:gv_strerror(err)];
            reject(code, message, nil);
            if (outData) {
                gv_free_render_data(outData);
            }
            return;
        }

        NSString *result;
        if (isTextFormat(format)) {
            result = [[NSString alloc] initWithBytes:outData
                                              length:outLength
                                            encoding:NSUTF8StringEncoding];
        } else {
            NSData *data = [NSData dataWithBytesNoCopy:outData
                                                length:outLength
                                          freeWhenDone:NO];
            result = [data base64EncodedStringWithOptions:0];
        }

        gv_free_render_data(outData);

        if (!result) {
            reject(@"RENDER_FAILED", @"Failed to convert render output to string", nil);
            return;
        }

        resolve(result);
    });
}

RCT_EXPORT_METHOD(getVersion:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    const char *version = gv_version();
    if (version) {
        resolve([NSString stringWithUTF8String:version]);
    } else {
        reject(@"UNKNOWN", @"Failed to get Graphviz version", nil);
    }
}

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
    return std::make_shared<facebook::react::NativeGraphvizSpecJSI>(params);
}
#endif

@end
