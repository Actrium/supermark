#include "SelectableRichTextProps.h"

#include <react/featureflags/ReactNativeFeatureFlags.h>
#include <react/renderer/core/PropsMacros.h>
#include <react/renderer/core/propsConversions.h>
#include <react/renderer/debug/debugStringConvertibleUtils.h>

#include <unordered_map>

namespace facebook::react {

void fromRawValue(const PropsParserContext &context, const RawValue &value, SelectableRichTextMenuItem &result)
{
  // 非 object 的 menu item 不能安全解析，保持默认空 id/title 交给平台层过滤。
  if (!value.hasType<std::unordered_map<std::string, RawValue>>()) {
    result = {};
    return;
  }

  auto map = (std::unordered_map<std::string, RawValue>)value;
  auto id = map.find("id");
  auto title = map.find("title");

  // id 必须是字符串才能作为 JS 菜单动作标识。
  if (id != map.end() && id->second.hasType<std::string>()) {
    result.id = (std::string)id->second;
  }

  // title 必须是字符串才能展示到原生菜单。
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

  // menuItems 改变时要把新的自定义菜单完整传给平台层。
  if (menuItems != oldProps->menuItems) {
    folly::dynamic items = folly::dynamic::array;
    for (const auto &item : menuItems) {
      items.push_back(toDynamic(item));
    }
    result["menuItems"] = items;
  }

  // showSystemMenuItems 改变时平台层需要刷新当前系统菜单。
  if (showSystemMenuItems != oldProps->showSystemMenuItems) {
    result["showSystemMenuItems"] = showSystemMenuItems;
  }

  // clearSelectionOnMenuAction 改变时平台层要更新菜单点击后的选区策略。
  if (clearSelectionOnMenuAction != oldProps->clearSelectionOnMenuAction) {
    result["clearSelectionOnMenuAction"] = clearSelectionOnMenuAction;
  }

  return result;
}
#endif

} // namespace facebook::react
