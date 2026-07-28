#pragma once

// RNSelectableTextSpec 是 codegen 入口头文件的等价 stub。
// 由于 SelectableRichText 是纯 Fabric component 库（无 TurboModule），
// 且 spec 设置了 interfaceOnly: true 阻止 codegen 生成普通 View C++，
// Android autolinking.cpp 仍会 #include <RNSelectableTextSpec.h> 并调用
// RNSelectableTextSpec_ModuleProvider，这里提供返回 nullptr 的 inline 实现。
// 注：codegenConfig.name 仍为 RNSelectableTextSpec，因此头文件名和函数名保持一致。

#include <memory>
#include <string>
#include <ReactCommon/CallInvoker.h>
#include <ReactCommon/JavaTurboModule.h>
#include <ReactCommon/TurboModule.h>

namespace facebook::react {

// RNSelectableTextSpec_ModuleProvider 是 autolinking.cpp 调用的 TurboModule provider。
// SelectableRichText 不提供任何 TurboModule，始终返回 nullptr。
inline std::shared_ptr<TurboModule> RNSelectableTextSpec_ModuleProvider(
    const std::string /*moduleName*/,
    const JavaTurboModule::InitParams & /*params */) {
  return nullptr;
}

} // namespace facebook::react
