package com.selectableapp.selectabletext

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Rect
import android.os.Bundle
import android.text.Selection
import android.text.Spannable
import android.view.ActionMode
import android.view.GestureDetector
import android.view.Menu
import android.view.MenuItem
import android.view.MotionEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.TextView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.PixelUtil
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.views.text.ReactTextView
import java.lang.ref.WeakReference
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// SelectableRichTextMenuItem holds a custom ActionMode menu item passed in from JS.
data class SelectableRichTextMenuItem(val id: String, val title: String)

// SelectableRichTextView wires native Android text-selection and menu capabilities into RN's ReactTextView.
class SelectableRichTextView(context: Context) : ReactTextView(context) {
  // menuItems is the custom selected-text menu configuration passed in from the JS side.
  var menuItems: List<SelectableRichTextMenuItem> = emptyList()
    set(value) {
      field = value
      invalidateActionMode()
    }

  // showSystemMenuItems controls whether Android's system menu items (copy, select all, etc.) are kept.
  var showSystemMenuItems: Boolean = true
    set(value) {
      field = value
      invalidateActionMode()
    }

  // clearSelectionOnMenuAction controls whether the current selection is cleared automatically
  // after a custom menu item is tapped.
  var clearSelectionOnMenuAction: Boolean = false

  // currentActionMode tracks the current floating menu, used for prop updates, clearing the
  // selection, and releasing the parent's touch-interception hold.
  private var currentActionMode: ActionMode? = null

  // rnSelectable holds the value of the JS selectable prop; it defaults to false to avoid
  // long-press word selection conflicting with the host's gestures.
  // It is restored after selectRange / selectParagraphAt commands temporarily enable selection.
  private var rnSelectable: Boolean = false

