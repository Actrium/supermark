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

// SelectableRichTextMenuItem 保存 JS 传入的 ActionMode 自定义菜单项。
data class SelectableRichTextMenuItem(val id: String, val title: String)

// SelectableRichTextView 在 RN ReactTextView 基础上接入 Android 原生文本选区和菜单能力。
class SelectableRichTextView(context: Context) : ReactTextView(context) {
  // menuItems 是 JS 侧传入的自定义选中文本菜单配置。
  var menuItems: List<SelectableRichTextMenuItem> = emptyList()
    set(value) {
      field = value
      invalidateActionMode()
    }

  // showSystemMenuItems 控制是否保留复制、全选等 Android 系统菜单项。
  var showSystemMenuItems: Boolean = true
    set(value) {
      field = value
      invalidateActionMode()
    }

  // clearSelectionOnMenuAction 控制自定义菜单点击后是否自动清空当前选区。
  var clearSelectionOnMenuAction: Boolean = false

  // currentActionMode 记录当前浮动菜单，用于属性更新、清理选区和释放父级手势拦截。
  private var currentActionMode: ActionMode? = null

  // rnSelectable 保存 JS selectable prop 的值，默认 false 避免长按选词与宿主手势冲突。
  // selectRange / selectParagraphAt 命令临时开启后会以此值恢复。
  private var rnSelectable: Boolean = false

  // selectionDismissDetector 在有选区时检测 tap（非滚动），用于点击其他地方清空选区。
  // 滚动时 ScrollView 的 onInterceptTouchEvent 会拦截，TextView 收到 ACTION_CANCEL，
  // 不会触发 onSingleTapUp，选区保持。
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

