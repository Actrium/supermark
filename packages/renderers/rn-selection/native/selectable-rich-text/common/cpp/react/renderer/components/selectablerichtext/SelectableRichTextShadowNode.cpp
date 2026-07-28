#include "SelectableRichTextShadowNode.h"

#include <cmath>

#include <react/debug/react_native_assert.h>
#include <react/featureflags/ReactNativeFeatureFlags.h>
#include <react/renderer/attributedstring/AttributedStringBox.h>
#include <react/renderer/components/view/ViewShadowNode.h>
#include <react/renderer/components/view/conversions.h>
#include <react/renderer/graphics/rounding.h>
#include <react/renderer/telemetry/TransactionTelemetry.h>
#include <react/renderer/textlayoutmanager/TextLayoutContext.h>
#include <react/utils/FloatComparison.h>

#define assert_valid_size(size, layoutConstraints)  \
  react_native_assert(                              \
      (size).width + kDefaultEpsilon >=             \
          (layoutConstraints).minimumSize.width &&  \
      (size).width - kDefaultEpsilon <=             \
          (layoutConstraints).maximumSize.width &&  \
      (size).height + kDefaultEpsilon >=            \
          (layoutConstraints).minimumSize.height && \
      (size).height - kDefaultEpsilon <=            \
          (layoutConstraints).maximumSize.height)

