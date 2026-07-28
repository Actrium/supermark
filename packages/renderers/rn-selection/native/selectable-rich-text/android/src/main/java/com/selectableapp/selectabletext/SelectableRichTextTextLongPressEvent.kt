package com.selectableapp.selectabletext

import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

// TextLongPressEvent 是 Fabric 事件通道里的长按段落事件，对应 iOS 的 UILongPressGestureRecognizer。
class SelectableRichTextTextLongPressEvent(
    surfaceId: Int,
    viewId: Int,
    private val payload: WritableMap
) : Event<SelectableRichTextTextLongPressEvent>(surfaceId, viewId) {
  // getEventName 返回 Codegen view config 识别的 top-level event 名称。
  override fun getEventName(): String = EVENT_NAME

  // canCoalesce=false 保证每一次长按都独立送达 JS。
  override fun canCoalesce(): Boolean = false

  // getEventData 返回原生视图构造好的段落 payload。
  override fun getEventData(): WritableMap = payload

  companion object {
    // EVENT_NAME 对应 JS prop onTextLongPress。
    const val EVENT_NAME = "topTextLongPress"
  }
}
