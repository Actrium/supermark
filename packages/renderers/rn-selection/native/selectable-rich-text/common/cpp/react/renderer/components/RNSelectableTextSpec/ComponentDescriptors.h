#pragma once

// ComponentDescriptors.h is the #include target reached by autolinking.cpp.
// Because codegenConfig sets interfaceOnly: true, RN codegen never generates this file,
// so this library provides it manually, forwarding to the actual hand-written
// ComponentDescriptor header.

#include <react/renderer/components/selectablerichtext/SelectableRichTextComponentDescriptor.h>
