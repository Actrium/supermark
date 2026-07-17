#pragma once

#include <react/renderer/components/selectablerichtext/SelectableRichTextShadowNode.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/textlayoutmanager/TextLayoutManager.h>
#include <react/utils/ContextContainer.h>

namespace facebook::react {

extern const char TextLayoutManagerKey[];

// SelectableRichTextComponentDescriptor 复用 RN Paragraph 的 TextLayoutManager 注入逻辑。
// RN 0.83 的 ParagraphComponentDescriptor 是 final class，无法继承；
// 0.85 起才有非 final 的 BaseParagraphComponentDescriptor 基类。
// 这里直接继承 ConcreteComponentDescriptor 并把 ParagraphComponentDescriptor 的 adopt 搬过来，
// 保持与 RN Paragraph 一致的文本测量和 state 行为。
class SelectableRichTextComponentDescriptor final
    : public ConcreteComponentDescriptor<SelectableRichTextShadowNode> {
 public:
  explicit SelectableRichTextComponentDescriptor(const ComponentDescriptorParameters &parameters)
      : ConcreteComponentDescriptor<SelectableRichTextShadowNode>(parameters),
        textLayoutManager_(getManagerByName<TextLayoutManager>(contextContainer_, TextLayoutManagerKey))
  {
  }

 protected:
  // adopt 在 shadow node 被创建后注入 TextLayoutManager，让 SelectableRichTextShadowNode 能测量文本。
  void adopt(ShadowNode &shadowNode) const override
  {
    ConcreteComponentDescriptor::adopt(shadowNode);

    auto &selectableRichTextShadowNode = static_cast<SelectableRichTextShadowNode &>(shadowNode);
    selectableRichTextShadowNode.setTextLayoutManager(textLayoutManager_);
  }

 private:
  // 共享的 TextLayoutManager，负责文本测量和布局缓存。
  const std::shared_ptr<const TextLayoutManager> textLayoutManager_;
};

} // namespace facebook::react
