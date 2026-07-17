# 只支持 React Native 新架构迁移执行进度

目标：把当前 `SelectableText` 从 Paper 旧架构组件迁移为只支持 New Architecture/Fabric 的组件，不保留 Paper 运行路径。迁移后必须保留：嵌套 `Text` 富文本、原生文本选区、自定义菜单、段落长按菜单、命令式选区/清空/复制、iOS/Android 行为一致性、非 iOS/Android 的 RN `Text` fallback。

状态说明：

- `[x]` 已执行并落到代码或文档。
- `[ ]` 尚未完成，或者需要依赖安装、原生构建、手动运行 example 后才能确认。

## 0. 当前项目结构结论

- [x] JS 入口已收敛到 `src/SelectableText.tsx`，公开 React wrapper 不直接使用 `NativeModules`、`UIManager.dispatchViewManagerCommand`、`findNodeHandle`。
- [x] JS 为嵌套 `Text` 继续集中使用 RN 内部 `TextAncestor` context，保证文本子树合并。
- [x] iOS 已从 Paper manager/shadow view 入口迁移到 Fabric `RCTSelectableTextComponentView`。
- [x] iOS 原有 UIKit 文本交互能力仍保留在 `RCTSelectableTextView`。
- [x] Android 保留 `SelectableTextView` 原生交互逻辑，事件改为 Fabric `EventDispatcher`。
- [x] Android manager 继续继承 `ReactTextViewManager` 以复用 RN Text 的 `Spannable`、测量、state 和 Text props。
- [x] C++ renderer component 已放到 `common/cpp/react/renderer/components/selectabletext`。
- [x] 根项目 RN 基线是 `0.85.0`，example 的 `package.json` 已改为同一基线。
- [x] 本地依赖已对齐：`example/node_modules/react-native` 已切到 `0.85.0`，`corepack yarn install` 已成功执行。

## 1. 项目代码结构

- [x] 更新 `peerDependencies.react-native` 为 `>=0.85.0`。
- [x] 更新 package 描述为只支持 New Architecture 的 selectable rich text component。
- [x] README 标注 breaking change：只支持 New Architecture/Fabric。
- [x] `example/package.json` 改到 RN `0.85.0` / React `19.2.3` / `@react-native/*` `0.85.0`。
- [x] 执行 `corepack yarn install` 更新 `yarn.lock` 和 `example/node_modules`。
- [x] 保留 `src/SelectableText.tsx` 作为公开 React wrapper。
- [x] 新增 `src/NativeSelectableTextNativeComponent.ts` 作为 Fabric native component spec。
- [x] 新增 `src/types.ts`，把 props、events、ref API 拆成稳定导出类型。
- [x] 新增 `src/react-native-internals.d.ts`，集中声明 RN 内部 `TextAncestor` 和 CodegenTypes 类型入口。
- [x] 保留非 iOS/Android 平台 RN `Text` fallback。
- [x] 删除 iOS Paper-only 文件：`RCTSelectableTextViewManager.*`、`RCTSelectableTextShadowView.*`。
- [x] 新增 iOS Fabric 文件：`RCTSelectableTextComponentView.h/mm`。
- [x] 新增 Android Fabric event 文件：`MenuActionEvent.kt`、`TextLongPressEvent.kt`。
- [x] 更新 `react-native.config.js`，声明 Android `libraryName`、`componentDescriptors`、手写 C++ `cmakeListsPath`。
- [x] 更新 `react-native-selectable-text.podspec`，纳入 iOS Fabric 文件和 `common/cpp`。
- [x] 更新 `package.json.files`，包含 `common`、`ios`、`android`、`src`。
- [x] 新增 `codegenConfig`，并设置 `includesGeneratedCode: true`，避免 RN Codegen 生成普通 View C++ 与手写 Paragraph renderer component 冲突。

## 2. JS / Fabric Spec