  // selectionDismissDetector detects a tap (as opposed to a scroll) while a selection is active,
  // used to clear the selection when the user taps elsewhere.
  // During a scroll, ScrollView's onInterceptTouchEvent intercepts the touch and the TextView
  // receives ACTION_CANCEL, so onSingleTapUp never fires and the selection is kept.
  private val selectionDismissDetector =
      GestureDetector(
          context,
          object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(event: MotionEvent): Boolean = true

            override fun onSingleTapUp(event: MotionEvent): Boolean {
              clearSelection()
              return true
            }
          })

  // paragraphLongPressDetector detects a native long press, hit-tests the paragraph, and reports
  // the paragraph range and menu anchor back to JS —
  // the counterpart of iOS's UILongPressGestureRecognizer (cancelsTouchesInView=NO).
  // selectable defaults to false, so TextView's built-in long-press word selection is disabled and
  // long press is driven entirely from here.
  private val paragraphLongPressDetector =
      GestureDetector(
          context,
          object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(event: MotionEvent): Boolean = true

            // onLongPress fires roughly 500ms after ACTION_DOWN; event.x/y are the view's local
            // pixel coordinates.
            // During a scroll, ScrollView intercepts the touch and the TextView receives
            // ACTION_CANCEL, so onLongPress never fires.
            override fun onLongPress(event: MotionEvent) {
              handleParagraphLongPress(event.x, event.y)
            }
          })

  // selectionActionModeCallback centralizes the system-menu retention policy, custom menu, menu
  // positioning, and the JS callback.
  private val selectionActionModeCallback =
      object : ActionMode.Callback2() {
        // onCreateActionMode initializes the menu content when Android enters the text-selection menu.
        override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
          currentActionMode = mode
          populateSelectionMenu(menu)
          return true
        }

        // onPrepareActionMode re-applies the system-menu toggle and the custom menu items whenever
        // the menu refreshes.
        override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
          populateSelectionMenu(menu)
          return true
        }

        // onActionItemClicked only consumes SelectableRichText's custom menu items; system menu
        // items are left to TextView's default handling.
        override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
          val customItem = customMenuItemForMenuId(item.itemId)

          // Return false for non-custom menu items, letting Android TextView continue handling
          // system actions such as copy and select-all.
          if (customItem == null) {
            return false
          }

          emitMenuAction(customItem)

          // After a custom menu tap, whether to clear the Android TextView's current selection is
          // decided by the prop.
          if (clearSelectionOnMenuAction) {
            clearSelection()
          }

          return true
        }

        // onDestroyActionMode releases the parent ScrollView's touch-interception restriction when
        // the system menu closes.
        override fun onDestroyActionMode(mode: ActionMode) {
          currentActionMode = null
          parent?.requestDisallowInterceptTouchEvent(false)
        }

        // onGetContentRect anchors the floating menu to the first line of the current selection,
        // rather than the whole SelectableRichText view.
        override fun onGetContentRect(mode: ActionMode, view: android.view.View, outRect: Rect) {
          selectedTextContentRect(outRect)
        }
      }

  init {
    // selectable defaults to false, to avoid Android TextView's built-in long-press word selection
    // conflicting with the host's Pressable long-press gesture.
    // The native side temporarily enables selectable when the host triggers selection via the
    // ref.selectParagraphAt / selectRange commands.
    setTextIsSelectable(false)
    setCustomSelectionActionModeCallback(selectionActionModeCallback)
  }

  // setTextIsSelectable receives the RN selectable prop and syncs it to the underlying Android TextView.
  override fun setTextIsSelectable(selectable: Boolean) {
    rnSelectable = selectable
    updateNativeSelectableState()
  }

  // onTouchEvent clears the previous selection when switching between different SelectableRichText
  // instances, and protects the parent's gesture handling while a handle is being dragged.
  override fun onTouchEvent(event: MotionEvent): Boolean {
    // ACTION_DOWN means the user has started interacting with the current text block, so the
    // previous block's leftover selection needs clearing.
    if (event.actionMasked == MotionEvent.ACTION_DOWN) {
      markAsActiveSelectableRichTextView()
    }

    // While a selection is active, use selectionDismissDetector to distinguish a tap from a scroll:
    // - tap (elsewhere) -> clearSelection, matching iOS behavior
    // - scroll -> ScrollView's onInterceptTouchEvent intercepts it, the TextView receives
    //   ACTION_CANCEL, and the selection is kept
    // super.onTouchEvent is not called here, to avoid TextView destroying the ActionMode on ACTION_UP
    // Handle dragging is handled independently by the system's handle popup, bypassing
    // onTouchEvent, so it is unaffected
    if (hasInteractiveSelection()) {
      selectionDismissDetector.onTouchEvent(event)
      return true
    }

    // Feed the long-press detector when there's no selection; its onTouchEvent return value does
    // not affect the subsequent super.onTouchEvent call.
    // With selectable=false, TextView itself never produces a selection, so long press is driven
    // entirely by paragraphLongPressDetector.
    paragraphLongPressDetector.onTouchEvent(event)

    val handled = super.onTouchEvent(event)

    // When the touch ends and there is no selection, hand scroll-interception back to the parent ScrollView.
    if (
        (event.actionMasked == MotionEvent.ACTION_UP ||
            event.actionMasked == MotionEvent.ACTION_CANCEL) &&
            !hasInteractiveSelection()) {
      parent?.requestDisallowInterceptTouchEvent(false)
    }

    return handled
  }

  // onSelectionChanged marks the current instance as active when a system long press produces a
  // selection, and protects handle dragging from being cut off by the parent view.
  override fun onSelectionChanged(selStart: Int, selEnd: Int) {
    super.onSelectionChanged(selStart, selEnd)

    // Only mark active when text is actually selected, so a plain tap's insertion-point state
    // doesn't affect other text blocks.
    if (selStart >= 0 && selEnd >= 0 && selStart != selEnd) {
      markAsActiveSelectableRichTextView()
      parent?.requestDisallowInterceptTouchEvent(true)
    }
  }

  // clearSelection clears the Android TextView's Selection span and the current ActionMode.
  fun clearSelection() {
    val actionMode = currentActionMode
    val hasSelection = hasActiveSelection()
    val currentText = text
    val selectableText =
        when {
          currentText is Spannable -> currentText
          hasSelection || actionMode != null -> ensureSpannableText()
          else -> null
        }

    // Only touch Selection when there's a real selection or ActionMode, to avoid a pointless
    // setText-triggered layout rebuild on the first long press.
    if (selectableText != null) {
      Selection.removeSelection(selectableText)
    }

    actionMode?.finish()
    clearFocus()
    updateNativeSelectableState()
    parent?.requestDisallowInterceptTouchEvent(false)
    invalidate()
  }

  // selectRange temporarily enables native selection per a JS menu command, and sets the selection
  // to the given range.
  fun selectRange(start: Int, end: Int) {
    markAsActiveSelectableRichTextView()
    // The command's semantics are a forced selection; it's enabled temporarily even when
    // rnSelectable=false, and restored in clearSelection.
    super.setTextIsSelectable(true)

    val selectableText = ensureSpannableText()
    val range = clampedRange(start, end, selectableText?.length ?: 0)

    // Can't safely write a Selection span when the range is invalid or the text can't be
    // converted to Spannable.
    if (range == null || selectableText == null) {
      return
    }

    requestFocusFromTouch()
    parent?.requestDisallowInterceptTouchEvent(true)
    setSelectionThroughTextViewAction(range)
  }

  // selectParagraphAt hit-tests the paragraph at the local coordinates passed in by the host, and
  // selects that paragraph.
  // x/y are local coordinates relative to SelectableRichText's top-left corner (in dp, converted
  // from the Pressable event's locationX/locationY via RN's pxToDp);
  // native layout uses pixel coordinates, so they're converted to px once at the entry point
  // before being passed to paragraphRangeAtPoint.
  fun selectParagraphAt(x: Float, y: Float) {
    val pixelX = PixelUtil.toPixelFromDIP(x)
    val pixelY = PixelUtil.toPixelFromDIP(y)
    val paragraphRange = paragraphRangeAtPoint(pixelX, pixelY)

    // Leave the current selection unchanged if no text is hit, to avoid tapping a blank area from
    // wrongly triggering a selection.
    if (paragraphRange == null) {
      return
    }

    selectRange(paragraphRange.first, paragraphRange.second)
  }

  // paragraphRangeAtPoint maps the local coordinates to a character index, and cuts out the
  // paragraph at that position using newlines.
  private fun paragraphRangeAtPoint(x: Float, y: Float): Pair<Int, Int>? {
    val layout = layout
    val currentText = text

    // No paragraph can be hit when the text or layout is empty.
    if (currentText.isEmpty() || layout == null) {
      return null
    }

    val contentX = x - totalPaddingLeft + scrollX
    val contentY = y - totalPaddingTop + scrollY

    // Don't return a paragraph when the tap is outside the text layout's vertical range.
    if (contentY < 0 || contentY > layout.height) {
      return null
    }

    val line = layout.getLineForVertical(contentY.toInt())

    // Don't return a paragraph when the tap is outside the current line's horizontal text range,
    // to avoid a blank area wrongly triggering a selection.
    if (contentX < layout.getLineLeft(line) || contentX > layout.getLineRight(line)) {
      return null
    }

    val charIndex = layout.getOffsetForHorizontal(line, contentX)
    val safeCharIndex = min(charIndex, currentText.length - 1)
    var start = safeCharIndex
    var end = safeCharIndex

    // Scan backward to find the current paragraph's newline boundary.
    while (start > 0 && currentText[start - 1] != '\n') {
      start--
    }

    // Scan forward to find the current paragraph's newline boundary.
    while (end < currentText.length && currentText[end] != '\n') {
      end++
    }

    // Don't return a paragraph when the long press hits a blank line.
    if (end <= start) {
      return null
    }

    return start to end
  }

  // copyRange copies the text in the given range to the Android clipboard, per a JS command.
  fun copyRange(start: Int, end: Int) {
    val range = clampedRange(start, end, text.length)

    // Don't write to the clipboard when the range is invalid, to avoid overwriting the user's
    // existing clipboard content with an empty copy.
    if (range == null) {
      return
    }

    val selectedText = text.subSequence(range.first, range.second).toString()
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText(CLIP_LABEL, selectedText))
  }

  // populateSelectionMenu rebuilds the ActionMode menu from the props.
  private fun populateSelectionMenu(menu: Menu) {
    // When showSystemMenuItems=false, clear the system menu items first, keeping only the
    // app-provided custom menu.
    if (!showSystemMenuItems) {
      menu.clear()
    }

    menu.removeGroup(CUSTOM_MENU_GROUP_ID)

    menuItems.forEachIndexed { index, item ->
      // Skip menu items missing an id or title, since there'd be no way to report back a clear action.
      if (item.id.isBlank() || item.title.isBlank()) {
        return@forEachIndexed
      }

      menu.add(CUSTOM_MENU_GROUP_ID, CUSTOM_MENU_ITEM_ID_OFFSET + index, Menu.NONE, item.title)
          .setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
    }
  }

  // customMenuItemForMenuId maps an Android menu itemId back to the menu item passed in from JS.
  private fun customMenuItemForMenuId(menuItemId: Int): SelectableRichTextMenuItem? {
    val index = menuItemId - CUSTOM_MENU_ITEM_ID_OFFSET

    // An out-of-range index means this menu item isn't a SelectableRichText custom menu item.
    if (index < 0 || index >= menuItems.size) {
      return null
    }

    return menuItems[index]
  }

  // emitMenuAction reports the current selection and menu action back to JS via onMenuAction.
  private fun emitMenuAction(item: SelectableRichTextMenuItem) {
    val selectionStart = Selection.getSelectionStart(text)
    val selectionEnd = Selection.getSelectionEnd(text)
    val normalizedStart = min(selectionStart, selectionEnd)
    val normalizedEnd = max(selectionStart, selectionEnd)
    val selectedText =
        // Report the real text when the current selection is valid, otherwise report an empty
        // string so JS clearly knows nothing is selected.
        if (normalizedStart >= 0 && normalizedEnd > normalizedStart) {
          text.subSequence(normalizedStart, normalizedEnd).toString()
        } else {
          ""
        }
    val event = Arguments.createMap().apply {
      putString("id", item.id)
      putString("title", item.title)
      putString("selectedText", selectedText)
      putInt("selectionStart", normalizedStart)
      putInt("selectionEnd", normalizedEnd)
    }

    emitMenuActionEvent(event)
  }

  // invalidateActionMode asks Android to refresh the current ActionMode whenever menu-related
  // props update.
  private fun invalidateActionMode() {
    // Only refresh the menu when an ActionMode already exists; no UI update is needed while
    // nothing is selected.
    if (currentActionMode != null) {
      currentActionMode?.invalidate()
    }
  }

  // ensureSpannableText makes sure Android's Selection can be written into the current TextView's
  // text buffer.
  private fun ensureSpannableText(): Spannable? {
    val currentText = text

    // A Selection span can be written directly when the text is already Spannable.
    if (currentText is Spannable) {
      return currentText
    }

    // A plain SpannedString needs to be switched to the SPANNABLE buffer type, otherwise
    // Selection.setSelection has no effect.
    setText(currentText, TextView.BufferType.SPANNABLE)

    val updatedText = text

    // Android TextView is expected to return Spannable here; if the system's implementation
    // behaves unexpectedly, the caller should not continue with selection operations.
    if (updatedText !is Spannable) {
      return null
    }

    return updatedText
  }

  // setSelectionThroughTextViewAction uses TextView's public accessibility selection action,
  // which also triggers the system selection mode.
  private fun setSelectionThroughTextViewAction(selectionRange: Pair<Int, Int>) {
    val arguments = Bundle().apply {
      putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, selectionRange.first)
      putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, selectionRange.second)
    }

    // ACTION_SET_SELECTION internally calls TextView's startSelectionActionModeAsync, creating the
    // system menu and handles.
    performAccessibilityAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, arguments)
  }

  // updateNativeSelectableState syncs Android TextView's real selectable state from the selectable prop.
  // selectRange commands temporarily enable selectable; clearSelection calls this to restore it to
  // the real value from the prop.
  private fun updateNativeSelectableState() {
    super.setTextIsSelectable(rnSelectable)
  }

  // selectedTextContentRect computes the rect of the current selection's first line, in the
  // TextView's internal coordinate system, for positioning the system menu.
  private fun selectedTextContentRect(outRect: Rect) {
    val currentLayout = layout
    val selectionStart = Selection.getSelectionStart(text)
    val selectionEnd = Selection.getSelectionEnd(text)
    val normalizedStart = min(selectionStart, selectionEnd)
    val normalizedEnd = max(selectionStart, selectionEnd)

    // Return an empty rect when there's no layout or no valid selection, letting the system fall
    // back to its own default positioning.
    if (currentLayout == null || normalizedStart < 0 || normalizedEnd <= normalizedStart) {
      outRect.setEmpty()
      return
    }

    val line = currentLayout.getLineForOffset(normalizedStart)
    val lineSelectionEnd = min(normalizedEnd, currentLayout.getLineEnd(line))
    val startX = currentLayout.getPrimaryHorizontal(normalizedStart)
    val endX = currentLayout.getPrimaryHorizontal(lineSelectionEnd)
    val left = min(startX, endX) + totalPaddingLeft - scrollX
    val right = max(startX, endX) + totalPaddingLeft - scrollX
    val top = currentLayout.getLineTop(line).toFloat() + totalPaddingTop - scrollY
    val bottom = currentLayout.getLineBottom(line).toFloat() + totalPaddingTop - scrollY

    outRect.set(left.roundToInt(), top.roundToInt(), right.roundToInt(), bottom.roundToInt())
  }

  // emitMenuActionEvent sends the onMenuAction direct event through the Fabric EventDispatcher.
  private fun emitMenuActionEvent(eventPayload: WritableMap) {
    val reactContext = context as? ReactContext

    // Only a ReactContext can provide the RN EventDispatcher.
    if (reactContext == null) {
      return
    }

    val eventDispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)

    // A null EventDispatcher means the React instance is no longer available, so the event can't be dispatched.
    if (eventDispatcher == null) {
      return
    }

    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher.dispatchEvent(SelectableRichTextMenuActionEvent(surfaceId, id, eventPayload))
  }

  // handleParagraphLongPress reports back to JS when a native long press hits a paragraph,
  // corresponding to iOS's handleParagraphLongPress.
  // pixelX/Y are the view's local pixel coordinates (matching paragraphRangeAtPoint's parameters).
  private fun handleParagraphLongPress(pixelX: Float, pixelY: Float) {
    markAsActiveSelectableRichTextView()
    // Clear any leftover command selection, so the previous selection and the newly long-pressed
    // paragraph don't coexist (corresponds to iOS's clearTextSelection).
    clearSelection()

    val paragraphRange = paragraphRangeAtPoint(pixelX, pixelY) ?: return
    val start = paragraphRange.first
    val end = paragraphRange.second
    val paragraphText = text.subSequence(start, end).toString()

    // locationX/Y are local coordinates relative to the component's top-left corner (in dp),
    // corresponding to iOS's gesture locationInView:self.
    val locationX = PixelUtil.toDIPFromPixel(pixelX)
    val locationY = PixelUtil.toDIPFromPixel(pixelY)

    // pageX/Y are coordinates relative to the screen (in dp), used as the anchor for the JS
    // business menu, corresponding to iOS's convertPoint:toView:nil.
    val screenLocation = IntArray(2)
    getLocationOnScreen(screenLocation)
    val pageX = PixelUtil.toDIPFromPixel(screenLocation[0].toFloat() + pixelX)
    val pageY = PixelUtil.toDIPFromPixel(screenLocation[1].toFloat() + pixelY)

    val payload = Arguments.createMap().apply {
      putString("paragraphText", paragraphText)
      putInt("selectionStart", start)
      putInt("selectionEnd", end)
      putDouble("locationX", locationX.toDouble())
      putDouble("locationY", locationY.toDouble())
      putDouble("pageX", pageX.toDouble())
      putDouble("pageY", pageY.toDouble())
    }

    emitTextLongPressEvent(payload)
  }

  // emitTextLongPressEvent sends the onTextLongPress direct event through the Fabric EventDispatcher.
  private fun emitTextLongPressEvent(eventPayload: WritableMap) {
    val reactContext = context as? ReactContext

    // Only a ReactContext can provide the RN EventDispatcher.
    if (reactContext == null) {
      return
    }

    val eventDispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)

    // A null EventDispatcher means the React instance is no longer available, so the event can't be dispatched.
    if (eventDispatcher == null) {
      return
    }

    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher.dispatchEvent(SelectableRichTextTextLongPressEvent(surfaceId, id, eventPayload))
  }

  // hasActiveSelection reports whether the current TextView holds a non-empty text selection.
  private fun hasActiveSelection(): Boolean {
    val selectionStart = Selection.getSelectionStart(text)
    val selectionEnd = Selection.getSelectionEnd(text)
    return selectionStart >= 0 && selectionEnd >= 0 && selectionStart != selectionEnd
  }

  // hasInteractiveSelection reports whether the current non-empty selection is still within the
  // system ActionMode's interaction lifecycle.
  private fun hasInteractiveSelection(): Boolean = currentActionMode != null && hasActiveSelection()

  // markAsActiveSelectableRichTextView clears the leftover selection of the previous SelectableRichText.
  private fun markAsActiveSelectableRichTextView() {
    val previousActiveTextView = activeTextView?.get()

    // Only clear when switching to a different SelectableRichText instance, so handle dragging
    // within the current instance isn't disrupted.
    if (previousActiveTextView != null && previousActiveTextView !== this) {
      previousActiveTextView.clearSelection()
    }

    activeTextView = WeakReference(this)
  }

  companion object {
    // CLIP_LABEL is the source label used when writing to the Android clipboard.
    private const val CLIP_LABEL = "SelectableRichText"

    // CUSTOM_MENU_GROUP_ID is used to remove SelectableRichText's custom menu items in bulk.
    private const val CUSTOM_MENU_GROUP_ID = 0x53454c

    // CUSTOM_MENU_ITEM_ID_OFFSET generates itemIds for the custom menu that are unlikely to
    // collide with system items.
    private const val CUSTOM_MENU_ITEM_ID_OFFSET = 0x53454c00

    // activeTextView tracks the text block currently being interacted with, so switching blocks
    // clears the previous one's Android Selection.
    private var activeTextView: WeakReference<SelectableRichTextView>? = null

    // clampedRange clamps a selection range passed in from JS or a menu to the current text's length.
    fun clampedRange(start: Int, end: Int, textLength: Int): Pair<Int, Int>? {
      // Return null when the start/end positions are illegal, reversed, or the text is empty; the
      // caller leaves the current state unchanged.
      if (start < 0 || end <= start || textLength <= 0) {
        return null
      }

      val clampedStart = min(start, textLength)
      val clampedEnd = min(end, textLength)

      // Return null when there's no actual selected text left after clamping.
      if (clampedEnd <= clampedStart) {
        return null
      }

      return clampedStart to clampedEnd
    }
  }
}
