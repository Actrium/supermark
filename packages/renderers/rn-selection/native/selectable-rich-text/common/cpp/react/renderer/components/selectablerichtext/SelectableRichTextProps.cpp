#include "SelectableRichTextProps.h"

#include <react/featureflags/ReactNativeFeatureFlags.h>
#include <react/renderer/core/PropsMacros.h>
#include <react/renderer/core/propsConversions.h>
#include <react/renderer/debug/debugStringConvertibleUtils.h>

#include <unordered_map>

namespace facebook::react {

void fromRawValue(const PropsParserContext &context, const RawValue &value, SelectableRichTextMenuItem &result)
{
  // A menu item that isn't an object can't be safely parsed; keep the default empty id/title and
  // let the platform layer filter it out.
  if (!value.hasType<std::unordered_map<std::string, RawValue>>()) {
    result = {};
    return;
  }

  auto map = (std::unordered_map<std::string, RawValue>)value;
  auto id = map.find("id");
  auto title = map.find("title");

  // id must be a string to serve as the JS menu action identifier.
  if (id != map.end() && id->second.hasType<std::string>()) {
    result.id = (std::string)id->second;
  }

  // title must be a string to be shown in the native menu.
  if (title != map.end() && title->second.hasType<std::string>()) {
    result.title = (std::string)title->second;
  }
}

SelectableRichTextProps::SelectableRichTextProps(
    const PropsParserContext &context,
    const SelectableRichTextProps &sourceProps,
    const RawProps &rawProps)
    : ParagraphProps(context, sourceProps, rawProps),
      menuItems(
          ReactNativeFeatureFlags::enableCppPropsIteratorSetter()
              ? sourceProps.menuItems
              : convertRawProp(context, rawProps, "menuItems", sourceProps.menuItems, std::vector<SelectableRichTextMenuItem>{})),
      showSystemMenuItems(
          ReactNativeFeatureFlags::enableCppPropsIteratorSetter()
              ? sourceProps.showSystemMenuItems
              : convertRawProp(context, rawProps, "showSystemMenuItems", sourceProps.showSystemMenuItems, true)),
      clearSelectionOnMenuAction(
          ReactNativeFeatureFlags::enableCppPropsIteratorSetter()
              ? sourceProps.clearSelectionOnMenuAction
              : convertRawProp(
                    context,
                    rawProps,
                    "clearSelectionOnMenuAction",
                    sourceProps.clearSelectionOnMenuAction,
                    false))
{
}

void SelectableRichTextProps::setProp(
    const PropsParserContext &context,
    RawPropsPropNameHash hash,
    const char *propName,
    const RawValue &value)
{
  ParagraphProps::setProp(context, hash, propName, value);

  static auto defaults = SelectableRichTextProps{};

  switch (hash) {
    RAW_SET_PROP_SWITCH_CASE(menuItems, "menuItems");
    RAW_SET_PROP_SWITCH_CASE(showSystemMenuItems, "showSystemMenuItems");
    RAW_SET_PROP_SWITCH_CASE(clearSelectionOnMenuAction, "clearSelectionOnMenuAction");
  }
}

#if RN_DEBUG_STRING_CONVERTIBLE
SharedDebugStringConvertibleList SelectableRichTextProps::getDebugProps() const
{
  return ParagraphProps::getDebugProps() +
      SharedDebugStringConvertibleList{
          debugStringConvertibleItem("showSystemMenuItems", showSystemMenuItems),
          debugStringConvertibleItem("clearSelectionOnMenuAction", clearSelectionOnMenuAction)};
}
#endif

#ifdef RN_SERIALIZABLE_STATE
folly::dynamic toDynamic(const SelectableRichTextMenuItem &value)
{
  return folly::dynamic::object("id", value.id)("title", value.title);
}

ComponentName SelectableRichTextProps::getDiffPropsImplementationTarget() const
{
  return "SelectableRichText";
}

folly::dynamic SelectableRichTextProps::getDiffProps(const Props *prevProps) const
{
  static const auto defaultProps = SelectableRichTextProps();
  const SelectableRichTextProps *oldProps =
      prevProps == nullptr ? &defaultProps : static_cast<const SelectableRichTextProps *>(prevProps);

  folly::dynamic result = ParagraphProps::getDiffProps(oldProps);

  // When menuItems changes, the new custom menu needs to be passed to the platform layer in full.
  if (menuItems != oldProps->menuItems) {
    folly::dynamic items = folly::dynamic::array;
    for (const auto &item : menuItems) {
      items.push_back(toDynamic(item));
    }
    result["menuItems"] = items;
  }

  // When showSystemMenuItems changes, the platform layer needs to refresh the current system menu.
  if (showSystemMenuItems != oldProps->showSystemMenuItems) {
    result["showSystemMenuItems"] = showSystemMenuItems;
  }

  // When clearSelectionOnMenuAction changes, the platform layer needs to update the
  // post-menu-tap selection policy.
  if (clearSelectionOnMenuAction != oldProps->clearSelectionOnMenuAction) {
    result["clearSelectionOnMenuAction"] = clearSelectionOnMenuAction;
  }

  return result;
}
#endif

} // namespace facebook::react
