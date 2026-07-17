#pragma once

#include <react/renderer/components/text/ParagraphEventEmitter.h>

namespace facebook::react {

/*
 * Event emitter for SelectableRichText.
 * It keeps Paragraph's onTextLayout support and adds selection menu events.
 */
class SelectableRichTextEventEmitter : public ParagraphEventEmitter {
 public:
  using ParagraphEventEmitter::ParagraphEventEmitter;

  struct OnMenuAction {
    std::string id;
    std::string title;
    std::string selectedText;
    int selectionStart{0};
    int selectionEnd{0};
  };

  // OnTextLongPress 回传原生长按命中的段落和菜单锚点，由 JS 决定后续选取动作。
  struct OnTextLongPress {
    std::string paragraphText;
    int selectionStart{0};
    int selectionEnd{0};
    // 坐标字段用 double，对应 Codegen Double，原生长按回调里直接填 CGFloat。
    double locationX{0};
    double locationY{0};
    double pageX{0};
    double pageY{0};
  };

  // onMenuAction 把原生自定义菜单点击结果发送给 JS。
  void onMenuAction(OnMenuAction value) const;

  // onTextLongPress 把原生 gesture 命中的段落和菜单锚点发送给 JS。
  void onTextLongPress(OnTextLongPress value) const;
};

} // namespace facebook::react
