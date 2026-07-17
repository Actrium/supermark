#import "RCTSelectableRichTextView.h"

#import <React/RCTTextAttributes.h>
#import <React/UIView+React.h>

// 记录当前交互中的 SelectableText，用于切换文本块时清理上一个 UITextView 保留的 selectedRange。
static __weak RCTSelectableRichTextView *RCTActiveSelectableRichTextView = nil;

@interface RCTSelectableRichTextView () <UITextViewDelegate, UIEditMenuInteractionDelegate, UIGestureRecognizerDelegate>

@end

@implementation RCTSelectableRichTextView {
  BOOL _rnSelectable;
  // _commandSelectionActive 表示当前选区由 selectRange/selectParagraphAt 命令打开，
  // 用于 textViewDidChangeSelection 判断"选区折叠成空"是否需要收回 editable。
  BOOL _commandSelectionActive;
  // _isSettingCommandSelection 保护 selectTextRangeWithStart 的同步设置过程，
  // 避免 becomeFirstResponder 触发的空选区回调误清刚要设置的命令选区。
  BOOL _isSettingCommandSelection;
  UIEditMenuInteraction *_selectionEditMenuInteraction API_AVAILABLE(ios(16.0));
  // _dismissTapGesture 选区激活时挂到 window 上，tap SelectableRichText 外部时清选区，
  // 等 example menuDismissLayer 的原生实现。cancelsTouchesInView=NO 不影响其他 touch。
  UITapGestureRecognizer *_dismissTapGesture;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    // 只读配置：editable 默认 NO，避免点击文本出现光标/输入框焦点。
    // selectRange/selectParagraphAt 命令期间临时开启 editable=YES，让程序化选区的手柄可拖
    //（iOS 机制：editable=NO 的 UITextView 程序化选区手柄是只读展示态，不响应拖动），
    // clearTextSelection 时恢复 editable=NO。选区有长度时不显示光标，只有手柄。
    self.editable = NO;
    // 默认 selectable=NO，避免 UITextView 自带长按选词与宿主 Pressable 长按手势冲突。
    // 宿主通过 ref.selectParagraphAt / selectRange 命令触发选取时，原生临时开启 selectable。
    [super setSelectable:NO];
    self.scrollEnabled = NO;
    self.delegate = self;
    self.dataDetectorTypes = UIDataDetectorTypeNone;

    // 布局一致性：消除 UITextView 默认的内边距
    self.textContainerInset = UIEdgeInsetsZero;
    self.textContainer.lineFragmentPadding = 0;

    // 透明背景，避免 UITextView 默认白色背景覆盖气泡底色
    self.backgroundColor = [UIColor clearColor];
    self.opaque = NO;

    // 禁用键盘输入相关特性
    self.inputView = [[UIView alloc] initWithFrame:CGRectZero];

    // accessibility
    self.isAccessibilityElement = YES;
    self.accessibilityTraits |= UIAccessibilityTraitStaticText;

    // 原生长按手势：命中段落并把 range/锚点回传 JS，由宿主决定后续选取动作。
    // cancelsTouchesInView=NO 保证不拦截 UITextView 的触摸，选区命令建立后手柄拖动 touch 正常到达。
    UILongPressGestureRecognizer *paragraphLongPressGesture =
        [[UILongPressGestureRecognizer alloc] initWithTarget:self
                                                     action:@selector(handleParagraphLongPress:)];
    paragraphLongPressGesture.cancelsTouchesInView = NO;
    [self addGestureRecognizer:paragraphLongPressGesture];

    _rnSelectable = NO;
    // 默认保留系统复制/全选等菜单项，调用方可通过 showSystemMenuItems 关闭。
    _showSystemMenuItems = YES;
    // 默认菜单点击后保留选区，调用方可通过 clearSelectionOnMenuAction 开启自动清空。
    _clearSelectionOnMenuAction = NO;
  }
  return self;
}

#pragma mark - Selection State

