#import "RCTSelectableRichTextComponentView.h"
#import "RCTSelectableRichTextView.h"

#import <React/RCTLog.h>
#import <react/renderer/components/selectablerichtext/SelectableRichTextComponentDescriptor.h>
#import <react/renderer/components/selectablerichtext/SelectableRichTextEventEmitter.h>
#import <react/renderer/components/selectablerichtext/SelectableRichTextProps.h>
#import <react/renderer/components/selectablerichtext/SelectableRichTextShadowNode.h>
#import <react/renderer/components/text/RawTextComponentDescriptor.h>
#import <react/renderer/components/text/TextComponentDescriptor.h>
#import <react/renderer/textlayoutmanager/RCTAttributedTextUtils.h>

using namespace facebook::react;

// RCTMenuItemsFromProps 把 C++ props 中的菜单项转换为 UIKit 菜单消费的 NSDictionary 数组。
static NSArray<NSDictionary *> *RCTMenuItemsFromProps(const std::vector<SelectableRichTextMenuItem> &menuItems)
{
  NSMutableArray<NSDictionary *> *items = [NSMutableArray new];

  for (const auto &item : menuItems) {
    NSString *itemId = [NSString stringWithUTF8String:item.id.c_str()];
    NSString *title = [NSString stringWithUTF8String:item.title.c_str()];
    [items addObject:@{@"id" : itemId, @"title" : title}];
  }

  return items;
}

// RCTSelectableRichTextReadRangeCommandArgs 校验并读取 selectRange/copyRange 的 start/end 参数。
static BOOL RCTSelectableRichTextReadRangeCommandArgs(NSString *commandName, const NSArray *args, NSInteger *start, NSInteger *end)
{
  // range command 必须传入 start/end 两个数字参数。
  if (args.count != 2) {
    RCTLogError(@"SelectableRichText command %@ received %d arguments, expected 2.", commandName, (int)args.count);
    return NO;
  }

  NSObject *startArg = args[0];
  NSObject *endArg = args[1];

  // start 参数不是 NSNumber 时不能安全转换为 UITextRange。
  if (![startArg isKindOfClass:[NSNumber class]]) {
    RCTLogError(@"SelectableRichText command %@ expected start to be a number.", commandName);
    return NO;
  }

  // end 参数不是 NSNumber 时不能安全转换为 UITextRange。
  if (![endArg isKindOfClass:[NSNumber class]]) {
    RCTLogError(@"SelectableRichText command %@ expected end to be a number.", commandName);
    return NO;
  }

  *start = [(NSNumber *)startArg integerValue];
  *end = [(NSNumber *)endArg integerValue];
  return YES;
}

@implementation RCTSelectableRichTextComponentView {
  RCTSelectableRichTextView *_selectableTextView;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _props = SelectableRichTextShadowNode::defaultSharedProps();

    self.opaque = NO;
    _selectableTextView = [[RCTSelectableRichTextView alloc] initWithFrame:CGRectZero];
    self.contentView = _selectableTextView;
    [self configureEventHandlers];
  }

  return self;
}

#pragma mark - RCTComponentViewProtocol

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<SelectableRichTextComponentDescriptor>();
}

+ (std::vector<facebook::react::ComponentDescriptorProvider>)supplementalComponentDescriptorProviders
{
  return {
      concreteComponentDescriptorProvider<RawTextComponentDescriptor>(),
      concreteComponentDescriptorProvider<TextComponentDescriptor>()};
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &newProps = static_cast<const SelectableRichTextProps &>(*props);

  _selectableTextView.selectable = newProps.isSelectable;
  _selectableTextView.menuItems = RCTMenuItemsFromProps(newProps.menuItems);
  _selectableTextView.showSystemMenuItems = newProps.showSystemMenuItems;
  _selectableTextView.clearSelectionOnMenuAction = newProps.clearSelectionOnMenuAction;

  [super updateProps:props oldProps:oldProps];
}

- (void)updateState:(const State::Shared &)state oldState:(const State::Shared &)oldState
{
  [super updateState:state oldState:oldState];
  [self updateSelectableRichTextStorageWithState:state];
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  _selectableTextView.frame = self.bounds;
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  [_selectableTextView clearTextSelection];
  _selectableTextView.menuItems = @[];
  _selectableTextView.showSystemMenuItems = YES;
  _selectableTextView.clearSelectionOnMenuAction = NO;
  [_selectableTextView setTextStorage:[[NSTextStorage alloc] initWithString:@""]];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _selectableTextView.frame = self.bounds;
}