- [x] native component 名称继续保持 `"SelectableText"`。
- [x] `selectable?: boolean`，JS 默认值仍为 `true`。
- [x] `menuItems?: Array<{ id: string; title: string }>`。
- [x] `showSystemMenuItems?: boolean`，JS 默认值仍为 `true`。
- [x] `clearSelectionOnMenuAction?: boolean`，JS 默认值仍为 `false`。
- [x] `selectionMode?: 'default' | 'menuThenParagraph'`，JS 默认值仍为 `'default'`。
- [x] `onMenuAction` 事件覆盖 `id`、`title`、`selectedText`、`selectionStart`、`selectionEnd`。
- [x] `onTextLongPress` 事件覆盖 `paragraphText`、`selectionStart`、`selectionEnd`、`locationX`、`locationY`、`pageX`、`pageY`。
- [x] commands 覆盖 `selectRange(start, end)`、`clearSelection()`、`copyRange(start, end)`。
- [x] JS wrapper 改用 `codegenNativeCommands`，不再走旧架构命令路径。
- [x] JS wrapper 继续检查 children 中是否包含 `View`，避免非文本子树作为不可拆分 attachment 进入选区。
- [x] JS wrapper 继续提供 `TextAncestor.Provider`，保证嵌套 `Text` 合并到同一个原生文本块。
- [x] 运行时 Codegen helper 改用 RN 0.85 顶层导入，发布类型构建不再缺少 helper 声明。

## 3. C++ Renderer Component

- [x] 新增 `SelectableTextProps`，继承 RN `ParagraphProps`。
- [x] `SelectableTextProps` 解析 `menuItems`、`showSystemMenuItems`、`clearSelectionOnMenuAction`、`selectionMode`。
- [x] `selectable` 继续由继承的 `ParagraphProps` / RN Text props 处理。
- [x] 新增 `SelectableTextEventEmitter`，继承 `ParagraphEventEmitter`，保留 `onTextLayout` 能力。
- [x] `SelectableTextEventEmitter` 新增 `onMenuAction`。
- [x] `SelectableTextEventEmitter` 新增 `onTextLongPress`。
- [x] 新增 `SelectableTextShadowNode`，按 RN `ParagraphShadowNode` 模式手写，替换为自定义 Props/EventEmitter。
- [x] 嵌套 `Text` / `RawText` 聚合继续走 `BaseTextShadowNode::buildAttributedString`。
- [x] 测量、baseline、font scaling、lineHeight、富文本样式继承继续走 RN `TextLayoutManager`。
- [x] Android 上继续 unset `FormsStackingContext`，保持 RN Paragraph 的文本挂载约束。
- [x] 新增 `SelectableTextComponentDescriptor`，继承 `BaseParagraphComponentDescriptor` 注入 `TextLayoutManager`。
- [x] iOS ComponentView 注册 supplemental descriptors：`RawTextComponentDescriptor` 和 `TextComponentDescriptor`。
- [x] 未直接继承 RN `ParagraphShadowNode`；当前实现复制 RN Paragraph 的最小模式，因为需要替换 props/event emitter 并避免普通 View descriptor。
- [x] `toString(selectionMode)` 加默认返回，避免 C++ 编译器认为函数缺少返回值。

## 4. iOS 新架构实现

