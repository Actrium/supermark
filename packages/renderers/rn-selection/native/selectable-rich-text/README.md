# @boomsi/react-native-selectable-text

Selectable rich text for React Native New Architecture/Fabric apps.

This package is a breaking-change New Architecture-only implementation. It does not ship a Paper manager, Paper shadow view, or legacy native module command path.

## Requirements

- React Native `>=0.83.0`（iOS）/ `>=0.85.0`（Android）
- React `19.2.x`
- iOS `15.1+`
- Android `minSdkVersion >= 24`
- New Architecture/Fabric enabled

> **平台差异说明**：Android 端依赖 RN 0.85 才开放的 `ReactTextViewManager`（`open class`）和 `TextLayoutManager` 等 public API；RN 0.83 这些均为 `final`/`internal`，library 无法复用 Text 链路。iOS 端从 0.83 起即可用。

## Installation

```sh
yarn add @boomsi/react-native-selectable-text
```

For iOS, install pods after adding the package:

```sh
cd ios && pod install
```

## Usage

### 基础用法

```tsx
import React from 'react';
import {Text} from 'react-native';
import {
  SelectableRichText,
  type SelectableRichTextRef,
} from '@boomsi/react-native-selectable-text';

export function ArticleText() {
  // selectableRichTextRef 调用 Fabric commands 控制原生选区和剪贴板。
  const selectableRichTextRef = React.useRef<SelectableRichTextRef>(null);

  return (
    <SelectableRichText
      ref={selectableRichTextRef}
      menuItems={[{id: 'quote', title: 'Quote'}]}
      onMenuAction={event => {
        console.log(event.nativeEvent);
      }}>
      <Text style={{fontWeight: '700'}}>Selectable </Text>
      <Text style={{color: '#2f6fed'}}>rich text</Text>
    </SelectableRichText>
  );
}
```

### 宿主控制长按选取（推荐交互模式）

`selectable` 默认为 `false`，原生文本组件不会自行响应长按选词，避免与宿主长按手势冲突。宿主用 `Pressable` 包裹 `SelectableRichText` 监听 `onLongPress`，弹出 RN 自定义菜单后通过 ref 调用 `selectParagraphAt`，让原生按本地坐标命中段落并选中，再展示系统/自定义菜单：

```tsx
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  SelectableRichText,
  type SelectableRichTextMenuItem,
  type SelectableRichTextRef,
} from '@boomsi/react-native-selectable-text';

const MENU_ITEMS: SelectableRichTextMenuItem[] = [
  {id: 'quote', title: '引用'},
  {id: 'explain', title: '解释'},
];

export function ParagraphSelectionDemo() {
  const ref = React.useRef<SelectableRichTextRef>(null);
  const [menu, setMenu] = React.useState<{x: number; y: number} | null>(null);

  // Pressable 与 SelectableRichText 同尺寸同位置，
  // locationX/locationY 即 SelectableRichText 本地坐标，可直接传给 selectParagraphAt。
  const handleLongPress = (event: {
    nativeEvent: {locationX: number; locationY: number};
  }) => {
    setMenu({x: event.nativeEvent.locationX, y: event.nativeEvent.locationY});
  };

  const handleSelectParagraph = () => {
    if (!menu) {
      return;
    }
    // 原生按本地坐标命中长按所在段落，算出段落 range 并选中后弹系统菜单。
    ref.current?.selectParagraphAt(menu.x, menu.y);
    setMenu(null);
  };

  return (
    <View style={styles.container}>
      <Pressable onLongPress={handleLongPress}>
        <SelectableRichText
          ref={ref}
          menuItems={MENU_ITEMS}
          showSystemMenuItems={false}
          clearSelectionOnMenuAction={true}
          onMenuAction={event => {
            console.log(event.nativeEvent);
          }}>
          <Text>长按我试试，宿主会弹出 RN 菜单，再点「选取文本」进入原生选区。</Text>
        </SelectableRichText>
      </Pressable>
      {menu && (
        <View style={[styles.menu, {left: menu.x, top: menu.y + 10}]}>
          <Pressable style={styles.menuItem} onPress={handleSelectParagraph}>
            <Text>选取文本</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  menu: {position: 'absolute', backgroundColor: '#fff', borderRadius: 8, elevation: 4},
  menuItem: {paddingHorizontal: 14, paddingVertical: 11},
});
```

> 完整示例见 `example/src/MarkdownPage.tsx`，演示了多文本块、段落级选取、整块复制、菜单 dismiss 等场景。

## Props

- `selectable?: boolean` defaults to `false`. 设为 `true` 时原生文本组件直接响应长按选词；宿主自定义长按入口时保持默认 `false`，通过 ref 命令（`selectRange` / `selectParagraphAt`）触发选取，原生会临时开启选取能力并在 `clearSelection` 后收回。
- `menuItems?: Array<{ id: string; title: string }>` adds custom native selection menu items.
- `showSystemMenuItems?: boolean` defaults to `true`; set `false` to hide system items where the platform allows it.
- `clearSelectionOnMenuAction?: boolean` defaults to `false`.
- `style?: StyleProp<TextStyle>` supports RN Text/Paragraph styling through Fabric Paragraph state.
- `children` must be a text subtree: strings, numbers, nested `Text`, fragments, or components that render text.

`View` children are intentionally rejected in JS because native text selection treats embedded views as attachments, which cannot preserve character-range selection semantics.

## Events

`onMenuAction` fires when a custom menu item is tapped:

```ts
{
  id: string;
  title: string;
  selectedText: string;
  selectionStart: number;
  selectionEnd: number;
}
```

## Ref Commands

- `selectRange(start, end)` selects a UTF-16 range and opens the native selection menu.
- `selectParagraphAt(x, y)` 根据本地坐标（相对 `SelectableRichText` 左上角）命中长按所在段落，原生算出段落 range 并选中后弹系统菜单。用于宿主控制长按入口的场景。
- `clearSelection()` clears the native selection.
- `copyRange(start, end)` copies a UTF-16 range to the system clipboard.

## Host-driven paragraph selection

`selectable` 默认 `false`，原生文本组件不响应长按选词，宿主用 `Pressable` 等容器接管长按手势。长按命中坐标通过 `selectParagraphAt(x, y)` 传给原生，原生按本地坐标命中段落、算出段落 range 并选中后弹系统菜单；宿主也可直接用 `selectRange` / `copyRange` / `clearSelection` 控制选区。

`selectParagraphAt` 命中空文本、空行或空白区域不会选中任何内容；具体段落命中规则由原生 `UITextView` / `TextView` 的文本布局决定。`clearSelection` 会同时收回 `selectRange` / `selectParagraphAt` 临时开启的选取能力，恢复到 `selectable=false` 状态。

## Development

```sh
yarn typecheck
yarn lint
yarn prepare
yarn example build:android
cd example/ios && pod install
yarn example build:ios
```

The example app is configured for New Architecture/Fabric.

## License

MIT
