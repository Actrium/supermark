package com.selectableapp.selectabletext

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

// SelectableRichTextPackage registers the new-architecture-only SelectableRichText ViewManager with RN.
class SelectableRichTextPackage : ReactPackage {
  // This package provides no NativeModule; commands are executed through the ViewManager command channel.
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
      emptyList()

  // This package only registers the single SelectableRichText native component.
  override fun createViewManagers(
      reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = listOf(SelectableRichTextViewManager())
}