- [x] 新增 `RCTSelectableTextComponentView`。
- [x] `componentDescriptorProvider` 注册 `SelectableTextComponentDescriptor`。
- [x] `supplementalComponentDescriptorProviders` 注册 `RawTextComponentDescriptor`、`TextComponentDescriptor`。
- [x] `updateProps` 同步 `selectable`、`menuItems`、`showSystemMenuItems`、`clearSelectionOnMenuAction`、`selectionMode`。
- [x] `updateState` 读取 Paragraph state 的 `attributedString`，转换为 `NSTextStorage` 后设置到 `RCTSelectableTextView`。
- [x] `updateLayoutMetrics` / `layoutSubviews` 同步 `_selectableTextView.frame = self.bounds`。
- [x] `prepareForRecycle` 清空文本、菜单、选区和默认交互状态。
- [x] iOS `handleCommand` 支持 `selectRange`。
- [x] iOS `handleCommand` 支持 `clearSelection`。
- [x] iOS `handleCommand` 支持 `copyRange`。
- [x] `onMenuAction` 从 `RCTSelectableTextView` 回调到 C++ event emitter。
- [x] `onTextLongPress` 从 `RCTSelectableTextView` 回调到 C++ event emitter。
- [x] `RCTSelectableTextView` 保留只读、可选、透明背景、无 inset、无 line fragment padding、禁用键盘输入。
- [x] `RCTSelectableTextView` 保留不同实例切换时清理上一个选区。
- [x] `RCTSelectableTextView` 保留 `menuThenParagraph` 长按段落事件。
- [x] `RCTSelectableTextView` 保留 `selectRange`、`copyRange`、`clearSelection`。
- [x] `RCTSelectableTextView` 保留 iOS 16+ `UIEditMenuInteraction` 菜单逻辑。
- [x] `RCTSelectableTextView` 保留 iOS 15.1 `UIMenuController` fallback。
- [x] `RCTSelectableTextView` 保留 `showSystemMenuItems` 和 `clearSelectionOnMenuAction`。
- [x] `RCTSelectableTextView` 保留 accessibility label 默认回落到文本内容。
- [x] 执行 `cd example/ios && pod install`，确认 podspec、Codegen 产物和工程引用。
  - 修复 codegen 错误 1：`locationX/locationY/pageX/pageY` 在事件 spec 中不能用 `number`，改为 `Double`。
  - 修复 codegen 错误 2：commands 第一参数必须为 `React.ElementRef<HostComponent<...>>`，不能用 `HostInstance`。
  - 修复 example typecheck 错误：`StyleSheet.absoluteFillObject` 在 RN 0.85 已移除，改用 `StyleSheet.absoluteFill`。
- [x] 执行 iOS example 新架构构建。
  - 修复编译错误：`RCTSelectableTextReadRangeCommandArgs` 第二参数需 `const NSArray *` 以匹配 `handleCommand:args:` 的 const 入参。
  - 结果：`xcodebuild ... -sdk iphonesimulator` **BUILD SUCCEEDED**。

## 5. Android 新架构实现

