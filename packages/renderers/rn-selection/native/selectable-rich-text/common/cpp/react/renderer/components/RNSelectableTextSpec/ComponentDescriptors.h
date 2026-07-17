#pragma once

// ComponentDescriptors.h 是 autolinking.cpp 的 #include 目标。
// 由于 codegenConfig 设置了 interfaceOnly: true，RN codegen 不会生成该文件，
// 因此由本库自行提供，转发到实际的手写 ComponentDescriptor 头文件。

#include <react/renderer/components/selectablerichtext/SelectableRichTextComponentDescriptor.h>
