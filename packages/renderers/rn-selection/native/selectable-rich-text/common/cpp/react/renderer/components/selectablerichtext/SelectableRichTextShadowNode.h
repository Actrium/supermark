#pragma once

#include <react/renderer/components/selectablerichtext/SelectableRichTextEventEmitter.h>
#include <react/renderer/components/selectablerichtext/SelectableRichTextProps.h>
#include <react/renderer/components/text/BaseTextShadowNode.h>
#include <react/renderer/components/text/ParagraphState.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/core/LayoutContext.h>
#include <react/renderer/core/ShadowNode.h>
#include <react/renderer/textlayoutmanager/TextLayoutManager.h>
#include <react/renderer/textlayoutmanager/TextLayoutManagerExtended.h>

namespace facebook::react {

extern const char SelectableRichTextComponentName[];

/*
 * ShadowNode for <SelectableRichText>.
 * It mirrors RN ParagraphShadowNode but swaps in SelectableRichTextProps/EventEmitter.
 */
class SelectableRichTextShadowNode
    : public ConcreteViewShadowNode<
          SelectableRichTextComponentName,
          SelectableRichTextProps,
          SelectableRichTextEventEmitter,
          ParagraphState>,
      public BaseTextShadowNode {
 public:
  using ConcreteViewShadowNode::ConcreteViewShadowNode;

  SelectableRichTextShadowNode(
      const ShadowNodeFragment &fragment,
      const ShadowNodeFamily::Shared &family,
      ShadowNodeTraits traits);

  SelectableRichTextShadowNode(const ShadowNode &sourceShadowNode, const ShadowNodeFragment &fragment);

  static ShadowNodeTraits BaseTraits()
  {
    auto traits = ConcreteViewShadowNode::BaseTraits();
    traits.set(ShadowNodeTraits::Trait::LeafYogaNode);
    traits.set(ShadowNodeTraits::Trait::MeasurableYogaNode);
    traits.set(ShadowNodeTraits::Trait::BaselineYogaNode);

#ifdef ANDROID
    traits.unset(ShadowNodeTraits::Trait::FormsStackingContext);
#endif

    return traits;
  }

  // setTextLayoutManager 注入 RN TextLayoutManager，用于测量、baseline 和 ParagraphState。
  void setTextLayoutManager(std::shared_ptr<const TextLayoutManager> textLayoutManager);

  void layout(LayoutContext layoutContext) override;
  Size measureContent(const LayoutContext &layoutContext, const LayoutConstraints &layoutConstraints) const override;
  Float baseline(const LayoutContext &layoutContext, Size size) const override;

  class Content final {
   public:
    AttributedString attributedString;
    ParagraphAttributes paragraphAttributes;
    Attachments attachments;
  };

 protected:
  bool shouldNewRevisionDirtyMeasurement(const ShadowNode &sourceShadowNode, const ShadowNodeFragment &fragment)
      const override;

 private:
  void initialize() noexcept;
  const Content &getContent(const LayoutContext &layoutContext) const;
  Content getContentWithMeasuredAttachments(
      const LayoutContext &layoutContext,
      const LayoutConstraints &layoutConstraints) const;

  template <typename ParagraphStateT>
  void updateStateIfNeeded(const Content &content, const MeasuredPreparedLayout &layout);

  void updateStateIfNeeded(const Content &content);
  MeasuredPreparedLayout *findUsableLayout();
  Size rawContentSize();

  std::shared_ptr<const TextLayoutManager> textLayoutManager_;
  mutable std::optional<Content> content_{};
  mutable std::vector<MeasuredPreparedLayout> measuredLayouts_;
};

} // namespace facebook::react