// 当前 SelectableText 开始交互时，清理上一个实例残留的选区，避免再次点击旧位置恢复旧选区。
- (void)markAsActiveSelectableTextView
{
  RCTSelectableRichTextView *previousActiveTextView = RCTActiveSelectableRichTextView;

  // 只有切换到另一个实例时才清理，避免影响当前实例内的长按和手柄拖动。
  if (previousActiveTextView != nil && previousActiveTextView != self) {
    [previousActiveTextView clearTextSelection];
  }

  RCTActiveSelectableRichTextView = self;
}

// 清空 UITextView 内部保留的 selectedRange，并恢复 editable/selectable 到 prop 设定的真实状态。
// selectRange 命令可能临时开启过 editable/selectable，clearSelection 需要把状态收回，避免长期可编辑。
- (void)clearTextSelection
{
  // 先收回命令选区标志，避免清 selectedRange 时 textViewDidChangeSelection 递归处理。
  _commandSelectionActive = NO;
  _isSettingCommandSelection = NO;

  // 移除 window tap 监听，选区已清不再需要 dismiss 监听。
  [self stopDismissTapListener];

  // 收回 editable，让手柄/光标立刻消失，再清选区，避免 editable 仍为 YES 时光标短暂闪烁。
  self.editable = NO;

  // 无论选区是否有长度，都清空 selectedRange，消除插入点/手柄/选区高亮的任何残留。
  // 之前只在 length>0 时清，导致 dismiss 后折叠成 {location, 0} 的插入点残留，看起来选区没清干净。
  if (self.selectedRange.location != NSNotFound) {
    self.selectedRange = NSMakeRange(0, 0);
  }

  // 恢复 selectable：selectTextRangeWithStart 的 [super setSelectable:YES] 会经 UIKit 回调
  // 把 _rnSelectable 污染成 1，所以不能信任 _rnSelectable。直接设 NO，收回命令选区的临时开启。
  // [super setSelectable:NO] 同样会经 UIKit 回调把 _rnSelectable 设回 0，保持一致。
  // RN prop selectable 的真实值会在下次 updateProps 时由 ComponentView 重新设置。
  [super setSelectable:NO];

  // 退出 first responder，让 UIKit 的 UITextSelectionDisplayInteraction 彻底移除选区 view/手柄。
  // 仅设 selectedRange={0,0} 不够，UITextSelectionView 可能在 editable=NO 后仍残留高亮。
  if ([self isFirstResponder]) {
    [self resignFirstResponder];
  }
}

- (void)touchesBegan:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event
{
  [self markAsActiveSelectableTextView];
  [super touchesBegan:touches withEvent:event];
}

- (BOOL)becomeFirstResponder
{
  [self markAsActiveSelectableTextView];
  return [super becomeFirstResponder];
}

// 根据 selectable prop 同步 UITextView 的真实可选状态。
- (void)updateNativeSelectableState
{
  [super setSelectable:_rnSelectable];
}

// JS 通过 ref.selectRange 触发选取时调用，强制开启选取能力并选中指定范围后弹出系统菜单。
- (void)selectTextRangeWithStart:(NSInteger)start end:(NSInteger)end
{
  NSRange range = [self clampedRangeWithStart:start end:end];

  // range 无效时不改变当前选区。
  if (range.location == NSNotFound || range.length == 0) {
    return;
  }

  [self markAsActiveSelectableTextView];
  // 命令语义是强制选取，临时开启 editable=YES 让程序化选区的手柄可拖（iOS 机制见 init 注释）。
  // 选区有长度时不显示光标，只有左右手柄；clearTextSelection 时恢复 editable=NO。
  self.editable = YES;
  // 即使 _rnSelectable=false 也临时开启 selectable，clearTextSelection 时会恢复。
  [super setSelectable:YES];
  // 标记命令选区激活 + 同步设置中，避免 becomeFirstResponder 触发的空选区回调误清。
  _commandSelectionActive = YES;
  _isSettingCommandSelection = YES;
  [self becomeFirstResponder];
  self.selectedRange = range;
  _isSettingCommandSelection = NO;
  [self scrollRangeToVisible:range];
  [self showEditMenuForSelectedRange];

  // 选区激活后挂 window tap 监听，tap SelectableRichText 外部清选区。
  // 对应 example 的 menuDismissLayer 全屏 dismiss，FlatList 吞 touch 不冒泡时也能收到。
  [self startDismissTapListener];
}

