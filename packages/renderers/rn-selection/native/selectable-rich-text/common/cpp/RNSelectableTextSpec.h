#pragma once

// RNSelectableTextSpec is a stub standing in for the codegen entry header.
// Because SelectableRichText is a pure Fabric component library (no TurboModule),
// and the spec sets interfaceOnly: true to stop codegen from generating a plain View C++ class,
// Android's autolinking.cpp still does #include <RNSelectableTextSpec.h> and calls
// RNSelectableTextSpec_ModuleProvider, so an inline implementation returning nullptr is provided here.
// Note: codegenConfig.name is still RNSelectableTextSpec, so the header name and function name stay in sync.

#include <memory>
#include <string>
#include <ReactCommon/CallInvoker.h>
#include <ReactCommon/JavaTurboModule.h>
#include <ReactCommon/TurboModule.h>

namespace facebook::react {

// RNSelectableTextSpec_ModuleProvider is the TurboModule provider called by autolinking.cpp.
// SelectableRichText provides no TurboModule at all, so this always returns nullptr.
inline std::shared_ptr<TurboModule> RNSelectableTextSpec_ModuleProvider(
    const std::string /*moduleName*/,
    const JavaTurboModule::InitParams & /*params */) {
  return nullptr;
}

} // namespace facebook::react