- [x] `SelectableTextViewManager` 继续继承 `ReactTextViewManager`，复用 RN Text props、Spannable、state、measure。
- [x] 未采用生成的普通 View manager delegate；原因是本库必须手写 Paragraph renderer component，否则会丢 RN Text 聚合和测量能力。
- [x] 删除旧 `getCommandsMap()`。
- [x] 删除旧 `receiveCommand(Int, ...)` 数字命令分支。
- [x] 保留 `receiveCommand(String, ...)` 作为 Fabric `dispatchCommand` 的落点，不再导出旧 Paper command map。
- [x] `receiveCommand` 支持 `selectRange`。
- [x] `receiveCommand` 支持 `clearSelection`。
- [x] `receiveCommand` 支持 `copyRange`。
- [x] `SelectableTextView` 保留 `ActionMode.Callback2` 菜单处理。
- [x] `SelectableTextView` 保留 `menuItems` 解析后的菜单刷新。
- [x] `SelectableTextView` 保留 `showSystemMenuItems=false` 时清空系统菜单。
- [x] `SelectableTextView` 保留自定义菜单点击 `onMenuAction`，并按 `clearSelectionOnMenuAction` 清理选区。
- [x] `SelectableTextView` 保留 `selectionMode='menuThenParagraph'` 段落长按事件。
- [x] `SelectableTextView` 保留段落命中规则：空文本、未命中文字、空行不发送事件。
- [x] `SelectableTextView` 保留 `locationX/locationY/pageX/pageY` DIP 转换。
- [x] `SelectableTextView` 保留 `selectRange` 通过 `ACTION_SET_SELECTION` 进入系统选区和手柄。
- [x] `SelectableTextView` 保留 `copyRange` 写入 Android 剪贴板。
- [x] `SelectableTextView` 保留点击其他地方清空选区，滚动不误清空选区。
- [x] `SelectableTextView` 保留父 `ScrollView` 手势拦截控制，避免拖动手柄被截断。
- [x] `SelectableTextView` 保留不同实例切换时清理旧选区。
- [x] Android 事件改为 `UIManagerHelper.getEventDispatcherForReactTag(...)`。
- [x] 新增 `MenuActionEvent`，事件名 `topMenuAction`。
- [x] 新增 `TextLongPressEvent`，事件名 `topTextLongPress`。
- [x] 删除 `RCTEventEmitter.receiveEvent` 旧事件通道。
- [x] `SelectableTextPackage` 不再提供 NativeModule，只注册 ViewManager。
- [x] `example/android/gradle.properties` 改为 `newArchEnabled=true`。
- [x] 执行依赖安装后重新生成 Android autolinking 文件，确认 `cmakeListsPath` 指向 `common/cpp/CMakeLists.txt`。
- [x] 执行 Android example 新架构完整构建。
  - 修复 1：`example/android/build/generated/autolinking/autolinking.json` 是 RN 0.79.2 时代缓存，删除后强制重新生成。
  - 修复 2：手写 `common/cpp/RNSelectableTextSpec.h`，提供 `RNSelectableTextSpec_ModuleProvider` 返回 nullptr 的 inline 实现，满足 `interfaceOnly: true` + `includesGeneratedCode: true` 下 autolinking.cpp 的 `#include <RNSelectableTextSpec.h>`。
  - 修复 3：RN 0.85 prefab 把所有 C++ 合并到 `ReactAndroid::reactnative` 单 target，旧的 `react_render_text` / `react_render_core` / `react_utils` 等独立 target 已不存在，更新 `CMakeLists.txt` 链接 `ReactAndroid::reactnative`。
  - 修复 4：`target_link_libraries` 用 plain 签名（不带 PUBLIC/PRIVATE），和 `ReactNative-application.cmake` 保持一致，避免 keyword/plain 冲突。
  - 修复 5：RN 0.85 prefab `reactnative` module 的 `export_libraries` 为空，需要单独链接 `ReactAndroid::jsi` 和 `fbjni::fbjni`。
  - 修复 6：`ParagraphProps.h` 内部 include 的 `HostPlatformParagraphProps.h` 位于 `react/renderer/components/text/platform/android/` 子目录，prefab 没把它加进 `INTERFACE_INCLUDE_DIRECTORIES`，用 `get_target_property` 从 `ReactAndroid::reactnative` 推导 prefab include 根路径，并拼接 `react/renderer/components/text/platform/android` 作为 `PUBLIC` include 路径（必须 PUBLIC，因为 appmodules target 通过 autolinking.cpp 间接 include 这条链路）。
  - 结果：`yarn example build:android` **BUILD SUCCESSFUL**。

## 6. Example 和文档

- [x] `example/android/gradle.properties` 改为默认新架构。
- [x] `example/ios/Podfile` 移除显式 `:new_arch_enabled => false`。
- [x] README 替换 create-react-native-library 模板内容。
- [x] README 说明只支持 New Architecture。
- [x] README 说明最低 RN、iOS、Android 要求。
- [x] README 文档化 props、events、ref commands。
- [x] README 文档化 `selectionMode='menuThenParagraph'` 交互流程。
- [x] README 文档化 children 限制：只支持文本子树，不支持 `View` children。
- [x] example README 改为新架构示例说明。
- [x] 依赖安装后更新 `yarn.lock`，让 example 依赖记录从 RN `0.79.2` 切到 RN `0.85.0`。

## 7. 必须保留的功能验收矩阵

代码实现侧已覆盖，iOS / Android example 新架构构建均已通过（见第 4、5 节）。
下面 27 项需要在模拟器/真机上手动操作验证选区、菜单、手势等交互行为，无法自动化。
启动方式：`cd example && yarn ios`（iOS 模拟器）或 `yarn android`（Android 模拟器/真机）。