// startDismissTapListener 给 window 加一次性 tap gesture，tap 在 SelectableRichText 外部时清选区。
// cancelsTouchesInView=NO 不拦截其他 view 的 touch（滚动、手柄拖动等正常）。
- (void)startDismissTapListener
{
  if (_dismissTapGesture != nil) {
    return;
  }
  _dismissTapGesture = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(handleDismissTap:)];
  _dismissTapGesture.cancelsTouchesInView = NO;
  _dismissTapGesture.delegate = self;
  // 加到 window 而非 self，确保 FlatList 等吞 touch 的容器外的 tap 也能收到。
  UIWindow *window = self.window;
  if (window != nil) {
    [window addGestureRecognizer:_dismissTapGesture];
  }
}

// handleDismissTap 检查 tap 是否在 SelectableRichText 外部，是则清选区并移除监听。
- (void)handleDismissTap:(UITapGestureRecognizer *)gesture
{
  CGPoint location = [gesture locationInView:self];
  // tap 在 SelectableRichText 内部时不清（让手柄/选区内部交互正常）。
  if (CGRectContainsPoint(self.bounds, location)) {
    return;
  }
  [self clearTextSelection];
}

// stopDismissTapListener 移除 window tap 监听。
- (void)stopDismissTapListener
{
  if (_dismissTapGesture == nil) {
    return;
  }
  UIWindow *window = self.window;
  if (window != nil) {
    [window removeGestureRecognizer:_dismissTapGesture];
  }
  _dismissTapGesture = nil;
}

// textViewDidChangeSelection 监听选区变化：命令选区期间，用户点击文本非手柄区域会让选区
// 折叠成插入点（length=0），此时收回 editable 恢复只读，避免光标停留看起来像输入框。
- (void)textViewDidChangeSelection:(UITextView *)textView
{
  // 同步设置过程或非命令选区期间不处理，避免干扰命令设选区或普通点击。
  if (_isSettingCommandSelection || !_commandSelectionActive) {
    return;
  }

  // 选区折叠为空（插入点）时，收回命令选区状态和 editable，光标随之消失。
  if (textView.selectedRange.location == NSNotFound || textView.selectedRange.length == 0) {
    [self clearTextSelection];
  }
}

// caretRectForPosition 返回 CGRectNull，UITextView 永不绘制插入光标。
// dismiss/点别处清选区时 editable 仍为 YES 的一帧不会闪现光标，避免看起来像输入框。
// 选区手柄走 selection highlight 渲染，不受此影响。
- (CGRect)caretRectForPosition:(UITextPosition *)position
{
  return CGRectNull;
}

// JS 通过 ref.selectParagraphAt 触发时调用，根据本地坐标命中段落并选中后弹系统菜单。
- (void)selectParagraphAtPoint:(CGPoint)point
{
  NSRange paragraphRange = [self paragraphRangeAtPoint:point];

  // 没有命中文本时不改变当前选区，避免空白区域误触发选取。
  if (paragraphRange.location == NSNotFound || paragraphRange.length == 0) {
    return;
  }

  [self selectTextRangeWithStart:(NSInteger)paragraphRange.location end:(NSInteger)NSMaxRange(paragraphRange)];
}

