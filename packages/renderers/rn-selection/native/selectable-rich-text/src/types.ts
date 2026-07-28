import type React from 'react';
import type { NativeSyntheticEvent, StyleProp, TextStyle } from 'react-native';

export interface SelectableRichTextMenuItem {
  id: string;
  title: string;
}

export interface SelectableRichTextMenuActionEvent {
  id: string;
  title: string;
  selectedText: string;
  selectionStart: number;
  selectionEnd: number;
}

// SelectableRichTextLongPressEvent 是原生长按命中段落时回传给宿主的事件，宿主据此弹业务菜单。
export interface SelectableRichTextLongPressEvent {
  paragraphText: string;
  selectionStart: number;
  selectionEnd: number;
  // locationX/locationY 是长按相对 SelectableRichText 左上角的本地坐标。
  locationX: number;
  locationY: number;
  // pageX/pageY 是长按在屏幕坐标系的位置，用于业务菜单定位。
  pageX: number;
  pageY: number;
}

export interface SelectableRichTextRef {
  // selectRange 选中指定的 UTF-16 字符范围，并弹出系统选区菜单。
  selectRange: (start: number, end: number) => void;
  // selectParagraphAt 根据宿主传入的本地坐标（相对 SelectableRichText 左上角），
  // 命中长按所在段落并选中，再弹出系统选区菜单。用于宿主控制长按入口的场景。
  selectParagraphAt: (x: number, y: number) => void;
  // clearSelection 清理当前原生文本选区并关闭选区交互状态。
  clearSelection: () => void;
  // copyRange 复制指定 UTF-16 字符范围到系统剪贴板。
  copyRange: (start: number, end: number) => void;
}

export interface SelectableRichTextProps {
  // selectable 默认 false：避免 UITextView/TextView 自带长按选词与宿主长按手势冲突。
  // 宿主通过 ref.selectParagraphAt / selectRange 命令触发选取时，原生会临时开启选取能力。
  selectable?: boolean;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
  menuItems?: SelectableRichTextMenuItem[];
  showSystemMenuItems?: boolean;
  clearSelectionOnMenuAction?: boolean;
  onMenuAction?: (
    event: NativeSyntheticEvent<SelectableRichTextMenuActionEvent>
  ) => void;
  // onTextLongPress 由原生长按 gesture 触发，回传命中的段落 range 和菜单锚点。
  // 宿主在回调里弹业务菜单，再通过 ref.selectRange / copyRange 执行选取动作。
  onTextLongPress?: (
    event: NativeSyntheticEvent<SelectableRichTextLongPressEvent>
  ) => void;
}
