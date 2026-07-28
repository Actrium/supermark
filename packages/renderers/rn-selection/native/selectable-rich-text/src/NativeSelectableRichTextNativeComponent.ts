import type React from 'react';
import {
  codegenNativeCommands,
  codegenNativeComponent,
  type HostComponent,
  type ViewProps,
} from 'react-native';
import type {
  DirectEventHandler,
  Double,
  Int32,
  WithDefault,
} from 'react-native/Libraries/Types/CodegenTypes';

interface NativeSelectableRichTextMenuItem {
  id: string;
  title: string;
}

interface NativeSelectableRichTextMenuActionEvent {
  id: string;
  title: string;
  selectedText: string;
  selectionStart: Int32;
  selectionEnd: Int32;
}

// 坐标字段在 Codegen 中必须用 Double，原始 number 会被 codegen 拒绝。
interface NativeSelectableRichTextLongPressEvent {
  paragraphText: string;
  selectionStart: Int32;
  selectionEnd: Int32;
  locationX: Double;
  locationY: Double;
  pageX: Double;
  pageY: Double;
}

export interface NativeSelectableRichTextProps extends ViewProps {
  // selectable 默认 false，避免原生长按选词与宿主长按手势冲突。
  selectable?: WithDefault<boolean, false>;
  menuItems?: ReadonlyArray<NativeSelectableRichTextMenuItem>;
  showSystemMenuItems?: WithDefault<boolean, true>;
  clearSelectionOnMenuAction?: WithDefault<boolean, false>;
  onMenuAction?: DirectEventHandler<NativeSelectableRichTextMenuActionEvent>;
  // onTextLongPress 由原生 UILongPressGestureRecognizer 命中段落后回传，宿主据此弹业务菜单。
  onTextLongPress?: DirectEventHandler<NativeSelectableRichTextLongPressEvent>;
}

export type NativeSelectableRichTextComponentType =
  HostComponent<NativeSelectableRichTextProps>;

interface NativeSelectableRichTextCommands {
  // selectRange 让原生文本组件选中指定的 UTF-16 字符范围。
  // commands 第一参数必须是 React.ElementRef<HostComponent<...>>，这是 codegen 的硬性要求。
  selectRange: (
    viewRef: React.ElementRef<NativeSelectableRichTextComponentType>,
    start: Int32,
    end: Int32
  ) => void;

  // selectParagraphAt 根据宿主传入的本地坐标命中长按所在段落并选中。
  // x/y 是相对 SelectableRichText 左上角的本地坐标（与 Pressable 的 locationX/locationY 对齐）。
  selectParagraphAt: (
    viewRef: React.ElementRef<NativeSelectableRichTextComponentType>,
    x: Double,
    y: Double
  ) => void;

  // clearSelection 清理当前原生文本选区并关闭选区交互状态。
  clearSelection: (
    viewRef: React.ElementRef<NativeSelectableRichTextComponentType>
  ) => void;

  // copyRange 复制指定 UTF-16 字符范围到系统剪贴板。
  copyRange: (
    viewRef: React.ElementRef<NativeSelectableRichTextComponentType>,
    start: Int32,
    end: Int32
  ) => void;
}

// Commands 是 JS ref API 到 Fabric native commands 的唯一派发入口。
export const Commands: NativeSelectableRichTextCommands =
  codegenNativeCommands<NativeSelectableRichTextCommands>({
    supportedCommands: [
      'selectRange',
      'selectParagraphAt',
      'clearSelection',
      'copyRange',
    ],
  });

// NativeSelectableRichText 是 Fabric HostComponent 名称，必须和原生 ComponentDescriptor 名称一致。
// 使用 "SelectableRichText" 而非 "SelectableText"，避免与 RN 自带 Text/SelectableText 语义混淆。
export default codegenNativeComponent<NativeSelectableRichTextProps>(
  'SelectableRichText',
  {
    // interfaceOnly 避免 Codegen 生成普通 View ShadowNode，原生侧使用手写 Paragraph ShadowNode。
    interfaceOnly: true,
  }
);
