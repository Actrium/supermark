package com.selectableapp.selectabletext

import com.facebook.react.bridge.JSApplicationIllegalArgumentException
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.annotations.UnstableReactNativeAPI
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.IViewManagerWithChildren
import com.facebook.react.uimanager.ReactStylesDiffMap
import com.facebook.react.uimanager.StateWrapper
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.text.DefaultStyleValuesUtil
import com.facebook.react.views.text.ReactTextAnchorViewManager
import com.facebook.react.views.text.ReactTextShadowNode
import com.facebook.react.views.text.ReactTextView
import com.facebook.react.views.text.ReactTextViewManager

// SelectableRichTextViewManager reuses RN Text's props, Spannable, and Fabric state pipeline via
// "composition over delegation",
// rather than inheriting from ReactTextViewManager.
//
// Background: when RN 0.81~0.84 migrated ReactTextViewManager from Java to Kotlin, they forgot the
// `open` modifier, making it a final class that
// a library can't extend (fixed again in 0.85). Meanwhile 0.83's TextLayoutManager,
// ReactTextViewAccessibilityDelegate, and similar
// classes are internal, so a library can't reach them either.
//
// Solution:
// 1. Extend the abstract parent class ReactTextAnchorViewManager (public abstract class in both
//    0.83 and 0.85),
//    which automatically provides the 17 view-level @ReactProp entries (numberOfLines/ellipsizeMode/
//    selectable/…) that RN invokes via reflection.
// 2. Compose a ReactTextViewManager instance as a delegate, forwarding updateState/updateExtraData
//    and the rest of the
//    Fabric state -> spannable pipeline to it. All of the delegate's internal calls into the
//    internal TextLayoutManager stay
//    inside its own module, so the library never needs visibility into it.
// 3. Under Fabric, state delivery goes through SurfaceMountingManager -> ViewManager.updateState ->
//    updateExtraData,
//    which is RN's generic path and does not require the ViewManager to be a ReactTextViewManager
//    subclass (see SurfaceMountingManager.java).
//
// This lets the Android side support both RN 0.83 and 0.85, without the library depending on
// ReactTextViewManager being extendable.
//
// Known behavioral regressions (relative to extending ReactTextViewManager; only affect edge
// cases, not the core selection/menu/text-rendering functionality):
// - prepareToRecycleView doesn't call ReactTextView.recycleView (package-private, not visible),
//   so background/border reset relies on subsequent @ReactProp updates overwriting the old values;
// - updateViewAccessibility uses BaseViewManager's default ReactAccessibilityDelegate instead of
//   ReactTextViewAccessibilityDelegate (internal), losing the accessibility optimizations for link spans.
@Suppress("DEPRECATION") // ReactTextShadowNode is marked @Deprecated (Legacy) in 0.83; under Fabric it's only used to satisfy the base-class contract.
@OptIn(UnstableReactNativeAPI::class) // ReactTextAnchorViewManager / prepareToRecycleView etc. are marked @UnstableReactNativeAPI and require an explicit opt-in.
@ReactModule(name = SelectableRichTextViewManager.REACT_CLASS)
class SelectableRichTextViewManager :
    ReactTextAnchorViewManager<ReactTextShadowNode>(), IViewManagerWithChildren {

  // delegate carries ReactTextViewManager's unique Fabric state -> spannable conversion logic.
  // All of its calls into the internal TextLayoutManager stay inside the delegate's own module;
  // the library only needs to delegate through public override methods.
  private val delegate: ReactTextViewManager = ReactTextViewManager()

  // getName exports the component name used by the JS Fabric HostComponent.
  override fun getName(): String = REACT_CLASS

  // createViewInstance creates the ReactTextView subclass that actually carries the native Android
  // selection capability.
  override fun createViewInstance(context: ThemedReactContext): SelectableRichTextView =
      SelectableRichTextView(context)

  // updateState is the entry point for Fabric state delivery: SurfaceMountingManager calls
  // ViewManager.updateState,
  // and the library delegates to ReactTextViewManager's attributedString -> spannable pipeline.
  // The returned ReactTextUpdate (containing the spannable) is passed on to updateExtraData by the framework.
  override fun updateState(
      view: ReactTextView,
      props: ReactStylesDiffMap,
      stateWrapper: StateWrapper
  ): Any? = delegate.updateState(view, props, stateWrapper)

  // updateExtraData applies the spannable built by the delegate onto the ReactTextView,
  // also handling inline image spans and accessibility links, all delegated to the delegate.
  override fun updateExtraData(view: ReactTextView, extraData: Any) {
    delegate.updateExtraData(view, extraData)
  }

  // prepareToRecycleView resets state when the view is recycled.
  // ReactTextViewManager's implementation calls recycleView (package-private, not visible across
  // modules) + setSelectionColor
  // (an internal fun on ReactTextAnchorViewManager, not visible). Here super is called instead
  // (BaseViewManager resets view properties),
  // then DefaultStyleValuesUtil (public) is used to reset selectionColor equivalently;
  // background/border leftovers are overwritten by
  // subsequent @ReactProp updates.
  override fun prepareToRecycleView(
      reactContext: ThemedReactContext,
      view: ReactTextView
  ): ReactTextView? {
    val prepared = super.prepareToRecycleView(reactContext, view) ?: return null
    view.highlightColor = DefaultStyleValuesUtil.getDefaultTextColorHighlight(view.context)
    return prepared
  }

  // onAfterUpdateTransaction refreshes the TextView after the props transaction commits.
  // ReactTextView.updateView is public,
  // so the library calls it directly, matching ReactTextViewManager's behavior. super
  // (BaseViewManager) also handles accessibility along the way.
  override fun onAfterUpdateTransaction(view: ReactTextView) {
    super.onAfterUpdateTransaction(view)
    view.updateView()
  }

  // needsCustomLayoutForChildren=true means Text handles its children's layout itself (nested Text
  // goes through spannable,
  // not yoga's automatic layout), matching ReactTextViewManager.
  override fun needsCustomLayoutForChildren(): Boolean = true

  // createShadowNodeInstance is generally not called under Fabric (the C++ ShadowNode is created
  // by the ComponentDescriptor),
  // but the ViewManager base class's default implementation throws, so it's delegated here to
  // avoid a crash on an unexpected call.
  override fun createShadowNodeInstance(): ReactTextShadowNode = delegate.createShadowNodeInstance()

  // getShadowNodeClass is the ViewManager base class's abstract method; returns the
  // ReactTextShadowNode type.
  override fun getShadowNodeClass(): Class<ReactTextShadowNode> = ReactTextShadowNode::class.java

  // setOverflow is a @ReactProp unique to ReactTextViewManager (not provided by
  // ReactTextAnchorViewManager);
  // delegated to keep the overflow prop's behavior consistent.
  @ReactProp(name = "overflow")
  fun setOverflow(view: ReactTextView, overflow: String?) {
    delegate.setOverflow(view, overflow)
  }

  // setPadding goes through the delegate, to keep padding handling consistent with RN Text.
  override fun setPadding(view: ReactTextView, left: Int, top: Int, right: Int, bottom: Int) {
    delegate.setPadding(view, left, top, right, bottom)
  }

  // setMenuItems converts the JS menuItems array into an Android ActionMode menu configuration.
  @ReactProp(name = "menuItems")
  fun setMenuItems(view: SelectableRichTextView, menuItems: ReadableArray?) {
    val parsedMenuItems = mutableListOf<SelectableRichTextMenuItem>()

    // Clear the custom menu configuration when menuItems is null.
    if (menuItems == null) {
      view.menuItems = parsedMenuItems
      return
    }

    for (index in 0 until menuItems.size()) {
      val item = menuItems.getMap(index)

      // Skip items missing an id or title, since JS wouldn't be able to distinguish the action
      // after a tap otherwise.
      if (item == null || !item.hasKey("id") || !item.hasKey("title")) {
        continue
      }

      val id = item.getString("id")
      val title = item.getString("title")

      // Skip a menu item when id/title isn't a valid string.
      if (id.isNullOrBlank() || title.isNullOrBlank()) {
        continue
      }

      parsedMenuItems.add(SelectableRichTextMenuItem(id, title))
    }

    view.menuItems = parsedMenuItems
  }

  // setShowSystemMenuItems controls whether the Android ActionMode keeps its system menu items.
  @ReactProp(name = "showSystemMenuItems", defaultBoolean = true)
  fun setShowSystemMenuItems(view: SelectableRichTextView, showSystemMenuItems: Boolean) {
    view.showSystemMenuItems = showSystemMenuItems
  }

  // setClearSelectionOnMenuAction controls whether the selection is cleared after a custom menu tap.
  @ReactProp(name = "clearSelectionOnMenuAction", defaultBoolean = false)
  fun setClearSelectionOnMenuAction(view: SelectableRichTextView, clearSelectionOnMenuAction: Boolean) {
    view.clearSelectionOnMenuAction = clearSelectionOnMenuAction
  }

  // receiveCommand handles the string commands delivered by Fabric's dispatchCommand.
  override fun receiveCommand(root: ReactTextView, commandId: String, args: ReadableArray?) {
    val selectableTextView = root as? SelectableRichTextView

    // Only handle commands for SelectableRichTextView instances created by this manager, to avoid
    // running a selection command against the wrong view type.
    if (selectableTextView == null) {
      return
    }

    when (commandId) {
      COMMAND_SELECT_RANGE -> handleSelectRangeCommand(selectableTextView, args)
      COMMAND_SELECT_PARAGRAPH_AT -> handleSelectParagraphAtCommand(selectableTextView, args)
      COMMAND_CLEAR_SELECTION -> selectableTextView.clearSelection()
      COMMAND_COPY_RANGE -> handleCopyRangeCommand(selectableTextView, args)
    }
  }

  // handleSelectRangeCommand validates the selectRange command's arguments and forwards them to
  // the native view.
  private fun handleSelectRangeCommand(view: SelectableRichTextView, args: ReadableArray?) {
    // selectRange must be given exactly two numeric arguments: start and end.
    if (args == null || args.size() < 2) {
      throw JSApplicationIllegalArgumentException("selectRange requires start and end arguments")
    }

    view.selectRange(args.getInt(0), args.getInt(1))
  }

  // handleSelectParagraphAtCommand validates the selectParagraphAt command's arguments and
  // forwards them to the native view.
  private fun handleSelectParagraphAtCommand(view: SelectableRichTextView, args: ReadableArray?) {
    // selectParagraphAt must be given exactly two numeric arguments: x and y.
    if (args == null || args.size() < 2) {
      throw JSApplicationIllegalArgumentException("selectParagraphAt requires x and y arguments")
    }

    view.selectParagraphAt(args.getDouble(0).toFloat(), args.getDouble(1).toFloat())
  }

  // handleCopyRangeCommand validates the copyRange command's arguments and copies the given text range.
  private fun handleCopyRangeCommand(view: SelectableRichTextView, args: ReadableArray?) {
    // copyRange must be given exactly two numeric arguments: start and end.
    if (args == null || args.size() < 2) {
      throw JSApplicationIllegalArgumentException("copyRange requires start and end arguments")
    }

    view.copyRange(args.getInt(0), args.getInt(1))
  }

  companion object {
    // REACT_CLASS is the Android Fabric registration name.
    // A name not present in FabricNameComponentMapping is passed through unchanged, and
    // ViewManagerRegistry.get then tries again with an "RCT" prefix.
    // So the JS viewName "SelectableRichText" is looked up as both "SelectableRichText" and
    // "RCTSelectableRichText",
    // and the registration name here uses "RCTSelectableRichText" to match the latter.
    const val REACT_CLASS = "RCTSelectableRichText"

    // COMMAND_SELECT_RANGE is the command name dispatched by JS's ref.selectRange.
    private const val COMMAND_SELECT_RANGE = "selectRange"

    // COMMAND_SELECT_PARAGRAPH_AT is the command name dispatched by JS's ref.selectParagraphAt.
    private const val COMMAND_SELECT_PARAGRAPH_AT = "selectParagraphAt"

    // COMMAND_CLEAR_SELECTION is the command name dispatched by JS's ref.clearSelection.
    private const val COMMAND_CLEAR_SELECTION = "clearSelection"

    // COMMAND_COPY_RANGE is the command name dispatched by JS's ref.copyRange.
    private const val COMMAND_COPY_RANGE = "copyRange"
  }
}
