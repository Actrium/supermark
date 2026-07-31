import React from 'react';
import { Platform, Text, View } from 'react-native';
import type { HostInstance } from 'react-native';
import TextAncestor from 'react-native/Libraries/Text/TextAncestor';
import FabricSelectableRichText, {
  Commands as SelectableRichTextCommands,
  type NativeSelectableRichTextComponentType,
} from './NativeSelectableRichTextNativeComponent';
import type {
  SelectableRichTextLongPressEvent,
  SelectableRichTextMenuActionEvent,
  SelectableRichTextMenuItem,
  SelectableRichTextProps,
  SelectableRichTextRef,
} from './types';

// SelectableRichText's native command names, kept in sync with the Fabric native commands.
const SELECTABLE_RICH_TEXT_COMMANDS = {
  selectRange: 'selectRange',
  selectParagraphAt: 'selectParagraphAt',
  clearSelection: 'clearSelection',
  copyRange: 'copyRange',
} as const;

type NativeSelectableRichTextInstance = HostInstance;

// NativeCommandViewRef is the viewRef type expected by the codegen'd Commands.
// In RN 0.83, HostComponent's type makes React.ElementRef resolve to never, so calling Commands
// requires force-casting the HostInstance to this type; starting in 0.85, HostComponent was
// changed to ForwardRefExoticComponent, so ElementRef resolves to the real instance type
// correctly — the cast is still compatible either way.
type NativeCommandViewRef =
  React.ElementRef<NativeSelectableRichTextComponentType>;

// iOS and Android both use the identically-named native SelectableRichText; other platforms keep the RN Text fallback.
const NativeSelectableRichText =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? (FabricSelectableRichText as React.ComponentType<
        SelectableRichTextProps & {
          ref?: React.Ref<NativeSelectableRichTextInstance>;
        }
      >)
    : null;

// Checks whether SelectableRichText's subtree contains an RN View, to avoid a View being selected
// as a whole as an NSTextAttachment.
function containsUnsupportedViewChild(children: React.ReactNode): boolean {
  let hasUnsupportedView = false;

  React.Children.forEach(children, (child) => {
    // Skip further checks once a View has already been found, to avoid redundant traversal.
    if (hasUnsupportedView) {
      return;
    }

    // Null and boolean nodes don't render as text content, so no further check is needed.
    if (child == null || typeof child === 'boolean') {
      return;
    }

    // Strings and numbers go into the text storage and are content SelectableRichText supports.
    if (typeof child === 'string' || typeof child === 'number') {
      return;
    }

    // A non-React-element node can't be identified as an RN View, so skip it.
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) {
      return;
    }

    // An RN View gets converted into an attachment by the RN Text system, so it's disallowed
    // inside SelectableRichText.
    if (child.type === View) {
      hasUnsupportedView = true;
      return;
    }

    // Keep checking children passed into a Text, Fragment, or custom element, to prevent a deeply
    // nested View from bypassing the restriction.
    if (
      child.props.children != null &&
      containsUnsupportedViewChild(child.props.children)
    ) {
      hasUnsupportedView = true;
    }
  });

  return hasUnsupportedView;
}

// dispatchSelectableRichTextCommand centralizes checking the Fabric HostComponent ref before
// executing a command.
function dispatchSelectableRichTextCommand(
  nativeRef: React.RefObject<NativeSelectableRichTextInstance | null>,
  dispatchCommand: (nativeView: NativeCommandViewRef) => void
) {
  const nativeView = nativeRef.current;

  // A null nativeView means the native view hasn't mounted yet, so the Fabric command can't be sent.
  if (nativeView == null) {
    return;
  }

  // HostInstance -> NativeCommandViewRef: keeps Commands' viewRef type compatible across RN versions.
  dispatchCommand(nativeView as unknown as NativeCommandViewRef);
}

const SelectableRichText = React.forwardRef<
  SelectableRichTextRef,
  SelectableRichTextProps
>(
  (
    {
      selectable = false,
      style,
      children,
      menuItems,
      showSystemMenuItems = true,
      clearSelectionOnMenuAction = false,
      onMenuAction,
      onTextLongPress,
    },
    ref
  ): React.JSX.Element => {
    // Native commands locate the target native view through the Fabric HostComponent ref.
    const nativeRef = React.useRef<NativeSelectableRichTextInstance | null>(
      null
    );

    // Native selection commands exposed for the RN menu to call.
    React.useImperativeHandle(
      ref,
      () => ({
        selectRange: (start: number, end: number) => {
          dispatchSelectableRichTextCommand(nativeRef, (nativeView) => {
            SelectableRichTextCommands[
              SELECTABLE_RICH_TEXT_COMMANDS.selectRange
            ](nativeView, start, end);
          });
        },
        selectParagraphAt: (x: number, y: number) => {
          dispatchSelectableRichTextCommand(nativeRef, (nativeView) => {
            SelectableRichTextCommands[
              SELECTABLE_RICH_TEXT_COMMANDS.selectParagraphAt
            ](nativeView, x, y);
          });
        },
        clearSelection: () => {
          dispatchSelectableRichTextCommand(nativeRef, (nativeView) => {
            SelectableRichTextCommands[
              SELECTABLE_RICH_TEXT_COMMANDS.clearSelection
            ](nativeView);
          });
        },
        copyRange: (start: number, end: number) => {
          dispatchSelectableRichTextCommand(nativeRef, (nativeView) => {
            SelectableRichTextCommands[SELECTABLE_RICH_TEXT_COMMANDS.copyRange](
              nativeView,
              start,
              end
            );
          });
        },
      }),
      []
    );

    // SelectableRichText only allows a text subtree, to avoid a View becoming an unsplittable
    // attachment once it reaches the native layer.
    if (containsUnsupportedViewChild(children)) {
      throw new Error(
        'SelectableRichText does not support View children. Use nested Text, or render View outside SelectableRichText.'
      );
    }

    // Platforms without a registered native SelectableRichText fall back to RN Text's built-in selectable capability.
    if (!NativeSelectableRichText) {
      return (
        <Text selectable={selectable} style={style}>
          {children}
        </Text>
      );
    }

    // The TextAncestor context must be provided, so that child <Text> elements merge into the same
    // native text block as an RN text subtree.
    return (
      <NativeSelectableRichText
        ref={nativeRef}
        selectable={selectable}
        style={style}
        menuItems={menuItems}
        showSystemMenuItems={showSystemMenuItems}
        clearSelectionOnMenuAction={clearSelectionOnMenuAction}
        onMenuAction={onMenuAction}
        onTextLongPress={onTextLongPress}
      >
        <TextAncestor.Provider value={true}>{children}</TextAncestor.Provider>
      </NativeSelectableRichText>
    );
  }
);

export default SelectableRichText;
export type {
  SelectableRichTextLongPressEvent,
  SelectableRichTextMenuActionEvent,
  SelectableRichTextMenuItem,
  SelectableRichTextRef,
};
