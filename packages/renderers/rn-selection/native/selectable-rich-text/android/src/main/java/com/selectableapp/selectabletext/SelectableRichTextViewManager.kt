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

// SelectableRichTextViewManager 通过"组合委托"复用 RN Text 的 props、Spannable 和 Fabric state 链路，
// 而不是继承 ReactTextViewManager。
//
// 背景：RN 0.81~0.84 把 ReactTextViewManager 从 Java 迁到 Kotlin 时漏写 open，变成 final class，
// library 无法继承（0.85 才补回 open）。同时 0.83 的 TextLayoutManager、ReactTextViewAccessibilityDelegate
// 等是 internal，library 也拿不到。
//
// 解法：
// 1. 继承 abstract 父类 ReactTextAnchorViewManager（0.83/0.85 都是 public abstract class），
//    自动获得 17 个 view 层 @ReactProp（numberOfLines/ellipsizeMode/selectable/…），RN 反射调用。
// 2. 组合一个 ReactTextViewManager 实例作为 delegate，委托 updateState/updateExtraData 等
//    Fabric state→spannable 链路。delegate 内部对 TextLayoutManager(internal) 的调用都在其自身
//    module 内消化，library 不需要可见性。
// 3. Fabric 下 state 下发走 SurfaceMountingManager → ViewManager.updateState → updateExtraData，
//    是 RN 通用路径，不要求 ViewManager 是 ReactTextViewManager 子类（见 SurfaceMountingManager.java）。
//
// 这样 Android 端同时支持 RN 0.83 与 0.85，library 不再依赖 ReactTextViewManager 可继承。
//
// 已知行为退化（相对继承 ReactTextViewManager，仅影响边缘场景，不影响选区/菜单/文本渲染核心功能）：
// - prepareToRecycleView 不调 ReactTextView.recycleView（package-private 不可见），
//   background/border 重置依赖后续 @ReactProp 重新下发覆盖；
// - updateViewAccessibility 用 BaseViewManager 默认的 ReactAccessibilityDelegate，
//   不使用 ReactTextViewAccessibilityDelegate（internal），丢失 link span 的无障碍优化。
@Suppress("DEPRECATION") // ReactTextShadowNode 在 0.83 标记 @Deprecated（Legacy），Fabric 下仅用于满足基类契约。
@OptIn(UnstableReactNativeAPI::class) // ReactTextAnchorViewManager / prepareToRecycleView 等标 @UnstableReactNativeAPI，需显式 opt-in。
@ReactModule(name = SelectableRichTextViewManager.REACT_CLASS)
class SelectableRichTextViewManager :
    ReactTextAnchorViewManager<ReactTextShadowNode>(), IViewManagerWithChildren {

  // delegate 承载 ReactTextViewManager 独有的 Fabric state→spannable 转换逻辑。
  // 其内部依赖的 TextLayoutManager(internal) 调用都在 delegate 自身 module 内消化，
  // library 通过 public override 方法委托即可。
  private val delegate: ReactTextViewManager = ReactTextViewManager()

  // getName 导出给 JS Fabric HostComponent 使用的组件名。
  override fun getName(): String = REACT_CLASS

  // createViewInstance 创建真正承载 Android 原生选区能力的 ReactTextView 子类。
  override fun createViewInstance(context: ThemedReactContext): SelectableRichTextView =
      SelectableRichTextView(context)

  // updateState 是 Fabric state 下发入口：SurfaceMountingManager 调用 ViewManager.updateState，
  // library 委托 delegate 走 ReactTextViewManager 的 attributedString→spannable 链路。
  // 返回的 ReactTextUpdate（含 spannable）会由框架继续传给 updateExtraData。
  override fun updateState(
      view: ReactTextView,
      props: ReactStylesDiffMap,
      stateWrapper: StateWrapper
  ): Any? = delegate.updateState(view, props, stateWrapper)

  // updateExtraData 把 delegate 构造好的 spannable 落到 ReactTextView，
  // 同时处理 inline image span 与 accessibility links，全部委托 delegate。
  override fun updateExtraData(view: ReactTextView, extraData: Any) {
    delegate.updateExtraData(view, extraData)
  }

  // prepareToRecycleView 在 view 被回收时重置状态。
  // ReactTextViewManager 的实现调 recycleView（package-private，跨 module 不可见）+ setSelectionColor
  //（ReactTextAnchorViewManager 的 internal fun，不可见）。这里调 super（BaseViewManager 重置 view 属性）
  // 后用 DefaultStyleValuesUtil（public）等价重置 selectionColor；background/border 残留由后续
  // @ReactProp 重新下发覆盖。
  override fun prepareToRecycleView(
      reactContext: ThemedReactContext,
      view: ReactTextView
  ): ReactTextView? {
    val prepared = super.prepareToRecycleView(reactContext, view) ?: return null
    view.highlightColor = DefaultStyleValuesUtil.getDefaultTextColorHighlight(view.context)
    return prepared
  }

  // onAfterUpdateTransaction 在 props 事务提交后刷新 TextView。ReactTextView.updateView 是 public，
  // library 直接调，行为与 ReactTextViewManager 一致。super（BaseViewManager）会顺带处理 accessibility。
  override fun onAfterUpdateTransaction(view: ReactTextView) {
    super.onAfterUpdateTransaction(view)
    view.updateView()
  }

  // needsCustomLayoutForChildren=true 表示 Text 自行处理 children 布局（嵌套 Text 走 spannable，
  // 不走 yoga 自动布局），与 ReactTextViewManager 保持一致。
  override fun needsCustomLayoutForChildren(): Boolean = true

  // createShadowNodeInstance 在 Fabric 下通常不被调用（C++ ShadowNode 由 ComponentDescriptor 创建），
  // 但 ViewManager 基类默认实现会抛异常，这里委托 delegate 避免意外调用崩溃。
  override fun createShadowNodeInstance(): ReactTextShadowNode = delegate.createShadowNodeInstance()

  // getShadowNodeClass 是 ViewManager 基类 abstract 方法，返回 ReactTextShadowNode 类型。
  override fun getShadowNodeClass(): Class<ReactTextShadowNode> = ReactTextShadowNode::class.java

  // setOverflow 是 ReactTextViewManager 独有的 @ReactProp（ReactTextAnchorViewManager 未提供），
  // 委托 delegate 保持 overflow prop 行为一致。
  @ReactProp(name = "overflow")
  fun setOverflow(view: ReactTextView, overflow: String?) {
    delegate.setOverflow(view, overflow)
  }

  // setPadding 走 delegate，保持和 RN Text 一致的 padding 处理。
  override fun setPadding(view: ReactTextView, left: Int, top: Int, right: Int, bottom: Int) {
    delegate.setPadding(view, left, top, right, bottom)
  }

  // setMenuItems 把 JS menuItems 数组转换成 Android ActionMode 菜单配置。
  @ReactProp(name = "menuItems")
  fun setMenuItems(view: SelectableRichTextView, menuItems: ReadableArray?) {
    val parsedMenuItems = mutableListOf<SelectableRichTextMenuItem>()

    // menuItems 为空时清空自定义菜单配置。
    if (menuItems == null) {
      view.menuItems = parsedMenuItems
      return
    }

    for (index in 0 until menuItems.size()) {
      val item = menuItems.getMap(index)

      // 缺少 id 或 title 的项不传给原生菜单，避免点击后 JS 无法区分动作。
      if (item == null || !item.hasKey("id") || !item.hasKey("title")) {
        continue
      }

      val id = item.getString("id")
      val title = item.getString("title")

      // id/title 不是有效字符串时跳过该菜单项。
      if (id.isNullOrBlank() || title.isNullOrBlank()) {
        continue
      }

      parsedMenuItems.add(SelectableRichTextMenuItem(id, title))
    }

    view.menuItems = parsedMenuItems
  }

  // setShowSystemMenuItems 控制 Android ActionMode 是否保留系统菜单项。
  @ReactProp(name = "showSystemMenuItems", defaultBoolean = true)
  fun setShowSystemMenuItems(view: SelectableRichTextView, showSystemMenuItems: Boolean) {
    view.showSystemMenuItems = showSystemMenuItems
  }

  // setClearSelectionOnMenuAction 控制自定义菜单点击后是否清空选区。
  @ReactProp(name = "clearSelectionOnMenuAction", defaultBoolean = false)
  fun setClearSelectionOnMenuAction(view: SelectableRichTextView, clearSelectionOnMenuAction: Boolean) {
    view.clearSelectionOnMenuAction = clearSelectionOnMenuAction
  }

  // receiveCommand 处理 Fabric dispatchCommand 传入的字符串命令。
  override fun receiveCommand(root: ReactTextView, commandId: String, args: ReadableArray?) {
    val selectableTextView = root as? SelectableRichTextView

    // command 只处理本 manager 创建的 SelectableRichTextView，避免错误 view 类型执行选区命令。
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

  // handleSelectRangeCommand 校验 selectRange 命令参数并转发给原生视图。
  private fun handleSelectRangeCommand(view: SelectableRichTextView, args: ReadableArray?) {
    // selectRange 必须包含 start/end 两个数字参数。
    if (args == null || args.size() < 2) {
      throw JSApplicationIllegalArgumentException("selectRange requires start and end arguments")
    }

    view.selectRange(args.getInt(0), args.getInt(1))
  }

  // handleSelectParagraphAtCommand 校验 selectParagraphAt 命令参数并转发给原生视图。
  private fun handleSelectParagraphAtCommand(view: SelectableRichTextView, args: ReadableArray?) {
    // selectParagraphAt 必须包含 x/y 两个数字参数。
    if (args == null || args.size() < 2) {
      throw JSApplicationIllegalArgumentException("selectParagraphAt requires x and y arguments")
    }

    view.selectParagraphAt(args.getDouble(0).toFloat(), args.getDouble(1).toFloat())
  }

  // handleCopyRangeCommand 校验 copyRange 命令参数并复制指定文本范围。
  private fun handleCopyRangeCommand(view: SelectableRichTextView, args: ReadableArray?) {
    // copyRange 必须包含 start/end 两个数字参数。
    if (args == null || args.size() < 2) {
      throw JSApplicationIllegalArgumentException("copyRange requires start and end arguments")
    }

    view.copyRange(args.getInt(0), args.getInt(1))
  }

  companion object {
    // REACT_CLASS 是 Android Fabric 注册名。
    // FabricNameComponentMapping 不在映射表里的名字会原样透传，
    // ViewManagerRegistry.get 再尝试加 "RCT" 前缀查找。
    // 因此 JS viewName "SelectableRichText" 会查 "SelectableRichText" 和 "RCTSelectableRichText"，
    // 这里注册名用 "RCTSelectableRichText" 命中后者。
    const val REACT_CLASS = "RCTSelectableRichText"

    // COMMAND_SELECT_RANGE 是 JS ref.selectRange 派发的 command 名称。
    private const val COMMAND_SELECT_RANGE = "selectRange"

    // COMMAND_SELECT_PARAGRAPH_AT 是 JS ref.selectParagraphAt 派发的 command 名称。
    private const val COMMAND_SELECT_PARAGRAPH_AT = "selectParagraphAt"

    // COMMAND_CLEAR_SELECTION 是 JS ref.clearSelection 派发的 command 名称。
    private const val COMMAND_CLEAR_SELECTION = "clearSelection"

    // COMMAND_COPY_RANGE 是 JS ref.copyRange 派发的 command 名称。
    private const val COMMAND_COPY_RANGE = "copyRange"
  }
}