// 将本地坐标映射到字符 index，并按换行符切出所在段落 range。
- (NSRange)paragraphRangeAtPoint:(CGPoint)point
{
  NSString *text = self.text;

  // 文本为空时没有可选段落。
  if (text.length == 0) {
    return NSMakeRange(NSNotFound, 0);
  }

  NSLayoutManager *layoutManager = self.layoutManager;
  NSTextContainer *textContainer = self.textContainer;
  [layoutManager ensureLayoutForTextContainer:textContainer];

  CGPoint textContainerPoint = CGPointMake(point.x - self.textContainerInset.left + self.contentOffset.x,
                                           point.y - self.textContainerInset.top + self.contentOffset.y);
  CGFloat fraction = 0;
  NSUInteger charIndex = [layoutManager characterIndexForPoint:textContainerPoint
                                               inTextContainer:textContainer
                      fractionOfDistanceBetweenInsertionPoints:&fraction];

  // 点击在文本末尾之后时，按最后一个字符所在段落处理。
  if (charIndex >= text.length) {
    charIndex = text.length - 1;
  }

  NSCharacterSet *newlineSet = [NSCharacterSet newlineCharacterSet];
  NSInteger start = (NSInteger)charIndex;
  NSInteger end = (NSInteger)charIndex;

  // 向前找到当前段落的换行边界。
  while (start > 0) {
    unichar character = [text characterAtIndex:(NSUInteger)(start - 1)];
    if ([newlineSet characterIsMember:character]) {
      break;
    }
    start--;
  }

  // 向后找到当前段落的换行边界。
  while ((NSUInteger)end < text.length) {
    unichar character = [text characterAtIndex:(NSUInteger)end];
    if ([newlineSet characterIsMember:character]) {
      break;
    }
    end++;
  }

  // 长按命中空行时不返回段落，避免选中零长度内容。
  if (end <= start) {
    return NSMakeRange(NSNotFound, 0);
  }

  return NSMakeRange((NSUInteger)start, (NSUInteger)(end - start));
}

// handleParagraphLongPress 在原生长按 began 时命中段落，把段落 range 和菜单锚点回传 JS。
// cancelsTouchesInView=NO，gesture 不拦截触摸，后续选区命令建立的手柄拖动不受影响。
- (void)handleParagraphLongPress:(UILongPressGestureRecognizer *)gesture
{
  // 只处理长按开始，避免 changed/end 阶段重复回传段落信息。
  if (gesture.state != UIGestureRecognizerStateBegan) {
    return;
  }

  // 没有监听时不计算段落，避免无意义的事件派发。
  if (self.onTextLongPress == nil) {
    return;
  }

  [self markAsActiveSelectableTextView];
  // 清掉可能残留的命令选区，避免上一段选区与新长按段落并存。
  [self clearTextSelection];

  CGPoint location = [gesture locationInView:self];
  NSRange paragraphRange = [self paragraphRangeAtPoint:location];

  // 没有命中文本时不回传，避免空白区域误触发业务菜单。
  if (paragraphRange.location == NSNotFound || paragraphRange.length == 0) {
    return;
  }

  NSString *paragraphText = [self.text substringWithRange:paragraphRange];
  CGPoint pagePoint = [self convertPoint:location toView:nil];

  self.onTextLongPress(@{
    @"paragraphText" : paragraphText ?: @"",
    @"selectionStart" : @(paragraphRange.location),
    @"selectionEnd" : @(NSMaxRange(paragraphRange)),
    @"locationX" : @(location.x),
    @"locationY" : @(location.y),
    @"pageX" : @(pagePoint.x),
    @"pageY" : @(pagePoint.y),
  });
}

