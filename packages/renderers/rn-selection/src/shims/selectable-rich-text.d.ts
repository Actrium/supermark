/**
 * Type shim for the vendored React Native selectable-text primitive.
 *
 * The real package (`@boomsi/react-native-selectable-text`) ships source-only
 * and its component entry (`src/SelectableRichText.tsx`) imports `react-native`
 * value modules plus RN-internal ambient modules
 * (`react-native/Libraries/Text/TextAncestor`) and is authored against a
 * different `@types/react` than this workspace. Pulling that `.tsx` into the
 * library typecheck surfaces its own cross-version errors, so — exactly like
 * `@actrium/graphviz-anywhere-rn` — we describe only the surface the coordinator
 * consumes and wire it through `tsconfig.base.json` `paths`. At runtime the
 * Metro/Bun resolver ignores `paths` and loads the real workspace package.
 */

import type React from 'react';
import type {
  SelectableRichTextLongPressEvent,
  SelectableRichTextMenuActionEvent,
  SelectableRichTextMenuItem,
  SelectableRichTextProps,
  SelectableRichTextRef,
} from '../../native/selectable-rich-text/src/types';

export type {
  SelectableRichTextLongPressEvent,
  SelectableRichTextMenuActionEvent,
  SelectableRichTextMenuItem,
  SelectableRichTextProps,
  SelectableRichTextRef,
};

export const SelectableRichText: React.ForwardRefExoticComponent<
  SelectableRichTextProps & React.RefAttributes<SelectableRichTextRef>
>;
