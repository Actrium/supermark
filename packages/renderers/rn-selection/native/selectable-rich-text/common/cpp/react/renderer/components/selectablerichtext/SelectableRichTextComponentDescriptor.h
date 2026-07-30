#pragma once

#include <react/renderer/components/selectablerichtext/SelectableRichTextShadowNode.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/textlayoutmanager/TextLayoutManager.h>
#include <react/utils/ContextContainer.h>

namespace facebook::react {

extern const char TextLayoutManagerKey[];

// SelectableRichTextComponentDescriptor reuses RN Paragraph's TextLayoutManager injection logic.
// RN 0.83's ParagraphComponentDescriptor is a final class and can't be extended;
// only starting in 0.85 is there a non-final BaseParagraphComponentDescriptor base class.
// Here ConcreteComponentDescriptor is extended directly, and ParagraphComponentDescriptor's adopt
// logic is ported over, to keep text measurement and state behavior consistent with RN Paragraph.
class SelectableRichTextComponentDescriptor final
    : public ConcreteComponentDescriptor<SelectableRichTextShadowNode> {
 public:
  explicit SelectableRichTextComponentDescriptor(const ComponentDescriptorParameters &parameters)
      : ConcreteComponentDescriptor<SelectableRichTextShadowNode>(parameters),
        textLayoutManager_(getManagerByName<TextLayoutManager>(contextContainer_, TextLayoutManagerKey))
  {
  }

 protected:
  // adopt injects the TextLayoutManager after the shadow node is created, letting
  // SelectableRichTextShadowNode measure text.
  void adopt(ShadowNode &shadowNode) const override
  {
    ConcreteComponentDescriptor::adopt(shadowNode);

    auto &selectableRichTextShadowNode = static_cast<SelectableRichTextShadowNode &>(shadowNode);
    selectableRichTextShadowNode.setTextLayoutManager(textLayoutManager_);
  }

 private:
  // The shared TextLayoutManager, responsible for text measurement and layout caching.
  const std::shared_ptr<const TextLayoutManager> textLayoutManager_;
};

} // namespace facebook::react