// 程序化设置 selectedRange 后，主动显示系统选中文本菜单。
- (void)showEditMenuForSelectedRange
{
  UITextRange *selectedTextRange = self.selectedTextRange;

  // 没有有效 selectedTextRange 时无法计算菜单锚点。
  if (selectedTextRange == nil || selectedTextRange.empty) {
    return;
  }

  CGRect targetRect = [self firstRectForRange:selectedTextRange];

  // firstRectForRange 可能返回无效 rect，无法定位菜单时不展示。
  if (CGRectIsNull(targetRect) || CGRectIsEmpty(targetRect) || CGRectIsInfinite(targetRect)) {
    return;
  }

  if (@available(iOS 16.0, *)) {
    if (_selectionEditMenuInteraction == nil) {
      _selectionEditMenuInteraction = [[UIEditMenuInteraction alloc] initWithDelegate:self];
      [self addInteraction:_selectionEditMenuInteraction];
    }
    // sourcePoint 用选区中点；targetRectForConfiguration: delegate 返回选区真实 frame，
    // UIKit 据此把菜单显示在选区周围（上方/下方，空间允许），箭头指向选区，自动避让不盖住选中文本。
    UIEditMenuConfiguration *configuration =
        [UIEditMenuConfiguration configurationWithIdentifier:nil sourcePoint:CGPointMake(CGRectGetMidX(targetRect), CGRectGetMidY(targetRect))];
    [_selectionEditMenuInteraction presentEditMenuWithConfiguration:configuration];
    return;
  }

  UIMenuController *menuController = [UIMenuController sharedMenuController];
  [menuController showMenuFromView:self rect:targetRect];
}

// JS 通过 ref.copyRange 触发复制时调用，把指定范围文本写入系统剪贴板。
- (void)copyTextRangeWithStart:(NSInteger)start end:(NSInteger)end
{
  NSRange range = [self clampedRangeWithStart:start end:end];

  // range 无效时不写剪贴板。
  if (range.location == NSNotFound || range.length == 0) {
    return;
  }

  [UIPasteboard generalPasteboard].string = [self.text substringWithRange:range];
}

// 将 JS 传入的 start/end 裁剪到当前文本范围内，避免越界访问。
- (NSRange)clampedRangeWithStart:(NSInteger)start end:(NSInteger)end
{
  NSUInteger textLength = self.text.length;

  // 起止位置非法或反向时返回无效 range。
  if (start < 0 || end <= start || textLength == 0) {
    return NSMakeRange(NSNotFound, 0);
  }

  NSUInteger clampedStart = MIN((NSUInteger)start, textLength);
  NSUInteger clampedEnd = MIN((NSUInteger)end, textLength);

  // 裁剪后没有实际长度时返回无效 range。
  if (clampedEnd <= clampedStart) {
    return NSMakeRange(NSNotFound, 0);
  }

  return NSMakeRange(clampedStart, clampedEnd - clampedStart);
}

#pragma mark - Custom Edit Menu

// 构建 iOS 16+ 文本选中菜单，根据 showSystemMenuItems 决定是否保留系统 suggestedActions。
- (UIMenu *)textView:(UITextView *)textView
    editMenuForTextInRange:(NSRange)range
          suggestedActions:(NSArray<UIMenuElement *> *)suggestedActions API_AVAILABLE(ios(16.0))
{
  return [self menuWithSuggestedActions:suggestedActions selectedRange:range];
}

// 程序化展示 UIEditMenuInteraction 时也复用同一套自定义菜单逻辑。
- (UIMenu *)editMenuInteraction:(UIEditMenuInteraction *)interaction
           menuForConfiguration:(UIEditMenuConfiguration *)configuration
               suggestedActions:(NSArray<UIMenuElement *> *)suggestedActions API_AVAILABLE(ios(16.0))
{
  return [self menuWithSuggestedActions:suggestedActions selectedRange:self.selectedRange];
}

