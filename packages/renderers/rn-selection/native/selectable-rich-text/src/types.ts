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

// SelectableRichTextLongPressEvent is the event reported back to the host when a native long
// press hits a paragraph; the host shows its business menu based on it.
export interface SelectableRichTextLongPressEvent {
  paragraphText: string;
  selectionStart: number;
  selectionEnd: number;
  // locationX/locationY are the long press's local coordinates relative to SelectableRichText's top-left corner.
  locationX: number;
  locationY: number;
  // pageX/pageY are the long press's position in screen coordinates, used for positioning the business menu.
  pageX: number;
  pageY: number;
}

export interface SelectableRichTextRef {
  // selectRange selects the given UTF-16 character range and shows the system selection menu.
  selectRange: (start: number, end: number) => void;
  // selectParagraphAt hit-tests the paragraph at the local coordinates passed in by the host
  // (relative to SelectableRichText's top-left corner), selects it, then shows the system
  // selection menu. Used when the host controls the long-press entry point itself.
  selectParagraphAt: (x: number, y: number) => void;
  // clearSelection clears the current native text selection and closes the selection interaction state.
  clearSelection: () => void;
  // copyRange copies the given UTF-16 character range to the system clipboard.
  copyRange: (start: number, end: number) => void;
}

export interface SelectableRichTextProps {
  // selectable defaults to false: avoids UITextView/TextView's built-in long-press word selection
  // conflicting with the host's long-press gesture.
  // The native side temporarily enables selection when the host triggers it via the
  // ref.selectParagraphAt / selectRange commands.
  selectable?: boolean;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
  menuItems?: SelectableRichTextMenuItem[];
  showSystemMenuItems?: boolean;
  clearSelectionOnMenuAction?: boolean;
  onMenuAction?: (
    event: NativeSyntheticEvent<SelectableRichTextMenuActionEvent>
  ) => void;
  // onTextLongPress is triggered by the native long-press gesture, reporting back the hit
  // paragraph's range and menu anchor.
  // The host shows its business menu in the callback, then performs the selection action via
  // ref.selectRange / copyRange.
  onTextLongPress?: (
    event: NativeSyntheticEvent<SelectableRichTextLongPressEvent>
  ) => void;
}
