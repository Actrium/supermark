package com.selectableapp.selectabletext

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

// SelectableRichTextPackage 向 RN 注册只支持新架构的 SelectableRichText ViewManager。
class SelectableRichTextPackage : ReactPackage {
  // 当前包不提供 NativeModule，命令通过 ViewManager command 通道执行。
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
      emptyList()

  // 当前包只注册 SelectableRichText 这一个原生组件。
  override fun createViewManagers(
      reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = listOf(SelectableRichTextViewManager())
}
