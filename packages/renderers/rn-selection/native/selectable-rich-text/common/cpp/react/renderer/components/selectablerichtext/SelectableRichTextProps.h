#pragma once

#include <react/renderer/components/text/ParagraphProps.h>
#include <react/renderer/core/PropsParserContext.h>
#include <react/renderer/core/RawProps.h>
#include <react/renderer/core/RawValue.h>

#include <memory>
#include <string>
#include <vector>

namespace facebook::react {

// SelectableRichTextMenuItem 保存 JS menuItems 中的单个自定义菜单配置。
struct SelectableRichTextMenuItem {
  std::string id;
  std::string title;

  bool operator==(const SelectableRichTextMenuItem &) const = default;
};

// fromRawValue 把 JS object 形式的 menu item 转成 C++ props 结构。
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

  // menuItems 是 JS 传入的自定义文本选区菜单项。
  std::vector<SelectableRichTextMenuItem> menuItems{};

  // showSystemMenuItems 控制是否保留系统复制、全选等菜单项。
  bool showSystemMenuItems{true};

  // clearSelectionOnMenuAction 控制点击自定义菜单后是否自动清空选区。
  bool clearSelectionOnMenuAction{false};

  // setProp 支持 RN C++ props iterator 路径下的增量 prop 更新。
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
