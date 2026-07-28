cmake_minimum_required(VERSION 3.13)
project(RNSelectableTextSpec)

set(CMAKE_VERBOSE_MAKEFILE ON)
# 用 C++20 但关闭 GNU 扩展，确保用 -std=c++20 而不是 -std=gnu++20，
# 和 RN reactnative_FLAGS 保持一致（避免虚继承布局 ABI 不一致）。
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# react_codegen_RNSelectableTextSpec 是 RN Android autolinking 约定会链接的库名。
add_library(
  react_codegen_RNSelectableTextSpec
  STATIC
  react/renderer/components/selectablerichtext/SelectableRichTextEventEmitter.cpp
  react/renderer/components/selectablerichtext/SelectableRichTextProps.cpp
  react/renderer/components/selectablerichtext/SelectableRichTextShadowNode.cpp
)

# common/cpp 暴露 react/renderer/components/... 头文件路径给 autolinking.cpp 使用。
target_include_directories(
  react_codegen_RNSelectableTextSpec
  PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}
)

# RN prefab 只暴露 ReactAndroid::reactnative 单 target，
# 且 reactnative module 的 export_libraries 为空，jsi、fbjni 都需要单独链接。
# 另外 ParagraphProps.h 内部 include 的 HostPlatformParagraphProps.h 位于
# `react/renderer/components/text/platform/android/` 子目录，prefab 没把它加进
# INTERFACE_INCLUDE_DIRECTORIES，需要库作者自己补 include 路径。
# 用 get_target_property 从 ReactAndroid::reactnative 推导 prefab include 根路径，
# 避免依赖 REACT_COMMON_DIR（子目录 scope 不一定可见）。
get_target_property(_REACTNATIVE_INCLUDE_DIR ReactAndroid::reactnative INTERFACE_INCLUDE_DIRECTORIES)
# 用 PUBLIC 而不是 PRIVATE：autolinking.cpp（属于 appmodules target）会通过
# #include <react/renderer/components/RNSelectableTextSpec/ComponentDescriptors.h>
# 间接 include ParagraphProps.h → HostPlatformParagraphProps.h，
# 因此 platform/android include 路径必须传递给链接 react_codegen_RNSelectableTextSpec 的所有 target。
target_include_directories(
  react_codegen_RNSelectableTextSpec
  PUBLIC
  ${_REACTNATIVE_INCLUDE_DIR}/react/renderer/components/text/platform/android
)

# 必须和 appmodules target 的编译选项完全一致（-Wall -Werror -fexceptions -frtti -std=c++20 + RN_SERIALIZABLE_STATE），
# 否则 -frtti 的开关差异会导致虚继承（ParagraphProps ← ViewProps + BaseTextProps）的
# vtable 布局不一致，SelectableRichTextProps 成员偏移在两个 target 里不同，
# 同一对象在不同编译单元读取到不同的成员值（如 fontSize、isSelectable 读成 0）。
# 用 RN 提供的 target_compile_reactnative_options 统一设置。
find_file(_RN_FLAGS_CMAKE react-native-flags.cmake PATHS ${_REACTNATIVE_INCLUDE_DIR}/../ReactCommon/cmake-utils NO_DEFAULT_PATH)
if(_RN_FLAGS_CMAKE)
  include(${_RN_FLAGS_CMAKE})
  target_compile_reactnative_options(react_codegen_RNSelectableTextSpec PRIVATE)
else()
  # fallback：手动设置和 reactnative_FLAGS 一致的选项
  target_compile_options(
    react_codegen_RNSelectableTextSpec
    PRIVATE
    -Wall
    -Werror
    -fexceptions
    -frtti
    -std=c++20
  )
  target_compile_definitions(react_codegen_RNSelectableTextSpec PRIVATE RN_SERIALIZABLE_STATE)
endif()

# 用 plain 签名（不带 PUBLIC/PRIVATE）以和 ReactNative-application.cmake 的
# target_link_libraries(${autolinked_library} common_flags) 保持一致，避免 keyword/plain 冲突。
target_link_libraries(
  react_codegen_RNSelectableTextSpec
  ReactAndroid::reactnative
  ReactAndroid::jsi
  fbjni::fbjni
  log
)
