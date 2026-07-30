package com.selectableapp.selectabletext

import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

// TextLongPressEvent is the long-press-on-paragraph event sent through the Fabric event channel,
// corresponding to iOS's UILongPressGestureRecognizer.
class SelectableRichTextTextLongPressEvent(
    surfaceId: Int,
    viewId: Int,
    private val payload: WritableMap
) : Event<SelectableRichTextTextLongPressEvent>(surfaceId, viewId) {
  // getEventName returns the top-level event name recognized by the Codegen view config.
  override fun getEventName(): String = EVENT_NAME

  // canCoalesce=false ensures every single long press is delivered to JS independently.
  override fun canCoalesce(): Boolean = false

  // getEventData returns the paragraph payload built by the native view.
  override fun getEventData(): WritableMap = payload

  companion object {
    // EVENT_NAME corresponds to the JS prop onTextLongPress.
    const val EVENT_NAME = "topTextLongPress"
  }
}
