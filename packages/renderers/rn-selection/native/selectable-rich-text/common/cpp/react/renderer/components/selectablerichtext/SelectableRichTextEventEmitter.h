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

  // OnTextLongPress reports back the paragraph and menu anchor hit by a native long press, letting
  // JS decide the follow-up selection action.
  struct OnTextLongPress {
    std::string paragraphText;
    int selectionStart{0};
    int selectionEnd{0};
    // Coordinate fields use double, corresponding to Codegen's Double; the native long-press
    // callback fills them in directly from a CGFloat.
    double locationX{0};
    double locationY{0};
    double pageX{0};
    double pageY{0};
  };

  // onMenuAction sends the result of a native custom menu tap to JS.
  void onMenuAction(OnMenuAction value) const;

  // onTextLongPress sends the paragraph and menu anchor hit by a native gesture to JS.
  void onTextLongPress(OnTextLongPress value) const;
};

} // namespace facebook::react
