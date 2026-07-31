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

// RCTMenuItemsFromProps converts the menu items in the C++ props into the NSDictionary array
// consumed by UIKit menus.
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

// RCTSelectableRichTextReadRangeCommandArgs validates and reads the start/end arguments for
// selectRange/copyRange.
static BOOL RCTSelectableRichTextReadRangeCommandArgs(NSString *commandName, const NSArray *args, NSInteger *start, NSInteger *end)
{
  // A range command must be passed exactly two numeric arguments: start and end.
  if (args.count != 2) {
    RCTLogError(@"SelectableRichText command %@ received %d arguments, expected 2.", commandName, (int)args.count);
    return NO;
  }

  NSObject *startArg = args[0];
  NSObject *endArg = args[1];

  // Can't safely convert to a UITextRange when start isn't an NSNumber.
  if (![startArg isKindOfClass:[NSNumber class]]) {
    RCTLogError(@"SelectableRichText command %@ expected start to be a number.", commandName);
    return NO;
  }

  // Can't safely convert to a UITextRange when end isn't an NSNumber.
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
  // The selectRange command selects the UTF-16 text range given by JS.
  if ([commandName isEqualToString:@"selectRange"]) {
    NSInteger start = 0;
    NSInteger end = 0;

    // Leave the current native selection unchanged when the arguments are invalid.
    if (!RCTSelectableRichTextReadRangeCommandArgs((NSString *)commandName, args, &start, &end)) {
      return;
    }

    [_selectableTextView selectTextRangeWithStart:start end:end];
    return;
  }

  // The selectParagraphAt command hit-tests the paragraph at the local coordinates and selects it.
  if ([commandName isEqualToString:@"selectParagraphAt"]) {
    // selectParagraphAt must be passed exactly two numeric arguments: x and y.
    if (args.count != 2) {
      RCTLogError(@"SelectableRichText command selectParagraphAt received %d arguments, expected 2.", (int)args.count);
      return;
    }

    NSObject *xArg = args[0];
    NSObject *yArg = args[1];

    // Can't convert to coordinates when x/y aren't NSNumbers.
    if (![xArg isKindOfClass:[NSNumber class]] || ![yArg isKindOfClass:[NSNumber class]]) {
      RCTLogError(@"SelectableRichText command selectParagraphAt expected x/y to be numbers.");
      return;
    }

    CGFloat x = [(NSNumber *)xArg doubleValue];
    CGFloat y = [(NSNumber *)yArg doubleValue];
    [_selectableTextView selectParagraphAtPoint:CGPointMake(x, y)];
    return;
  }

  // The clearSelection command clears the current native selection.
  if ([commandName isEqualToString:@"clearSelection"]) {
    // clearSelection takes no arguments, so a stray argument from JS can't create ambiguous behavior.
    if (args.count != 0) {
      RCTLogError(@"SelectableRichText command %@ received %d arguments, expected 0.", commandName, (int)args.count);
      return;
    }

    [_selectableTextView clearTextSelection];
    return;
  }

  // The copyRange command copies the UTF-16 text range given by JS to the system clipboard.
  if ([commandName isEqualToString:@"copyRange"]) {
    NSInteger start = 0;
    NSInteger end = 0;

    // Don't overwrite the system clipboard when the arguments are invalid.
    if (!RCTSelectableRichTextReadRangeCommandArgs((NSString *)commandName, args, &start, &end)) {
      return;
    }

    [_selectableTextView copyTextRangeWithStart:start end:end];
    return;
  }

  RCTLogError(@"SelectableRichText received unsupported command %@.", commandName);
}

#pragma mark - State

// updateSelectableRichTextStorageWithState converts the Fabric Paragraph state into UITextView's
// selectable text storage.
- (void)updateSelectableRichTextStorageWithState:(const State::Shared &)state
{
  auto paragraphState = std::static_pointer_cast<const SelectableRichTextShadowNode::ConcreteState>(state);

  // Clear the UITextView content first if Fabric hasn't delivered a Paragraph state yet.
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

// configureEventHandlers bridges UIKit text-interaction callbacks to the Fabric C++ event emitter.
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

// emitMenuAction sends the custom menu tap event.
- (void)emitMenuAction:(NSDictionary *)event
{
  auto eventEmitter = std::static_pointer_cast<const SelectableRichTextEventEmitter>(_eventEmitter);

  // Don't send the event when there's no JS listener or the eventEmitter has already been recycled.
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

// emitTextLongPress sends the paragraph and menu-anchor event hit by the native long press.
- (void)emitTextLongPress:(NSDictionary *)event
{
  auto eventEmitter = std::static_pointer_cast<const SelectableRichTextEventEmitter>(_eventEmitter);

  // Don't send the event when there's no JS listener or the eventEmitter has already been recycled.
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
