#pragma once

#include <react/renderer/components/text/ParagraphProps.h>
#include <react/renderer/core/PropsParserContext.h>
#include <react/renderer/core/RawProps.h>
#include <react/renderer/core/RawValue.h>

#include <memory>
#include <string>
#include <vector>

namespace facebook::react {

// SelectableRichTextMenuItem holds a single custom menu configuration from the JS menuItems array.
struct SelectableRichTextMenuItem {
  std::string id;
  std::string title;

  bool operator==(const SelectableRichTextMenuItem &) const = default;
};

// fromRawValue converts a menu item in JS object form into a C++ props struct.
void fromRawValue(const PropsParserContext &context, const RawValue &value, SelectableRichTextMenuItem &result);

#ifdef RN_SERIALIZABLE_STATE
folly::dynamic toDynamic(const SelectableRichTextMenuItem &value);
#endif

/*
 * Props for <SelectableRichText>.
 * It inherits ParagraphProps so all RN Text style, layout and selectable props keep existing behavior.
 */
class SelectableRichTextProps final : public ParagraphProps {
 public:
  SelectableRichTextProps() = default;
  SelectableRichTextProps(
      const PropsParserContext &context,
      const SelectableRichTextProps &sourceProps,
      const RawProps &rawProps);

  // menuItems is the custom text-selection menu items passed in from JS.
  std::vector<SelectableRichTextMenuItem> menuItems{};

  // showSystemMenuItems controls whether system menu items such as copy and select-all are kept.
  bool showSystemMenuItems{true};

  // clearSelectionOnMenuAction controls whether the selection is cleared automatically after a
  // custom menu item is tapped.
  bool clearSelectionOnMenuAction{false};

  // setProp supports incremental prop updates under RN's C++ props iterator path.
  void setProp(const PropsParserContext &context, RawPropsPropNameHash hash, const char *propName, const RawValue &value);

#if RN_DEBUG_STRING_CONVERTIBLE
  SharedDebugStringConvertibleList getDebugProps() const override;
#endif

#ifdef RN_SERIALIZABLE_STATE
  ComponentName getDiffPropsImplementationTarget() const override;
  folly::dynamic getDiffProps(const Props *prevProps) const override;
#endif
};

} // namespace facebook::react
