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
export interface SelectableRichTextLongPressEvent {
    paragraphText: string;
    selectionStart: number;
    selectionEnd: number;
    locationX: number;
    locationY: number;
    pageX: number;
    pageY: number;
}
export interface SelectableRichTextRef {
    selectRange: (start: number, end: number) => void;
    selectParagraphAt: (x: number, y: number) => void;
    clearSelection: () => void;
    copyRange: (start: number, end: number) => void;
}
export interface SelectableRichTextProps {
    selectable?: boolean;
    style?: StyleProp<TextStyle>;
    children?: React.ReactNode;
    menuItems?: SelectableRichTextMenuItem[];
    showSystemMenuItems?: boolean;
    clearSelectionOnMenuAction?: boolean;
    onMenuAction?: (event: NativeSyntheticEvent<SelectableRichTextMenuActionEvent>) => void;
    onTextLongPress?: (event: NativeSyntheticEvent<SelectableRichTextLongPressEvent>) => void;
}
//# sourceMappingURL=types.d.ts.map