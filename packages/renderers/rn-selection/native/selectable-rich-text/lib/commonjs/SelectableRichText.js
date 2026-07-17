"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _react = _interopRequireDefault(require("react"));
var _reactNative = require("react-native");
var _TextAncestor = _interopRequireDefault(require("react-native/Libraries/Text/TextAncestor"));
var _NativeSelectableRichTextNativeComponent = _interopRequireWildcard(require("./NativeSelectableRichTextNativeComponent"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// SelectableRichText 原生命令名称，和 Fabric native commands 保持一致。
const SELECTABLE_RICH_TEXT_COMMANDS = {
  selectRange: 'selectRange',
  selectParagraphAt: 'selectParagraphAt',
  clearSelection: 'clearSelection',
  copyRange: 'copyRange'
};

// NativeCommandViewRef 是 codegen Commands 期望的 viewRef 类型。
// RN 0.83 的 HostComponent 类型让 React.ElementRef 解析成 never，调用 Commands 时需要把
// HostInstance 强制转换成这个类型；0.85 起 HostComponent 改为 ForwardRefExoticComponent，
// ElementRef 能正常解析出实例类型，转换仍兼容。

// iOS 和 Android 都使用同名原生 SelectableRichText，其他平台保留 RN Text fallback。
const NativeSelectableRichText = _reactNative.Platform.OS === 'ios' || _reactNative.Platform.OS === 'android' ? _NativeSelectableRichTextNativeComponent.default : null;

// 检查 SelectableRichText 子树里是否包含 RN View，避免 View 作为 NSTextAttachment 被整体选中。
function containsUnsupportedViewChild(children) {
  let hasUnsupportedView = false;
  _react.default.Children.forEach(children, child => {
    // 已经找到 View 时跳过后续检查，避免重复遍历。
    if (hasUnsupportedView) {
      return;
    }

    // 空节点和布尔节点不会渲染成文本内容，不需要继续检查。
    if (child == null || typeof child === 'boolean') {
      return;
    }

    // 字符串和数字会进入文本存储，是 SelectableRichText 支持的内容。
    if (typeof child === 'string' || typeof child === 'number') {
      return;
    }

    // 非 React element 节点无法识别为 RN View，直接跳过。
    if (! /*#__PURE__*/_react.default.isValidElement(child)) {
      return;
    }

    // RN View 会被 RN Text 系统转换成 attachment，因此禁止放入 SelectableRichText。
    if (child.type === _reactNative.View) {
      hasUnsupportedView = true;
      return;
    }

    // 继续检查 Text、Fragment 或自定义元素传入的 children，避免深层 View 绕过限制。
    if (child.props.children != null && containsUnsupportedViewChild(child.props.children)) {
      hasUnsupportedView = true;
    }
  });
  return hasUnsupportedView;
}

// dispatchSelectableRichTextCommand 统一检查 Fabric HostComponent ref 后再执行命令。
function dispatchSelectableRichTextCommand(nativeRef, dispatchCommand) {
  const nativeView = nativeRef.current;

  // nativeView 为空时说明原生视图尚未挂载，不能发送 Fabric command。
  if (nativeView == null) {
    return;
  }

  // HostInstance → NativeCommandViewRef：跨 RN 版本兼容 Commands 的 viewRef 类型。
  dispatchCommand(nativeView);
}
const SelectableRichText = /*#__PURE__*/_react.default.forwardRef(({
  selectable = false,
  style,
  children,
  menuItems,
  showSystemMenuItems = true,
  clearSelectionOnMenuAction = false,
  onMenuAction,
  onTextLongPress
}, ref) => {
  // 原生命令通过 Fabric HostComponent ref 定位目标原生视图。
  const nativeRef = _react.default.useRef(null);

  // 暴露给 RN 菜单调用的原生选区命令。
  _react.default.useImperativeHandle(ref, () => ({
    selectRange: (start, end) => {
      dispatchSelectableRichTextCommand(nativeRef, nativeView => {
        _NativeSelectableRichTextNativeComponent.Commands[SELECTABLE_RICH_TEXT_COMMANDS.selectRange](nativeView, start, end);
      });
    },
    selectParagraphAt: (x, y) => {
      dispatchSelectableRichTextCommand(nativeRef, nativeView => {
        _NativeSelectableRichTextNativeComponent.Commands[SELECTABLE_RICH_TEXT_COMMANDS.selectParagraphAt](nativeView, x, y);
      });
    },
    clearSelection: () => {
      dispatchSelectableRichTextCommand(nativeRef, nativeView => {
        _NativeSelectableRichTextNativeComponent.Commands[SELECTABLE_RICH_TEXT_COMMANDS.clearSelection](nativeView);
      });
    },
    copyRange: (start, end) => {
      dispatchSelectableRichTextCommand(nativeRef, nativeView => {
        _NativeSelectableRichTextNativeComponent.Commands[SELECTABLE_RICH_TEXT_COMMANDS.copyRange](nativeView, start, end);
      });
    }
  }), []);

  // SelectableRichText 只允许文本子树，避免 View 进入原生层后变成不可拆分附件。
  if (containsUnsupportedViewChild(children)) {
    throw new Error('SelectableRichText does not support View children. Use nested Text, or render View outside SelectableRichText.');
  }

  // 未注册原生 SelectableRichText 的平台使用 RN Text 自带 selectable 能力。
  if (!NativeSelectableRichText) {
    return /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.Text, {
      selectable: selectable,
      style: style,
      children: children
    });
  }

  // 必须提供 TextAncestor context，使子 <Text> 按 RN 文本子树合并到同一个原生文本块。
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(NativeSelectableRichText, {
    ref: nativeRef,
    selectable: selectable,
    style: style,
    menuItems: menuItems,
    showSystemMenuItems: showSystemMenuItems,
    clearSelectionOnMenuAction: clearSelectionOnMenuAction,
    onMenuAction: onMenuAction,
    onTextLongPress: onTextLongPress,
    children: /*#__PURE__*/(0, _jsxRuntime.jsx)(_TextAncestor.default.Provider, {
      value: true,
      children: children
    })
  });
});
var _default = exports.default = SelectableRichText;
//# sourceMappingURL=SelectableRichText.js.map