- [ ] 基础渲染：普通字符串 children 正常显示。
- [ ] 基础渲染：多个嵌套 `Text` 正常合并为一个可选文本块。
- [ ] 基础渲染：粗体、斜体、粗斜体、颜色、字号、行高、换行样式正常。
- [ ] 基础渲染：`View` children 继续在 JS 层抛错。
- [ ] 默认选择模式：`selectionMode='default'` 下长按直接进入系统文本选区。
- [ ] 默认选择模式：`selectable=false` 下不能进入选区。
- [ ] 默认选择模式：系统复制、全选等菜单项按平台默认行为出现。
- [ ] 自定义系统菜单：`menuItems` 正常显示。
- [ ] 自定义系统菜单：`showSystemMenuItems=false` 时只显示自定义菜单。
- [ ] 自定义系统菜单：点击自定义菜单触发 `onMenuAction`。
- [ ] 自定义系统菜单：`onMenuAction` 回传最终选区、选中文本、菜单 id/title。
- [ ] 自定义系统菜单：`clearSelectionOnMenuAction=true` 后菜单点击会清空选区。
- [ ] `menuThenParagraph`：长按命中段落时只触发 `onTextLongPress`，不直接进入系统选区。
- [ ] `menuThenParagraph`：长按空白区域、空行、空文本不触发菜单事件。
- [ ] `menuThenParagraph`：`onTextLongPress` 回传段落文本、段落 start/end、local 坐标、page 坐标。
- [ ] `menuThenParagraph`：JS 调用 `selectRange` 后原生选中对应段落并展示系统/自定义菜单。
- [ ] `menuThenParagraph`：JS 调用 `copyRange` 后写入系统剪贴板。
- [ ] `menuThenParagraph`：JS 调用 `clearSelection` 后选区消失，并恢复下一次长按先出 RN 菜单的状态。
- [ ] 多实例行为：一个 `SelectableText` 有选区时，点击另一个会清理上一个选区。
- [ ] 多实例行为：当前实例内拖动选区手柄不会被 active view 清理逻辑打断。
- [ ] ScrollView 手势：Android 中有选区时拖动手柄不被父 ScrollView 截断。
- [ ] ScrollView 手势：Android 中滚动页面不误触发选区清空。
- [ ] ScrollView 手势：iOS 中 ScrollView 内长按、拖动手柄、点击其他区域行为正常。
- [ ] 平台菜单兼容：iOS 16+ 使用 `UIEditMenuInteraction` 正常。
- [ ] 平台菜单兼容：iOS 15.1 使用 `UIMenuController` fallback 正常。
- [ ] 平台菜单兼容：Android floating ActionMode 菜单定位在选区首行附近。
- [ ] Accessibility：iOS accessibility label 默认回落到文本内容。
- [ ] Accessibility：Android `ReactTextView` accessibility link/span 行为不被破坏。
- [ ] 非移动平台：Web/其他平台继续 fallback 到 RN `Text selectable`。

## 8. 已执行验证

- [x] `corepack yarn typecheck`
- [x] `corepack yarn lint`
  - 当前结果：0 error，2 warning。
  - warning 1：`src/SelectableText.tsx` 使用 RN 内部 `TextAncestor` deep import，这是为了文本子树合并。
  - warning 2：`example/src/MarkdownPage.tsx` 有一个既有 inline style。
- [x] `corepack yarn prepare`
- [x] Android library Kotlin 编译：`./gradlew :boomsi_react-native-selectable-text:compileDebugKotlin --no-daemon --console=plain`
- [x] `corepack yarn install`
- [x] `yarn example build:android`（**BUILD SUCCESSFUL**，详见第 5 节修复记录）
- [x] `cd example/ios && pod install`
- [x] `yarn example build:ios`（用 `xcodebuild` 直接构建通过；`yarn example build:ios` 输出污染严重但底层 xcodebuild 已成功）
- [ ] 手动跑 example，逐项验证第 7 节功能矩阵。

## 9. 下一步执行顺序