namespace facebook::react {
using Content = SelectableRichTextShadowNode::Content;

const char SelectableRichTextComponentName[] = "SelectableRichText";

void SelectableRichTextShadowNode::initialize() noexcept
{
#ifdef ANDROID
  // Android 只有 selectable=true 时才把文本节点标记为可键盘聚焦。
  if (getConcreteProps().isSelectable) {
    traits_.set(ShadowNodeTraits::Trait::KeyboardFocusable);
  }
#endif
}

SelectableRichTextShadowNode::SelectableRichTextShadowNode(
    const ShadowNodeFragment &fragment,
    const ShadowNodeFamily::Shared &family,
    ShadowNodeTraits traits)
    : ConcreteViewShadowNode(fragment, family, traits)
{
  initialize();
}

SelectableRichTextShadowNode::SelectableRichTextShadowNode(
    const ShadowNode &sourceShadowNode,
    const ShadowNodeFragment &fragment)
    : ConcreteViewShadowNode(sourceShadowNode, fragment)
{
  initialize();
}

bool SelectableRichTextShadowNode::shouldNewRevisionDirtyMeasurement(
    const ShadowNode & /*sourceShadowNode*/,
    const ShadowNodeFragment &fragment) const
{
  return fragment.props != nullptr;
}

const Content &SelectableRichTextShadowNode::getContent(const LayoutContext &layoutContext) const
{
  // content_ 命中时复用上一次构建的 AttributedString，避免重复遍历文本子树。
  if (content_.has_value()) {
    return content_.value();
  }

  ensureUnsealed();

  auto textAttributes = TextAttributes::defaultTextAttributes();
  textAttributes.fontSizeMultiplier = layoutContext.fontSizeMultiplier;
  textAttributes.apply(getConcreteProps().textAttributes);
  textAttributes.layoutDirection = YGNodeLayoutGetDirection(&yogaNode_) == YGDirectionRTL
      ? LayoutDirection::RightToLeft
      : LayoutDirection::LeftToRight;
  auto attributedString = AttributedString{};
  auto attachments = Attachments{};
  buildAttributedString(textAttributes, *this, attributedString, attachments);
  attributedString.setBaseTextAttributes(textAttributes);

  content_ = Content{attributedString, getConcreteProps().paragraphAttributes, attachments};

  return content_.value();
}

Content SelectableRichTextShadowNode::getContentWithMeasuredAttachments(
    const LayoutContext &layoutContext,
    const LayoutConstraints &layoutConstraints) const
{
  auto content = getContent(layoutContext);

  // 没有 attachment 时不需要递归测量嵌入节点。
  if (content.attachments.empty()) {
    return content;
  }

  auto localLayoutConstraints = layoutConstraints;
  localLayoutConstraints.minimumSize = Size{0, 0};

  auto &fragments = content.attributedString.getFragments();

  for (const auto &attachment : content.attachments) {
    auto laytableShadowNode = dynamic_cast<const LayoutableShadowNode *>(attachment.shadowNode);

    // attachment 不是可布局节点时跳过，保持 RN Paragraph 的容错行为。
    if (laytableShadowNode == nullptr) {
      continue;
    }

    auto size = laytableShadowNode->measure(layoutContext, localLayoutConstraints);
    size.width += 0.01f;
    size.height += 0.01f;
    size = roundToPixel<&ceil>(size, layoutContext.pointScaleFactor);

    auto fragmentLayoutMetrics = LayoutMetrics{};
    fragmentLayoutMetrics.pointScaleFactor = layoutContext.pointScaleFactor;
    fragmentLayoutMetrics.frame.size = size;
    fragments[attachment.fragmentIndex].parentShadowView.layoutMetrics = fragmentLayoutMetrics;
  }

  return content;
}

void SelectableRichTextShadowNode::setTextLayoutManager(std::shared_ptr<const TextLayoutManager> textLayoutManager)
{
  ensureUnsealed();
  textLayoutManager_ = std::move(textLayoutManager);
}

template <typename ParagraphStateT>
void SelectableRichTextShadowNode::updateStateIfNeeded(
    const Content &content,
    const MeasuredPreparedLayout &layout)
{
  ensureUnsealed();

  auto &state = static_cast<const ParagraphStateT &>(getStateData());

  react_native_assert(textLayoutManager_);

  // 状态内容完全一致时不重复 setStateData，避免无意义 mounting 更新。
  if (state.measuredLayout.measurement.size == layout.measurement.size &&
      state.attributedString == content.attributedString &&
      state.paragraphAttributes == content.paragraphAttributes) {
    return;
  }

  setStateData(ParagraphStateT{content.attributedString, content.paragraphAttributes, textLayoutManager_, layout});
}

void SelectableRichTextShadowNode::updateStateIfNeeded(const Content &content)
{
  ensureUnsealed();

  auto &state = getStateData();

  react_native_assert(textLayoutManager_);

  // AttributedString 未变化时不更新 ParagraphState。
  if (state.attributedString == content.attributedString) {
    return;
  }

  setStateData(ParagraphState{content.attributedString, content.paragraphAttributes, textLayoutManager_});
}

MeasuredPreparedLayout *SelectableRichTextShadowNode::findUsableLayout()
{
  MeasuredPreparedLayout *ret = nullptr;

  // Prepared layout 只在当前平台支持时复用测量结果。
  if constexpr (TextLayoutManagerExtended::supportsPreparedLayout()) {
    auto expectedSize = rawContentSize();
    for (auto &prevLayout : measuredLayouts_) {
      // 尺寸完全匹配当前 Yoga 结果时，这个 prepared layout 才能用于最终 state。
      if (floatEquality(prevLayout.measurement.size.width, expectedSize.width) &&
          floatEquality(prevLayout.measurement.size.height, expectedSize.height)) {
        ret = &prevLayout;
        break;
      }
    }
  }

  return ret;
}

Size SelectableRichTextShadowNode::rawContentSize()
{
  return Size{
      .width = YGNodeLayoutGetRawWidth(&yogaNode_) - layoutMetrics_.contentInsets.left -
          layoutMetrics_.contentInsets.right,
      .height = YGNodeLayoutGetRawHeight(&yogaNode_) - layoutMetrics_.contentInsets.top -
          layoutMetrics_.contentInsets.bottom};
}

Size SelectableRichTextShadowNode::measureContent(
    const LayoutContext &layoutContext,
    const LayoutConstraints &layoutConstraints) const
{
  // 同一约束下已经测量过 prepared layout 时直接复用。
  if constexpr (TextLayoutManagerExtended::supportsPreparedLayout()) {
    for (const auto &layout : measuredLayouts_) {
      // layoutConstraints 相同表示 measure 结果可以直接返回。
      if (layout.layoutConstraints == layoutConstraints) {
        return layout.measurement.size;
      }
    }
  }

  auto content = getContentWithMeasuredAttachments(layoutContext, layoutConstraints);

  TextLayoutContext textLayoutContext{
      .pointScaleFactor = layoutContext.pointScaleFactor,
      .surfaceId = getSurfaceId(),
  };

  // RN prepared text layout 开启时，测量阶段同时缓存可复用布局。
  if constexpr (TextLayoutManagerExtended::supportsPreparedLayout()) {
    // feature flag 未开启时回落到普通 TextLayoutManager measure。
    if (ReactNativeFeatureFlags::enablePreparedTextLayout()) {
      TextLayoutManagerExtended tme(*textLayoutManager_);

      auto preparedLayout = tme.prepareLayout(
          content.attributedString, content.paragraphAttributes, textLayoutContext, layoutConstraints);
      auto measurement = tme.measurePreparedLayout(preparedLayout, textLayoutContext, layoutConstraints);

      measuredLayouts_.push_back(MeasuredPreparedLayout{
          .layoutConstraints = layoutConstraints,
          .measurement = measurement,
          .preparedLayout = std::move(preparedLayout)});
      assert_valid_size(measurement.size, layoutConstraints);
      return measurement.size;
    }
  }

  auto size = textLayoutManager_
                  ->measure(
                      AttributedStringBox{content.attributedString},
                      content.paragraphAttributes,
                      textLayoutContext,
                      layoutConstraints)
                  .size;
  assert_valid_size(size, layoutConstraints);
  return size;
}

Float SelectableRichTextShadowNode::baseline(const LayoutContext &layoutContext, Size size) const
{
  auto layoutMetrics = getLayoutMetrics();
  auto layoutConstraints = LayoutConstraints{size, size, layoutMetrics.layoutDirection};
  auto content = getContentWithMeasuredAttachments(layoutContext, layoutConstraints);

  AttributedStringBox attributedStringBox{content.attributedString};

  // 平台支持 line measurement 时用真实文本 baseline。
  if constexpr (TextLayoutManagerExtended::supportsLineMeasurement()) {
    auto lines = TextLayoutManagerExtended(*textLayoutManager_)
                     .measureLines(attributedStringBox, content.paragraphAttributes, size);
    return LineMeasurement::baseline(lines);
  } else {
    LOG(WARNING) << "Baseline alignment is not supported by the current platform";
    return 0;
  }
}

void SelectableRichTextShadowNode::layout(LayoutContext layoutContext)
{
  ensureUnsealed();

  auto layoutMetrics = getLayoutMetrics();


  auto size = ReactNativeFeatureFlags::enablePreparedTextLayout() ? rawContentSize() : layoutMetrics.getContentFrame().size;

  LayoutConstraints layoutConstraints{
      .minimumSize = size,
      .maximumSize = size,
      .layoutDirection = layoutMetrics.layoutDirection};
  auto content = getContentWithMeasuredAttachments(layoutContext, layoutConstraints);

  auto measuredLayout = findUsableLayout();

  // prepared layout 可用时把测量结果一起写入 ParagraphState。
  if constexpr (
      TextLayoutManagerExtended::supportsPreparedLayout() &&
      std::is_constructible_v<
          ParagraphState,
          decltype(content.attributedString),
          decltype(content.paragraphAttributes),
          decltype(textLayoutManager_),
          decltype(*measuredLayout)>) {
    // feature flag 开启时确保最终 state 带有 prepared layout。
    if (ReactNativeFeatureFlags::enablePreparedTextLayout()) {
      // Yoga 尺寸和 measure 约束不一致时，需要在 layout 阶段补一次测量。
      if (measuredLayout == nullptr) {
        measureContent(layoutContext, layoutConstraints);
        measuredLayout = findUsableLayout();
      }
      react_native_assert(measuredLayout);
      updateStateIfNeeded<ParagraphState>(content, *measuredLayout);
    } else {
      updateStateIfNeeded(content);
    }
  } else {
    updateStateIfNeeded(content);
  }

  TextLayoutContext textLayoutContext{
      .pointScaleFactor = layoutContext.pointScaleFactor,
      .surfaceId = getSurfaceId(),
  };
  AttributedStringBox attributedStringBox{content.attributedString};

  // JS 监听 onTextLayout 时，保持 RN Paragraph 的 line measurement 事件。
  if (getConcreteProps().onTextLayout) {
    // 当前平台支持 line measurement 时才能发送精确行信息。
    if constexpr (TextLayoutManagerExtended::supportsLineMeasurement()) {
      auto linesMeasurements = TextLayoutManagerExtended(*textLayoutManager_)
                                   .measureLines(attributedStringBox, content.paragraphAttributes, size);
      getConcreteEventEmitter().onTextLayout(linesMeasurements);
    } else {
      LOG(WARNING) << "onTextLayout is not supported by the current platform";
    }
  }

  // 没有 attachment 时无需布局内嵌 shadow node。
  if (content.attachments.empty()) {
    return;
  }

  auto measurement = (measuredLayout != nullptr)
      ? measuredLayout->measurement
      : textLayoutManager_->measure(
            attributedStringBox, content.paragraphAttributes, textLayoutContext, layoutConstraints);

  auto paragraphShadowNode = static_cast<SelectableRichTextShadowNode *>(this);
  auto paragraphOwningShadowNode = std::shared_ptr<ShadowNode>{};

  react_native_assert(content.attachments.size() == measurement.attachments.size());

  for (size_t i = 0; i < content.attachments.size(); i++) {
    auto &attachment = content.attachments.at(i);

    // 非 LayoutableShadowNode 的 attachment 不参与布局。
    if (dynamic_cast<const LayoutableShadowNode *>(attachment.shadowNode) == nullptr) {
      continue;
    }

    auto clonedShadowNode = std::shared_ptr<ShadowNode>{};

    paragraphOwningShadowNode = paragraphShadowNode->cloneTree(
        attachment.shadowNode->getFamily(),
        [&](const ShadowNode &oldShadowNode) {
          clonedShadowNode = oldShadowNode.clone({});
          return clonedShadowNode;
        });
    paragraphShadowNode = static_cast<SelectableRichTextShadowNode *>(paragraphOwningShadowNode.get());

    auto &layoutableShadowNode = dynamic_cast<LayoutableShadowNode &>(*clonedShadowNode);
    const auto &attachmentMeasurement = measurement.attachments[i];

    // 被文本布局裁剪的 attachment 需要隐藏，避免 Fabric 仍然挂载旧 frame。
    if (attachmentMeasurement.isClipped) {
      layoutableShadowNode.setLayoutMetrics(LayoutMetrics{.frame = {}, .displayType = DisplayType::None});
      continue;
    }

    auto attachmentFrame = attachmentMeasurement.frame;
    attachmentFrame.origin.x += layoutMetrics.contentInsets.left;
    attachmentFrame.origin.y += layoutMetrics.contentInsets.top;

    auto attachmentSize = roundToPixel<&ceil>(attachmentFrame.size, layoutMetrics.pointScaleFactor);
    auto attachmentOrigin = roundToPixel<&round>(attachmentFrame.origin, layoutMetrics.pointScaleFactor);
    auto attachmentLayoutContext = layoutContext;
    auto attachmentLayoutConstrains = LayoutConstraints{attachmentSize, attachmentSize, layoutConstraints.layoutDirection};

    layoutableShadowNode.layoutTree(attachmentLayoutContext, attachmentLayoutConstrains);

    auto attachmentLayoutMetrics = layoutableShadowNode.getLayoutMetrics();
    attachmentLayoutMetrics.frame.origin = attachmentOrigin;
    layoutableShadowNode.setLayoutMetrics(attachmentLayoutMetrics);
  }

  // cloneTree 产生过新的 paragraph 节点时，把最新 children 写回当前节点。
  if (paragraphShadowNode != this) {
    this->children_ = static_cast<const SelectableRichTextShadowNode *>(paragraphShadowNode)->children_;
  }
}

} // namespace facebook::react