- (void)handleCommand:(const NSString *)commandName args:(const NSArray *)args
{
  // selectRange 命令选中 JS 指定的 UTF-16 文本范围。
  if ([commandName isEqualToString:@"selectRange"]) {
    NSInteger start = 0;
    NSInteger end = 0;

    // 参数不合法时不改变当前原生选区。
    if (!RCTSelectableRichTextReadRangeCommandArgs((NSString *)commandName, args, &start, &end)) {
      return;
    }

    [_selectableTextView selectTextRangeWithStart:start end:end];
    return;
  }

  // selectParagraphAt 命令根据本地坐标命中段落并选中。
  if ([commandName isEqualToString:@"selectParagraphAt"]) {
    // selectParagraphAt 必须传入 x/y 两个数字参数。
    if (args.count != 2) {
      RCTLogError(@"SelectableRichText command selectParagraphAt received %d arguments, expected 2.", (int)args.count);
      return;
    }

    NSObject *xArg = args[0];
    NSObject *yArg = args[1];

    // x/y 不是 NSNumber 时无法转换为坐标。
    if (![xArg isKindOfClass:[NSNumber class]] || ![yArg isKindOfClass:[NSNumber class]]) {
      RCTLogError(@"SelectableRichText command selectParagraphAt expected x/y to be numbers.");
      return;
    }

    CGFloat x = [(NSNumber *)xArg doubleValue];
    CGFloat y = [(NSNumber *)yArg doubleValue];
    [_selectableTextView selectParagraphAtPoint:CGPointMake(x, y)];
    return;
  }

  // clearSelection 命令清理当前原生选区。
  if ([commandName isEqualToString:@"clearSelection"]) {
    // clearSelection 不接受参数，避免 JS 误传导致行为歧义。
    if (args.count != 0) {
      RCTLogError(@"SelectableRichText command %@ received %d arguments, expected 0.", commandName, (int)args.count);
      return;
    }

    [_selectableTextView clearTextSelection];
    return;
  }

  // copyRange 命令复制 JS 指定的 UTF-16 文本范围到系统剪贴板。
  if ([commandName isEqualToString:@"copyRange"]) {
    NSInteger start = 0;
    NSInteger end = 0;

    // 参数不合法时不覆盖系统剪贴板。
    if (!RCTSelectableRichTextReadRangeCommandArgs((NSString *)commandName, args, &start, &end)) {
      return;
    }

    [_selectableTextView copyTextRangeWithStart:start end:end];
    return;
  }

  RCTLogError(@"SelectableRichText received unsupported command %@.", commandName);
}

#pragma mark - State

// updateSelectableRichTextStorageWithState 把 Fabric Paragraph state 转成 UITextView 可选文本存储。
- (void)updateSelectableRichTextStorageWithState:(const State::Shared &)state
{
  auto paragraphState = std::static_pointer_cast<const SelectableRichTextShadowNode::ConcreteState>(state);

  // Fabric 还没下发 Paragraph state 时，先清空 UITextView 内容。
  if (!paragraphState) {
    RCTLogInfo(@"[SelectableRichText] updateState: nil paragraphState");
    [_selectableTextView setTextStorage:[[NSTextStorage alloc] initWithString:@""]];
    return;
  }

  const auto &stateData = paragraphState->getData();
  NSAttributedString *attributedString = RCTNSAttributedStringFromAttributedString(stateData.attributedString);
  NSTextStorage *textStorage = [[NSTextStorage alloc] initWithAttributedString:attributedString ?: [NSAttributedString new]];

  [_selectableTextView setTextStorage:textStorage];
}

#pragma mark - Events

// configureEventHandlers 把 UIKit 文本交互回调桥接到 Fabric C++ event emitter。
- (void)configureEventHandlers
{
  __weak RCTSelectableRichTextComponentView *weakSelf = self;

  _selectableTextView.onMenuAction = ^(NSDictionary *event) {
    [weakSelf emitMenuAction:event];
  };

  _selectableTextView.onTextLongPress = ^(NSDictionary *event) {
    [weakSelf emitTextLongPress:event];
  };
}

// emitMenuAction 发送自定义菜单点击事件。
- (void)emitMenuAction:(NSDictionary *)event
{
  auto eventEmitter = std::static_pointer_cast<const SelectableRichTextEventEmitter>(_eventEmitter);

  // 没有 JS 监听或 eventEmitter 已回收时不发送事件。
  if (!eventEmitter) {
    return;
  }

  SelectableRichTextEventEmitter::OnMenuAction value;
  value.id = [event[@"id"] UTF8String] ?: "";
  value.title = [event[@"title"] UTF8String] ?: "";
  value.selectedText = [event[@"selectedText"] UTF8String] ?: "";
  value.selectionStart = [event[@"selectionStart"] intValue];
  value.selectionEnd = [event[@"selectionEnd"] intValue];
  eventEmitter->onMenuAction(value);
}

// emitTextLongPress 发送原生长按命中的段落和菜单锚点事件。
- (void)emitTextLongPress:(NSDictionary *)event
{
  auto eventEmitter = std::static_pointer_cast<const SelectableRichTextEventEmitter>(_eventEmitter);

  // 没有 JS 监听或 eventEmitter 已回收时不发送事件。
  if (!eventEmitter) {
    return;
  }

  SelectableRichTextEventEmitter::OnTextLongPress value;
  value.paragraphText = [event[@"paragraphText"] UTF8String] ?: "";
  value.selectionStart = [event[@"selectionStart"] intValue];
  value.selectionEnd = [event[@"selectionEnd"] intValue];
  value.locationX = [event[@"locationX"] doubleValue];
  value.locationY = [event[@"locationY"] doubleValue];
  value.pageX = [event[@"pageX"] doubleValue];
  value.pageY = [event[@"pageY"] doubleValue];
  eventEmitter->onTextLongPress(value);
}

@end

Class<RCTComponentViewProtocol> RCTSelectableRichTextCls(void)
{
  return RCTSelectableRichTextComponentView.class;
}
