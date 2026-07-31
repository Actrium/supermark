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
  // On Android, only mark the text node as keyboard-focusable when selectable=true.
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
  // Reuse the previously built AttributedString on a content_ cache hit, to avoid re-walking the text subtree.
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

  // No need to recursively measure embedded nodes when there are no attachments.
  if (content.attachments.empty()) {
    return content;
  }

  auto localLayoutConstraints = layoutConstraints;
  localLayoutConstraints.minimumSize = Size{0, 0};

  auto &fragments = content.attributedString.getFragments();

  for (const auto &attachment : content.attachments) {
    auto laytableShadowNode = dynamic_cast<const LayoutableShadowNode *>(attachment.shadowNode);

    // Skip when the attachment isn't a layoutable node, preserving RN Paragraph's fault-tolerant behavior.
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

  // Skip calling setStateData again when the state content is already fully identical, to avoid a pointless mounting update.
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

  // Don't update ParagraphState when the AttributedString hasn't changed.
  if (state.attributedString == content.attributedString) {
    return;
  }

  setStateData(ParagraphState{content.attributedString, content.paragraphAttributes, textLayoutManager_});
}

MeasuredPreparedLayout *SelectableRichTextShadowNode::findUsableLayout()
{
  MeasuredPreparedLayout *ret = nullptr;

  // Prepared layout measurement is only reused when the current platform supports it.
  if constexpr (TextLayoutManagerExtended::supportsPreparedLayout()) {
    auto expectedSize = rawContentSize();
    for (auto &prevLayout : measuredLayouts_) {
      // This prepared layout can only be used for the final state when its size exactly matches the current Yoga result.
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
  // Reuse the prepared layout directly when it was already measured under the same constraints.
  if constexpr (TextLayoutManagerExtended::supportsPreparedLayout()) {
    for (const auto &layout : measuredLayouts_) {
      // Identical layoutConstraints means the measure result can be returned directly.
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

  // When RN's prepared text layout is enabled, cache a reusable layout during the measure step as well.
  if constexpr (TextLayoutManagerExtended::supportsPreparedLayout()) {
    // Fall back to the plain TextLayoutManager measure when the feature flag is off.
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

  // Use the real text baseline when the platform supports line measurement.
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

  // Write the measurement result into ParagraphState together, when a prepared layout is available.
  if constexpr (
      TextLayoutManagerExtended::supportsPreparedLayout() &&
      std::is_constructible_v<
          ParagraphState,
          decltype(content.attributedString),
          decltype(content.paragraphAttributes),
          decltype(textLayoutManager_),
          decltype(*measuredLayout)>) {
    // Make sure the final state carries a prepared layout when the feature flag is enabled.
    if (ReactNativeFeatureFlags::enablePreparedTextLayout()) {
      // When the Yoga size and the measure constraints don't match, an extra measurement pass is needed during layout.
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

  // Keep RN Paragraph's line-measurement event when JS listens to onTextLayout.
  if (getConcreteProps().onTextLayout) {
    // Precise line info can only be sent when the current platform supports line measurement.
    if constexpr (TextLayoutManagerExtended::supportsLineMeasurement()) {
      auto linesMeasurements = TextLayoutManagerExtended(*textLayoutManager_)
                                   .measureLines(attributedStringBox, content.paragraphAttributes, size);
      getConcreteEventEmitter().onTextLayout(linesMeasurements);
    } else {
      LOG(WARNING) << "onTextLayout is not supported by the current platform";
    }
  }

  // No need to lay out embedded shadow nodes when there are no attachments.
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

    // Attachments that aren't a LayoutableShadowNode don't participate in layout.
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

    // An attachment clipped by the text layout needs to be hidden, to avoid Fabric still mounting the old frame.
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

  // Write the latest children back onto the current node, when cloneTree produced a new paragraph node.
  if (paragraphShadowNode != this) {
    this->children_ = static_cast<const SelectableRichTextShadowNode *>(paragraphShadowNode)->children_;
  }
}

} // namespace facebook::react
