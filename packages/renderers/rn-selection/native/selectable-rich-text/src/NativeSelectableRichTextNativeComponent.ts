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

// Coordinate fields must use Double under Codegen; a plain number is rejected by codegen.
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
  // selectable defaults to false, to avoid native long-press word selection conflicting with the host's long-press gesture.
  selectable?: WithDefault<boolean, false>;
  menuItems?: ReadonlyArray<NativeSelectableRichTextMenuItem>;
  showSystemMenuItems?: WithDefault<boolean, true>;
  clearSelectionOnMenuAction?: WithDefault<boolean, false>;
  onMenuAction?: DirectEventHandler<NativeSelectableRichTextMenuActionEvent>;
  // onTextLongPress is reported back after the native UILongPressGestureRecognizer hits a paragraph; the host shows its business menu based on it.
  onTextLongPress?: DirectEventHandler<NativeSelectableRichTextLongPressEvent>;
}

export type NativeSelectableRichTextComponentType =
  HostComponent<NativeSelectableRichTextProps>;

interface NativeSelectableRichTextCommands {
  // selectRange makes the native text component select the given UTF-16 character range.
  // The first argument of a command must be React.ElementRef<HostComponent<...>>; this is a hard requirement of codegen.
  selectRange: (
    viewRef: React.ElementRef<NativeSelectableRichTextComponentType>,
    start: Int32,
    end: Int32
  ) => void;

  // selectParagraphAt hit-tests the paragraph under the local coordinates passed in by the host and selects it.
  // x/y are local coordinates relative to SelectableRichText's top-left corner (aligned with Pressable's locationX/locationY).
  selectParagraphAt: (
    viewRef: React.ElementRef<NativeSelectableRichTextComponentType>,
    x: Double,
    y: Double
  ) => void;

  // clearSelection clears the current native text selection and closes the selection interaction state.
  clearSelection: (
    viewRef: React.ElementRef<NativeSelectableRichTextComponentType>
  ) => void;

  // copyRange copies the given UTF-16 character range to the system clipboard.
  copyRange: (
    viewRef: React.ElementRef<NativeSelectableRichTextComponentType>,
    start: Int32,
    end: Int32
  ) => void;
}

// Commands is the sole dispatch entry point from the JS ref API to the Fabric native commands.
export const Commands: NativeSelectableRichTextCommands =
  codegenNativeCommands<NativeSelectableRichTextCommands>({
    supportedCommands: [
      'selectRange',
      'selectParagraphAt',
      'clearSelection',
      'copyRange',
    ],
  });

// NativeSelectableRichText is the Fabric HostComponent name; it must match the native ComponentDescriptor name.
// "SelectableRichText" is used instead of "SelectableText" to avoid a naming clash with RN's built-in Text/SelectableText semantics.
export default codegenNativeComponent<NativeSelectableRichTextProps>(
  'SelectableRichText',
  {
    // interfaceOnly prevents Codegen from generating a plain View ShadowNode; the native side uses a hand-written Paragraph ShadowNode instead.
    interfaceOnly: true,
  }
);
