package com.selectableapp.selectabletext

import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

// MenuActionEvent 是 Fabric 事件通道里的自定义菜单点击事件。
class SelectableRichTextMenuActionEvent(surfaceId: Int, viewId: Int, private val payload: WritableMap) :
    Event<SelectableRichTextMenuActionEvent>(surfaceId, viewId) {
  // getEventName 返回 Codegen view config 识别的 top-level event 名称。
  override fun getEventName(): String = EVENT_NAME

  // canCoalesce=false 保证每一次菜单点击都独立送达 JS。
  override fun canCoalesce(): Boolean = false

  // getEventData 返回原生视图构造好的选区和菜单 payload。
  override fun getEventData(): WritableMap = payload

  companion object {
    // EVENT_NAME 对应 JS prop onMenuAction。
    const val EVENT_NAME = "topMenuAction"
  }
}
