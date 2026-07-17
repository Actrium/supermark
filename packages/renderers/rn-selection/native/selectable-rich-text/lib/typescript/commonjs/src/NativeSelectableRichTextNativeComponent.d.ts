import type React from 'react';
import { type HostComponent, type ViewProps } from 'react-native';
import type { DirectEventHandler, Double, Int32, WithDefault } from 'react-native/Libraries/Types/CodegenTypes';
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
    selectable?: WithDefault<boolean, false>;
    menuItems?: ReadonlyArray<NativeSelectableRichTextMenuItem>;
    showSystemMenuItems?: WithDefault<boolean, true>;
    clearSelectionOnMenuAction?: WithDefault<boolean, false>;
    onMenuAction?: DirectEventHandler<NativeSelectableRichTextMenuActionEvent>;
    onTextLongPress?: DirectEventHandler<NativeSelectableRichTextLongPressEvent>;
}
export type NativeSelectableRichTextComponentType = HostComponent<NativeSelectableRichTextProps>;
interface NativeSelectableRichTextCommands {
    selectRange: (viewRef: React.ElementRef<NativeSelectableRichTextComponentType>, start: Int32, end: Int32) => void;
    selectParagraphAt: (viewRef: React.ElementRef<NativeSelectableRichTextComponentType>, x: Double, y: Double) => void;
    clearSelection: (viewRef: React.ElementRef<NativeSelectableRichTextComponentType>) => void;
    copyRange: (viewRef: React.ElementRef<NativeSelectableRichTextComponentType>, start: Int32, end: Int32) => void;
}
export declare const Commands: NativeSelectableRichTextCommands;
declare const _default: import("react-native/types_generated/Libraries/Utilities/codegenNativeComponent").NativeComponentType<NativeSelectableRichTextProps>;
export default _default;
//# sourceMappingURL=NativeSelectableRichTextNativeComponent.d.ts.map