1. [x] 权限恢复后执行 `corepack yarn install`，更新 `yarn.lock` 和 `example/node_modules`。
2. [x] 确认 `example/node_modules/react-native/package.json` 是 `0.85.0`。
3. [x] 重新生成 Android autolinking 文件，确认 `common/cpp/CMakeLists.txt` 被引用。
4. [x] 跑 Android 新架构完整构建并按 C++/CMake 错误继续修。
5. [x] 跑 `cd example/ios && pod install`。
6. [x] 跑 iOS 新架构构建并按 ObjC++/C++ 错误继续修。
7. [ ] 跑 example 手动验收第 7 节功能矩阵。

## 10. 风险评估结论（2026-06-29）

- [x] 风险 1（Android Fabric 自定义 props 通道）：经核查 `ViewManager.updateProperties` 默认走 `GenericViewManagerDelegate` → `FallbackViewManagerSetter` 反射所有 `@ReactProp`（含父类），自定义 props 能到达；`receiveCommand(String, ...)` 由 `SelectableTextViewManager` override 直接执行，绕过空实现的 `GenericViewManagerDelegate.receiveCommand`。**无需修复**。
- [x] 风险 3（iOS `RCTConversions.h` / `_layoutMetrics`）：与 RN 官方 `RCTParagraphComponentView.mm` 写法完全一致。**无需修复**。
- [x] 风险 4（iOS attachment 子视图挂载）：Fabric 下 attachment 通过 `RCTNSAttributedStringFromAttributedString` 转 `NSTextAttachment` 渲染占位，真实子 view 通过继承的 `mountChildComponentView` 加到 `self`（与官方 Paragraph 一致）。**无需修复**。
- [x] 风险 5（iOS Paper 死代码清理）：已删除 `RCTSelectableTextView` 的 `reactSetFrame:`、`didUpdateReactSubviews`、`_descendantViews` ivar，简化 `setTextStorage:contentFrame:descendantViews:` 为 `setTextStorage:`；同步更新 `RCTSelectableTextComponentView.mm` 调用方；移除未使用的 `RCTConversions.h` import。

## 11. 组件改名 SelectableText → SelectableRichText（2026-07-01）

### 根因

RN 0.85 在两处硬编码了 `SelectableText → SelectableParagraph` 的名字转换，作为其未来 `SelectableParagraph` 组件的预留别名，与本库的 `SelectableText` 直接冲突：

- C++ Fabric：`ReactCommon/react/renderer/componentregistry/componentNameByReactViewName.cpp` —— `if (viewName == "SelectableText") return "SelectableParagraph";`
- Android Fabric：`ReactAndroid/src/main/java/com/facebook/react/fabric/mounting/mountitems/FabricNameComponentMapping.kt` —— `"SelectableParagraph" to "RCTSelectableText"`

### 表现

- iOS：Fabric 查找 `SelectableParagraph` 的 ComponentView，但 codegen 生成的 `thirdPartyFabricComponents` 字典 key 是 `SelectableText` → 找不到 → 走 `RCTUnimplementedViewComponentView` 占位 → 文本不渲染（启动 example 只看到外层蓝色方块，无 `[SelectableText]` 日志）。
- Android：Fabric 查找 `RCTSelectableText` ViewManager，命中 RN 自带的 `SelectableTextViewManager`（`REACT_CLASS="RCTSelectableText"`），但 C++ `SelectableTextComponentDescriptor` 是本库手写的，解析含 `menuItems` 的 `SelectableTextProps` 与 RN 自带 manager 的 props 解析路径冲突，启动时构造 Props 触发 native crash：
  ```
  signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x7fc0000000000000
  F2NAME: libappmodules.so (facebook::react::SelectableTextMenuItem::SelectableTextMenuItem(facebook::react::SelectableTextMenuItem const&)+32)
  F1NAME: libc++_shared.so (std::__ndk1::basic_string::basic_string(string const&)+4)
  ```

### 修复

全链路改名为 `SelectableRichText`，避开 RN 0.85 的 `SelectableParagraph` 预留：

