package com.selectableapp.selectabletext

import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

// MenuActionEvent is the custom menu-tap event sent through the Fabric event channel.
class SelectableRichTextMenuActionEvent(surfaceId: Int, viewId: Int, private val payload: WritableMap) :
    Event<SelectableRichTextMenuActionEvent>(surfaceId, viewId) {
  // getEventName returns the top-level event name recognized by the Codegen view config.
  override fun getEventName(): String = EVENT_NAME

  // canCoalesce=false ensures every single menu tap is delivered to JS independently.
  override fun canCoalesce(): Boolean = false

  // getEventData returns the selection and menu payload built by the native view.
  override fun getEventData(): WritableMap = payload

  companion object {
    // EVENT_NAME corresponds to the JS prop onMenuAction.
    const val EVENT_NAME = "topMenuAction"
  }
}