// targetRectForConfiguration 返回选区真实 frame，UIKit 据此把菜单显示在选区周围（上方/下方，
// 空间允许），箭头指向选区，自动避让不盖住选中文本。首次 present 和 updateVisibleMenuPosition
// 都查询此方法。默认（未实现）用 sourcePoint 为中心的零尺寸矩形，菜单直接盖在 sourcePoint 上。
- (CGRect)editMenuInteraction:(UIEditMenuInteraction *)interaction
   targetRectForConfiguration:(UIEditMenuConfiguration *)configuration API_AVAILABLE(ios(16.0))
{
  UITextRange *selectedTextRange = self.selectedTextRange;

  // 没有有效选区时返回 CGRectNull，UIKit 回退到默认（sourcePoint）。
  if (selectedTextRange == nil || selectedTextRange.empty) {
    return CGRectNull;
  }

  // selectionRectsForRange: 返回选区跨所有行的矩形数组，取 union 得到完整选区 frame。
  // firstRectForRange: 对多行选区只返回第一行 rect，菜单按第一行定位会压到下方选区行 + 挡末尾手柄。
  NSArray<UITextSelectionRect *> *selectionRects = [self selectionRectsForRange:selectedTextRange];

  // 没有 selection rect 时回退到 firstRectForRange。
  if (selectionRects.count == 0) {
    CGRect fallback = [self firstRectForRange:selectedTextRange];
    return CGRectIsNull(fallback) || CGRectIsEmpty(fallback) || CGRectIsInfinite(fallback) ? CGRectNull : fallback;
  }

  CGRect unionRect = CGRectNull;
  for (UITextSelectionRect *selectionRect in selectionRects) {
    CGRect rect = selectionRect.rect;
    // 跳过无效 rect，避免污染 union。
    if (CGRectIsNull(rect) || CGRectIsEmpty(rect) || CGRectIsInfinite(rect)) {
      continue;
    }
    unionRect = CGRectIsNull(unionRect) ? rect : CGRectUnion(unionRect, rect);
  }

  // union 无效时回退到 firstRectForRange。
  if (CGRectIsNull(unionRect) || CGRectIsEmpty(unionRect) || CGRectIsInfinite(unionRect)) {
    CGRect fallback = [self firstRectForRange:selectedTextRange];
    return CGRectIsNull(fallback) || CGRectIsEmpty(fallback) || CGRectIsInfinite(fallback) ? CGRectNull : fallback;
  }

  return unionRect;
}

// editMenuInteraction:didEndForConfiguration 在系统菜单 dismiss 时触发。
// 用户点空白/点其他气泡时系统菜单自动 dismiss，此时清掉选区，实现"菜单消失即退出选中"。
// 这比 FlatList onTouchStart 可靠——FlatList 的 touch 不一定冒泡到父 View。
- (void)editMenuInteraction:(UIEditMenuInteraction *)interaction
  didEndForConfiguration:(UIEditMenuConfiguration *)configuration API_AVAILABLE(ios(16.0))
{
  [self clearTextSelection];
}

// 统一组装系统菜单项和 JS 传入的自定义菜单项，避免不同入口菜单表现不一致。
- (UIMenu *)menuWithSuggestedActions:(NSArray<UIMenuElement *> *)suggestedActions
                       selectedRange:(NSRange)selectedRange API_AVAILABLE(ios(16.0))
{
  NSMutableArray<UIMenuElement *> *children =
      self.showSystemMenuItems ? [suggestedActions mutableCopy] : [NSMutableArray new];

  // 如果系统菜单项被保留但 UIKit 未提供 suggestedActions，则从空数组开始构建菜单。
  if (children == nil) {
    children = [NSMutableArray new];
  }

  NSArray<UIMenuElement *> *customActions = [self customMenuActionsForSelectedRange:selectedRange];

  // 如果 JS 传入了可用菜单项，则把自定义项追加到当前菜单列表后面。
  if (customActions.count > 0) {
    [children addObjectsFromArray:customActions];
  }

  return [UIMenu menuWithChildren:children];
}