- JS：`codegenNativeComponent('SelectableRichText')`，公开 `SelectableRichText`，类型 `SelectableRichTextProps/Ref/MenuItem/...`。
- C++ renderer：目录 `common/cpp/react/renderer/components/selectablerichtext/`，`SelectableRichTextComponentName = "SelectableRichText"`，类名 `SelectableRichTextProps/ShadowNode/EventEmitter/ComponentDescriptor`。
- iOS：文件 `RCTSelectableRichTextComponentView.h/mm`、`RCTSelectableRichTextView.h/mm`，Cls 函数 `RCTSelectableRichTextCls`，codegenConfig.ios.componentProvider key `SelectableRichText`。
- Android：`REACT_CLASS = "RCTSelectableRichText"`（ViewManagerRegistry 先查 `SelectableRichText` 未中，再查 `RCTSelectableRichText` 命中），Kotlin 类名 `SelectableRichTextView/Manager/Package`，event 类 `SelectableRichTextMenuActionEvent/LongPressEvent`。
- `react-native.config.js`：`componentDescriptors: ['SelectableRichTextComponentDescriptor']`。
- example 和 README 同步更新。

### 验证状态

- [x] `cd example/ios && pod install` 重新生成 codegen（key 为 `SelectableRichText`）。
- [x] `yarn example build:ios` 编译通过。
- [x] `yarn example build:android` 编译通过。
- [x] iOS example 启动后蓝色方块内正常渲染"这是 Text / 这是 Text 内的 Text"。
- [x] Android example 启动不再 native crash，进程存活，JS 跑起来。
- [ ] 手动验收第 7 节功能矩阵。

## 12. Android menuItems 虚继承布局 ABI 问题（2026-07-01）

### 根因

改名 `SelectableRichText` 后，Android 启动时仍 native crash，崩溃栈：

```
signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x7fc000007fc00008
facebook::react::SelectableRichTextProps::SelectableRichTextProps(...)+160
facebook::react::RawPropsParser::prepare<SelectableRichTextProps>()
```

崩溃在 `RawPropsParser::prepare` 阶段（ComponentDescriptor 构造时预解析 Props），`SelectableRichTextProps` 构造函数里 `menuItems` 成员初始化时。

**根本原因**：`SelectableRichTextProps` 继承 `ParagraphProps`（即 `HostPlatformParagraphProps`），后者通过虚继承继承 `ViewProps` + `BaseTextProps`（钻石继承，`Props` 是虚基类）。在 Android NDK clang 下，基类 `ParagraphProps` 构造时写越界到派生类 `SelectableRichTextProps::menuItems` 成员的内存偏移，损坏 `std::vector` 内部堆指针，导致后续 vector 拷贝时 SIGSEGV（`fault addr 0x7fc0...` 是 folly null 标记被当成指针）。

**验证证据**：
- 移除 `menuItems` 成员 → 不崩
- 加 `std::string` 成员 → 不崩（SSO 不依赖堆指针）
- 加 `std::vector` 成员 → 崩
- 加 `std::shared_ptr<vector>` 成员 → 崩（shared_ptr 也是堆指针）
- 构造函数不拷贝 `sourceProps.menuItems`（用默认空 vector）→ 仍崩（说明 vector 成员本身存在就被损坏，不是拷贝问题）

iOS clang 不受影响，只有 Android NDK clang 触发。这是 RN 0.85 prefab 虚继承布局和 NDK clang 的 ABI 兼容问题，非本库代码 bug。

### 修复

把 `menuItems` 从 `std::vector<SelectableRichTextMenuItem>` 改成 `std::string menuItemsJson`（JSON 字符串存储）：

- C++ Props：`menuItemsJson` 是 `std::string`，SSO 不依赖堆指针，不受虚继承布局损坏影响。
- 构造函数和 `setProp` 解析 `menuItems` RawValue，序列化成 JSON 字符串存入 `menuItemsJson`。
- iOS `RCTSelectableRichTextComponentView`：`RCTMenuItemsFromJson` 用 `NSJSONSerialization` 解析 JSON 还原菜单项。
- Android：不走 C++ Props 的 `menuItemsJson`，直接通过 ViewManager `@ReactProp(name = "menuItems")` 反射接收 `ReadableArray`（Android 已有此路径）。
- `getDiffProps` 把 `menuItemsJson` 作为 diff 字段传给平台层。

