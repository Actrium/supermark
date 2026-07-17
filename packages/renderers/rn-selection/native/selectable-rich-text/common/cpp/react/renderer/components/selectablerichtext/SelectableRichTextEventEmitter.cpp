#include "SelectableRichTextEventEmitter.h"

namespace facebook::react {

void SelectableRichTextEventEmitter::onMenuAction(OnMenuAction value) const
{
  dispatchEvent("menuAction", [value = std::move(value)](jsi::Runtime &runtime) {
    auto payload = jsi::Object(runtime);
    payload.setProperty(runtime, "id", value.id);
    payload.setProperty(runtime, "title", value.title);
    payload.setProperty(runtime, "selectedText", value.selectedText);
    payload.setProperty(runtime, "selectionStart", value.selectionStart);
    payload.setProperty(runtime, "selectionEnd", value.selectionEnd);
    return payload;
  });
}

void SelectableRichTextEventEmitter::onTextLongPress(OnTextLongPress value) const
{
  dispatchEvent("textLongPress", [value = std::move(value)](jsi::Runtime &runtime) {
    auto payload = jsi::Object(runtime);
    payload.setProperty(runtime, "paragraphText", value.paragraphText);
    payload.setProperty(runtime, "selectionStart", value.selectionStart);
    payload.setProperty(runtime, "selectionEnd", value.selectionEnd);
    payload.setProperty(runtime, "locationX", value.locationX);
    payload.setProperty(runtime, "locationY", value.locationY);
    payload.setProperty(runtime, "pageX", value.pageX);
    payload.setProperty(runtime, "pageY", value.pageY);
    return payload;
  });
}

} // namespace facebook::react