  // paragraphLongPressDetector 检测原生长按，命中段落后把段落 range 和菜单锚点回传 JS，
  // 对应 iOS 的 UILongPressGestureRecognizer（cancelsTouchesInView=NO）。
  // 默认 selectable=false，TextView 自带长按选词被关闭，长按完全由这里驱动。
  private val paragraphLongPressDetector =
      GestureDetector(
          context,
          object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(event: MotionEvent): Boolean = true

            // onLongPress 在 ACTION_DOWN 后约 500ms 触发，event.x/y 是 view 本地像素坐标。
            // 滚动时 ScrollView 拦截触摸，TextView 收 ACTION_CANCEL，不会触发 onLongPress。
            override fun onLongPress(event: MotionEvent) {
              handleParagraphLongPress(event.x, event.y)
            }
          })

  // selectionActionModeCallback 统一处理系统菜单保留策略、自定义菜单、菜单定位和 JS 回调。
  private val selectionActionModeCallback =
      object : ActionMode.Callback2() {
        // onCreateActionMode 在 Android 进入文本选择菜单时初始化菜单内容。
        override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
          currentActionMode = mode
          populateSelectionMenu(menu)
          return true
        }

        // onPrepareActionMode 在菜单刷新时重新应用系统菜单开关和自定义菜单项。
        override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
          populateSelectionMenu(menu)
          return true
        }

        // onActionItemClicked 只消费 SelectableRichText 自定义菜单项，系统菜单继续交给 TextView 默认逻辑。
        override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
          val customItem = customMenuItemForMenuId(item.itemId)

          // 非自定义菜单项返回 false，让 Android TextView 继续处理复制、全选等系统动作。
          if (customItem == null) {
            return false
          }

          emitMenuAction(customItem)

          // 自定义菜单点击后按 prop 决定是否清掉 Android TextView 的当前选区。
          if (clearSelectionOnMenuAction) {
            clearSelection()
          }

          return true
        }

        // onDestroyActionMode 在系统菜单关闭时释放父 ScrollView 的触摸拦截限制。
        override fun onDestroyActionMode(mode: ActionMode) {
          currentActionMode = null
          parent?.requestDisallowInterceptTouchEvent(false)
        }

        // onGetContentRect 把浮动菜单锚点绑定到当前选区首行，而不是整个 SelectableRichText 视图。
        override fun onGetContentRect(mode: ActionMode, view: android.view.View, outRect: Rect) {
          selectedTextContentRect(outRect)
        }
      }

  init {
    // 默认 selectable=false，避免 Android TextView 自带长按选词与宿主 Pressable 长按手势冲突。
    // 宿主通过 ref.selectParagraphAt / selectRange 命令触发选取时，原生临时开启 selectable。
    setTextIsSelectable(false)
    setCustomSelectionActionModeCallback(selectionActionModeCallback)
  }

  // setTextIsSelectable 接收 RN selectable prop，并同步到底层 Android TextView。
  override fun setTextIsSelectable(selectable: Boolean) {
    rnSelectable = selectable
    updateNativeSelectableState()
  }

  // onTouchEvent 在不同 SelectableRichText 之间切换时清理旧选区，并在拖动手柄时保护父级手势。
  override fun onTouchEvent(event: MotionEvent): Boolean {
    // ACTION_DOWN 表示用户开始和当前文本块交互，需要清掉上一个文本块的残留选区。
    if (event.actionMasked == MotionEvent.ACTION_DOWN) {
      markAsActiveSelectableRichTextView()
    }

    // 有选区时用 selectionDismissDetector 区分 tap 和 scroll：
    // - tap（点击其他地方）→ clearSelection，和 iOS 行为一致
    // - scroll → ScrollView 的 onInterceptTouchEvent 拦截，TextView 收 ACTION_CANCEL，选区保持
    // 不调 super.onTouchEvent，避免 TextView 在 ACTION_UP 销毁 ActionMode
    // 手柄拖动由系统手柄 popup 独立处理，不经过 onTouchEvent，不受影响
    if (hasInteractiveSelection()) {
      selectionDismissDetector.onTouchEvent(event)
      return true
    }

    // 无选区时喂长按检测器；其 onTouchEvent 返回值不影响后续 super.onTouchEvent。
    // selectable=false 下 TextView 自身不产生选区，长按完全由 paragraphLongPressDetector 驱动。
    paragraphLongPressDetector.onTouchEvent(event)

    val handled = super.onTouchEvent(event)

    // 触摸结束且没有选区时，把滚动拦截权还给父 ScrollView。
    if (
        (event.actionMasked == MotionEvent.ACTION_UP ||
            event.actionMasked == MotionEvent.ACTION_CANCEL) &&
            !hasInteractiveSelection()) {
      parent?.requestDisallowInterceptTouchEvent(false)
    }

    return handled
  }

  // onSelectionChanged 在系统长按产生选区时标记当前实例，并保护手柄拖动不被父视图截断。
  override fun onSelectionChanged(selStart: Int, selEnd: Int) {
    super.onSelectionChanged(selStart, selEnd)

    // 只有真实选中文本时才标记 active，避免普通点击插入点状态影响其他文本块。
    if (selStart >= 0 && selEnd >= 0 && selStart != selEnd) {
      markAsActiveSelectableRichTextView()
      parent?.requestDisallowInterceptTouchEvent(true)
    }
  }

  // clearSelection 清理 Android TextView 的 Selection span 和当前 ActionMode。
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

    // 有真实选区或 ActionMode 时才改 Selection，避免首次长按时无意义 setText 触发布局重建。
    if (selectableText != null) {
      Selection.removeSelection(selectableText)
    }

    actionMode?.finish()
    clearFocus()
    updateNativeSelectableState()
    parent?.requestDisallowInterceptTouchEvent(false)
    invalidate()
  }

  // selectRange 根据 JS 菜单命令临时开启原生选择能力，并设置指定段落选区。
  fun selectRange(start: Int, end: Int) {
    markAsActiveSelectableRichTextView()
    // 命令语义是强制选取，即使 rnSelectable=false 也临时开启，clearSelection 时会恢复。
    super.setTextIsSelectable(true)

    val selectableText = ensureSpannableText()
    val range = clampedRange(start, end, selectableText?.length ?: 0)

    // range 无效或文本无法转成 Spannable 时，不能安全写入 Selection span。
    if (range == null || selectableText == null) {
      return
    }

    requestFocusFromTouch()
    parent?.requestDisallowInterceptTouchEvent(true)
    setSelectionThroughTextViewAction(range)
  }

  // selectParagraphAt 根据宿主传入的本地坐标命中长按所在段落，并选中该段落。
  // x/y 是相对 SelectableRichText 左上角的本地坐标（dp 单位，由 Pressable 事件 locationX/locationY 经 RN pxToDp 转换得到），
  // 原生 layout 用像素坐标，入口处统一转 px 再交给 paragraphRangeAtPoint。
  fun selectParagraphAt(x: Float, y: Float) {
    val pixelX = PixelUtil.toPixelFromDIP(x)
    val pixelY = PixelUtil.toPixelFromDIP(y)
    val paragraphRange = paragraphRangeAtPoint(pixelX, pixelY)

    // 没有命中文本时不改变当前选区，避免空白区域误触发选取。
    if (paragraphRange == null) {
      return
    }

    selectRange(paragraphRange.first, paragraphRange.second)
  }

  // paragraphRangeAtPoint 把本地坐标映射到字符 index，并按换行切出所在段落。
  private fun paragraphRangeAtPoint(x: Float, y: Float): Pair<Int, Int>? {
    val layout = layout
    val currentText = text

    // 文本或布局为空时没有可命中的段落。
    if (currentText.isEmpty() || layout == null) {
      return null
    }

    val contentX = x - totalPaddingLeft + scrollX
    val contentY = y - totalPaddingTop + scrollY

    // 点击在文本布局垂直范围外时不返回段落。
    if (contentY < 0 || contentY > layout.height) {
      return null
    }

    val line = layout.getLineForVertical(contentY.toInt())

    // 点击在当前行文字左右范围外时不返回段落，避免空白区域误触发。
    if (contentX < layout.getLineLeft(line) || contentX > layout.getLineRight(line)) {
      return null
    }

    val charIndex = layout.getOffsetForHorizontal(line, contentX)
    val safeCharIndex = min(charIndex, currentText.length - 1)
    var start = safeCharIndex
    var end = safeCharIndex

    // 向前找到当前段落的换行边界。
    while (start > 0 && currentText[start - 1] != '\n') {
      start--
    }

    // 向后找到当前段落的换行边界。
    while (end < currentText.length && currentText[end] != '\n') {
      end++
    }

    // 长按命中空行时不返回段落。
    if (end <= start) {
      return null
    }

    return start to end
  }

  // copyRange 根据 JS 命令复制指定范围文本到 Android 剪贴板。
  fun copyRange(start: Int, end: Int) {
    val range = clampedRange(start, end, text.length)

    // range 无效时不写剪贴板，避免复制空内容覆盖用户已有剪贴板。
    if (range == null) {
      return
    }

    val selectedText = text.subSequence(range.first, range.second).toString()
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText(CLIP_LABEL, selectedText))
  }

  // populateSelectionMenu 根据 props 重建 ActionMode 菜单。
  private fun populateSelectionMenu(menu: Menu) {
    // showSystemMenuItems=false 时先清掉系统菜单项，只保留业务自定义菜单。
    if (!showSystemMenuItems) {
      menu.clear()
    }

    menu.removeGroup(CUSTOM_MENU_GROUP_ID)

    menuItems.forEachIndexed { index, item ->
      // 缺少 id 或 title 的菜单项不加入 Android 菜单，避免无法回传明确动作。
      if (item.id.isBlank() || item.title.isBlank()) {
        return@forEachIndexed
      }

      menu.add(CUSTOM_MENU_GROUP_ID, CUSTOM_MENU_ITEM_ID_OFFSET + index, Menu.NONE, item.title)
          .setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
    }
  }

  // customMenuItemForMenuId 把 Android menu itemId 映射回 JS 传入的菜单项。
  private fun customMenuItemForMenuId(menuItemId: Int): SelectableRichTextMenuItem? {
    val index = menuItemId - CUSTOM_MENU_ITEM_ID_OFFSET

    // index 越界说明该菜单项不是 SelectableRichText 自定义菜单。
    if (index < 0 || index >= menuItems.size) {
      return null
    }

    return menuItems[index]
  }

  // emitMenuAction 把当前选区和菜单动作回调给 JS onMenuAction。
  private fun emitMenuAction(item: SelectableRichTextMenuItem) {
    val selectionStart = Selection.getSelectionStart(text)
    val selectionEnd = Selection.getSelectionEnd(text)
    val normalizedStart = min(selectionStart, selectionEnd)
    val normalizedEnd = max(selectionStart, selectionEnd)
    val selectedText =
        // 当前选区有效时回传真实文本，否则回传空字符串让 JS 明确知道没有选中文本。
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

  // invalidateActionMode 在菜单相关 props 更新时请求 Android 刷新当前 ActionMode。
  private fun invalidateActionMode() {
    // 只有已有 ActionMode 时才需要刷新菜单，未选中文本时无需做任何 UI 更新。
    if (currentActionMode != null) {
      currentActionMode?.invalidate()
    }
  }

  // ensureSpannableText 确保 Android Selection 能写入当前 TextView 文本 buffer。
  private fun ensureSpannableText(): Spannable? {
    val currentText = text

    // 已经是 Spannable 时可以直接写 Selection span。
    if (currentText is Spannable) {
      return currentText
    }

    // 普通 SpannedString 需要切换成 SPANNABLE buffer，否则 Selection.setSelection 不会生效。
    setText(currentText, TextView.BufferType.SPANNABLE)

    val updatedText = text

    // Android TextView 理论上会返回 Spannable；如果系统实现异常，则调用方不继续选区操作。
    if (updatedText !is Spannable) {
      return null
    }

    return updatedText
  }

  // setSelectionThroughTextViewAction 使用 TextView 的公开无障碍选区动作，同时触发系统 selection mode。
  private fun setSelectionThroughTextViewAction(selectionRange: Pair<Int, Int>) {
    val arguments = Bundle().apply {
      putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, selectionRange.first)
      putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, selectionRange.second)
    }

    // ACTION_SET_SELECTION 内部会调用 TextView 的 startSelectionActionModeAsync，创建系统菜单和手柄。
    performAccessibilityAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, arguments)
  }

  // updateNativeSelectableState 根据 selectable prop 同步 Android TextView 真实可选状态。
  // selectRange 命令会临时开启 selectable，clearSelection 调用这里恢复到 prop 设定的真实状态。
  private fun updateNativeSelectableState() {
    super.setTextIsSelectable(rnSelectable)
  }

  // selectedTextContentRect 计算当前选区首行在 TextView 内部坐标系里的矩形，用于系统菜单定位。
  private fun selectedTextContentRect(outRect: Rect) {
    val currentLayout = layout
    val selectionStart = Selection.getSelectionStart(text)
    val selectionEnd = Selection.getSelectionEnd(text)
    val normalizedStart = min(selectionStart, selectionEnd)
    val normalizedEnd = max(selectionStart, selectionEnd)

    // 没有布局或有效选区时，返回空 rect，让系统使用自己的默认定位。
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

  // emitMenuActionEvent 通过 Fabric EventDispatcher 发送 onMenuAction direct event。
  private fun emitMenuActionEvent(eventPayload: WritableMap) {
    val reactContext = context as? ReactContext

    // 只有 ReactContext 才能取得 RN EventDispatcher。
    if (reactContext == null) {
      return
    }

    val eventDispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)

    // EventDispatcher 为空时说明 React instance 已不可用，不能继续派发事件。
    if (eventDispatcher == null) {
      return
    }

    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher.dispatchEvent(SelectableRichTextMenuActionEvent(surfaceId, id, eventPayload))
  }

  // handleParagraphLongPress 在原生长按命中段落时回传 JS，对应 iOS handleParagraphLongPress。
  // pixelX/Y 是 view 本地像素坐标（与 paragraphRangeAtPoint 入参一致）。
  private fun handleParagraphLongPress(pixelX: Float, pixelY: Float) {
    markAsActiveSelectableRichTextView()
    // 清掉可能残留的命令选区，避免上一段选区与新长按段落并存（对应 iOS clearTextSelection）。
    clearSelection()

    val paragraphRange = paragraphRangeAtPoint(pixelX, pixelY) ?: return
    val start = paragraphRange.first
    val end = paragraphRange.second
    val paragraphText = text.subSequence(start, end).toString()

    // locationX/Y 是相对组件左上角的本地坐标（dp），对应 iOS gesture locationInView:self。
    val locationX = PixelUtil.toDIPFromPixel(pixelX)
    val locationY = PixelUtil.toDIPFromPixel(pixelY)

    // pageX/Y 是相对屏幕的坐标（dp），用于 JS 业务菜单锚点，对应 iOS convertPoint:toView:nil。
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

  // emitTextLongPressEvent 通过 Fabric EventDispatcher 发送 onTextLongPress direct event。
  private fun emitTextLongPressEvent(eventPayload: WritableMap) {
    val reactContext = context as? ReactContext

    // 只有 ReactContext 才能取得 RN EventDispatcher。
    if (reactContext == null) {
      return
    }

    val eventDispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)

    // EventDispatcher 为空时说明 React instance 已不可用，不能继续派发事件。
    if (eventDispatcher == null) {
      return
    }

    val surfaceId = UIManagerHelper.getSurfaceId(this)
    eventDispatcher.dispatchEvent(SelectableRichTextTextLongPressEvent(surfaceId, id, eventPayload))
  }

  // hasActiveSelection 判断当前 TextView 是否持有一个非空文本选区。
  private fun hasActiveSelection(): Boolean {
    val selectionStart = Selection.getSelectionStart(text)
    val selectionEnd = Selection.getSelectionEnd(text)
    return selectionStart >= 0 && selectionEnd >= 0 && selectionStart != selectionEnd
  }

  // hasInteractiveSelection 判断当前非空选区是否仍处在系统 ActionMode 交互生命周期里。
  private fun hasInteractiveSelection(): Boolean = currentActionMode != null && hasActiveSelection()

  // markAsActiveSelectableRichTextView 清理上一个 SelectableRichText 的残留选区。
  private fun markAsActiveSelectableRichTextView() {
    val previousActiveTextView = activeTextView?.get()

    // 只有切换到另一个 SelectableRichText 实例时才清理，避免干扰当前实例内的手柄拖动。
    if (previousActiveTextView != null && previousActiveTextView !== this) {
      previousActiveTextView.clearSelection()
    }

    activeTextView = WeakReference(this)
  }

  companion object {
    // CLIP_LABEL 是写入 Android 剪贴板时使用的来源标签。
    private const val CLIP_LABEL = "SelectableRichText"

    // CUSTOM_MENU_GROUP_ID 用于批量移除 SelectableRichText 自定义菜单项。
    private const val CUSTOM_MENU_GROUP_ID = 0x53454c

    // CUSTOM_MENU_ITEM_ID_OFFSET 给自定义菜单生成不易和系统项冲突的 itemId。
    private const val CUSTOM_MENU_ITEM_ID_OFFSET = 0x53454c00

    // activeTextView 记录当前交互文本块，切换块时清理上一个 Android Selection。
    private var activeTextView: WeakReference<SelectableRichTextView>? = null

    // clampedRange 把 JS 或菜单传入的选区范围裁剪到当前文本长度内。
    fun clampedRange(start: Int, end: Int, textLength: Int): Pair<Int, Int>? {
      // 起止位置非法、反向或文本为空时返回 null，调用方不改变当前状态。
      if (start < 0 || end <= start || textLength <= 0) {
        return null
      }

      val clampedStart = min(start, textLength)
      val clampedEnd = min(end, textLength)

      // 裁剪后没有实际选中文本时返回 null。
      if (clampedEnd <= clampedStart) {
        return null
      }

      return clampedStart to clampedEnd
    }
  }
}