### 验证状态

- [x] `yarn example build:android` 编译通过。
- [x] Android example 启动不再 native crash，进程存活，`Running "SelectableExample"` log 出现。
- [x] `yarn example build:ios` 编译通过。
- [ ] 手动验收 Android/iOS 自定义菜单点击、选区、长按等交互行为。
- [ ] 后续若 RN 修复虚继承布局 ABI 问题，可考虑改回 `std::vector` 直接存储。

## 13. 移除 selectionMode/onTextLongPress，改为宿主驱动段落选取（2026-07-03）

### 根因

第 11、12 节完成改名和 ABI 修复后，`selectionMode='menuThenParagraph'` + `onTextLongPress` 这条原生驱动的长按段落选取路径存在两个问题：

1. **手势冲突**：`selectable=false` 时原生不响应长按，`selectionMode='menuThenParagraph'` 又要求原生接管第一次长按，两条路径在原生层互相打架；`selectable=true` 时又会与宿主 Pressable 长按冲突。
2. **段落命中不可控**：原生算段落 range 后只能通过 `onTextLongPress` 回传给 JS，JS 拿不到也无法干预命中规则，宿主想自定义长按入口（如 Pressable 包裹 + RN 菜单）时无法接入。

### 修复

把"原生驱动长按 → 段落事件 → JS 菜单"翻转为"宿主驱动长按 → JS 菜单 → 原生按坐标命中段落"：

- **移除 `selectionMode` prop**：`SelectableRichTextProps`、`NativeSelectableRichTextProps`、C++ `SelectableRichTextProps` 全部删除该字段，不再有 `'default' | 'menuThenParagraph'` 两种模式。
- **移除 `onTextLongPress` 事件**：JS spec、C++ `SelectableRichTextEventEmitter`、iOS `RCTSelectableRichTextView`、Android `SelectableRichTextView` 全部删除该事件及其派发路径；Android `SelectableRichTextLongPressEvent.kt` 文件删除。
- **移除 `topTextLongPress` 事件名**：iOS/Android 事件注册不再包含该事件。
- **新增 `selectParagraphAt(x, y)` ref command**：宿主用 `Pressable` 包裹 `SelectableRichText` 监听 `onLongPress`，把 `locationX/locationY` 作为本地坐标传给 `selectParagraphAt`，原生按坐标命中段落、算出 range 并选中后弹系统菜单。
- **`selectable` 默认值改为 `false`**：避免 `UITextView`/`TextView` 自带长按选词与宿主长按手势冲突；`selectRange`/`selectParagraphAt` 命令触发时原生临时开启选取能力，`clearSelection` 后收回。
- **iOS**：`RCTSelectableRichTextView` 新增 `selectParagraphAtPoint:` + `paragraphRangeAtPoint:`，用 `NSLayoutManager characterIndexForPoint:inTextContainer:` 把本地坐标映射到字符 index，再向前/向后找换行符切出段落 range，调用 `selectTextRangeWithStart:end:` 选中并弹菜单。
- **Android**：`SelectableRichTextView` 新增 `selectParagraphAt(x, y)` + `paragraphRangeAtPoint`，用 `Layout.getLineForVertical` + `Layout.getOffsetForHorizontal` 把本地坐标映射到字符 index，再向前/向后找 `\n` 切出段落 range，复用 `selectRange` 通过 `ACTION_SET_SELECTION` 选中。
- **example**：`MarkdownPage.tsx` 改为 Pressable 包裹 + RN 菜单 + `selectParagraphAt` 模式，演示多文本块、段落级选取、整块复制、菜单 dismiss。

### 验证状态

- [x] `corepack yarn typecheck` 通过。
- [x] `corepack yarn lint` 通过。
- [x] iOS/Android 原生层 `selectionMode` / `onTextLongPress` / `topTextLongPress` 残留已清理（grep 无结果）。
- [ ] 手动验收宿主长按 → RN 菜单 → `selectParagraphAt` → 系统菜单 → 自定义菜单点击 → `clearSelection` 全链路交互。