// 将 JS menuItems 转成 UIKit 的 UIAction，点击时回传当前选中文本和范围。
- (NSArray<UIMenuElement *> *)customMenuActionsForSelectedRange:(NSRange)range API_AVAILABLE(ios(16.0))
{
  NSMutableArray<UIMenuElement *> *actions = [NSMutableArray new];
  __weak RCTSelectableRichTextView *weakSelf = self;

  for (NSDictionary *item in self.menuItems) {
    NSString *itemId = [item[@"id"] isKindOfClass:[NSString class]] ? item[@"id"] : nil;
    NSString *title = [item[@"title"] isKindOfClass:[NSString class]] ? item[@"title"] : nil;

    // 跳过缺少 id 或 title 的菜单项，避免 UIKit 创建不可识别的 action。
    if (itemId.length == 0 || title.length == 0) {
      continue;
    }

    UIAction *action = [UIAction actionWithTitle:title
                                           image:nil
                                      identifier:itemId
                                         handler:^(__unused UIAction *selectedAction) {
                                           // 点击菜单时读取最新选区，保证拖动控制手柄后的范围能正确回传。
                                           [weakSelf handleCustomMenuItem:item selectedRange:range];
                                         }];
    [actions addObject:action];
  }

  return actions;
}

// 处理自定义菜单点击，把 action id、标题、选中文本和选区范围发送给 JS。
- (void)handleCustomMenuItem:(NSDictionary *)item selectedRange:(NSRange)fallbackRange
{
  // 如果 JS 没有监听 onMenuAction，则只关闭原生菜单动作，不执行额外业务。
  if (!self.onMenuAction) {
    return;
  }

  NSRange selectedRange = [self validSelectedRangeWithFallbackRange:fallbackRange];

  // 如果当前选区无效，则不向 JS 发送没有文本上下文的菜单事件。
  if (selectedRange.location == NSNotFound || selectedRange.length == 0) {
    return;
  }

  NSString *selectedText = [self.text substringWithRange:selectedRange];
  NSString *itemId = [item[@"id"] isKindOfClass:[NSString class]] ? item[@"id"] : @"";
  NSString *title = [item[@"title"] isKindOfClass:[NSString class]] ? item[@"title"] : @"";

  self.onMenuAction(@{
    @"id" : itemId,
    @"title" : title,
    @"selectedText" : selectedText,
    @"selectionStart" : @(selectedRange.location),
    @"selectionEnd" : @(NSMaxRange(selectedRange)),
  });

  // 菜单回调发给 JS 后再按需清空，确保业务侧能拿到点击时的最终选区。
  if (self.clearSelectionOnMenuAction) {
    [self clearTextSelection];
  }
}

// 取得点击菜单瞬间的有效选区，当前 selectedRange 不可用时使用菜单创建时的范围。
- (NSRange)validSelectedRangeWithFallbackRange:(NSRange)fallbackRange
{
  NSRange selectedRange = self.selectedRange;
  NSUInteger textLength = self.text.length;

  // 如果当前 selectedRange 已经越界，则使用 UIKit 生成菜单时提供的 range。
  if (selectedRange.location == NSNotFound || NSMaxRange(selectedRange) > textLength || selectedRange.length == 0) {
    selectedRange = fallbackRange;
  }

  // 如果 fallbackRange 也不可用，则返回 NSNotFound 表示没有可执行的选区。
  if (selectedRange.location == NSNotFound || NSMaxRange(selectedRange) > textLength || selectedRange.length == 0) {
    return NSMakeRange(NSNotFound, 0);
  }

  return selectedRange;
}

- (void)setSelectable:(BOOL)selectable
{
  if (_rnSelectable == selectable) {
    return;
  }
  _rnSelectable = selectable;
  [self updateNativeSelectableState];
}

// 返回 RN 记录的 selectable 状态，和 UITextView 的 isSelectable getter 保持一致。
- (BOOL)isSelectable
{
  return _rnSelectable;
}

- (void)setTextStorage:(NSTextStorage *)textStorage
{
  // 用 attributedText 设置，UITextView 会自行构建内部 TextKit 管线
  self.attributedText = textStorage;

  // 确保 layoutManager 的 usesFontLeading 与 ShadowView 测量一致
  self.layoutManager.usesFontLeading = NO;
}

#pragma mark - Accessibility

- (NSString *)accessibilityLabel
{
  NSString *superLabel = [super accessibilityLabel];
  if (superLabel.length > 0) {
    return superLabel;
  }
  return self.text;
}

@end
