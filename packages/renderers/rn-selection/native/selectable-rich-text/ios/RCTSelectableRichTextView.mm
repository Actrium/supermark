#import "RCTSelectableRichTextView.h"

#import <React/RCTTextAttributes.h>
#import <React/UIView+React.h>

// Tracks the SelectableText currently being interacted with, so switching text blocks clears the
// selectedRange left behind by the previous UITextView.
static __weak RCTSelectableRichTextView *RCTActiveSelectableRichTextView = nil;

@interface RCTSelectableRichTextView () <UITextViewDelegate, UIEditMenuInteractionDelegate, UIGestureRecognizerDelegate>

@end

@implementation RCTSelectableRichTextView {
  BOOL _rnSelectable;
  // _commandSelectionActive indicates the current selection was opened by a selectRange/selectParagraphAt
  // command, used by textViewDidChangeSelection to decide whether a selection collapsing to empty
  // should revoke editable.
  BOOL _commandSelectionActive;
  // _isSettingCommandSelection guards the synchronous setup in selectTextRangeWithStart,
  // preventing the empty-selection callback triggered by becomeFirstResponder from wrongly clearing
  // the command selection that is about to be set.
  BOOL _isSettingCommandSelection;
  UIEditMenuInteraction *_selectionEditMenuInteraction API_AVAILABLE(ios(16.0));
  // _dismissTapGesture is attached to the window while a selection is active; tapping outside
  // SelectableRichText clears the selection — the native equivalent of the example's menuDismissLayer.
  // cancelsTouchesInView=NO leaves other touches unaffected.
  UITapGestureRecognizer *_dismissTapGesture;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    // Read-only setup: editable defaults to NO so tapping the text never shows a caret or text-field focus.
    // editable is temporarily switched to YES during selectRange/selectParagraphAt commands so the
    // programmatic selection handles are draggable
    // (iOS behavior: on a UITextView with editable=NO, programmatic selection handles are read-only
    // display and don't respond to dragging),
    // and reverted to NO in clearTextSelection. When the selection has length, no caret is shown, only the handles.
    self.editable = NO;
    // selectable defaults to NO to avoid UITextView's built-in long-press word selection conflicting
    // with the host's Pressable long-press gesture.
    // The native side temporarily enables selectable when the host triggers selection via the
    // ref.selectParagraphAt / selectRange commands.
    [super setSelectable:NO];
    self.scrollEnabled = NO;
    self.delegate = self;
    self.dataDetectorTypes = UIDataDetectorTypeNone;

    // Layout consistency: remove UITextView's default content insets
    self.textContainerInset = UIEdgeInsetsZero;
    self.textContainer.lineFragmentPadding = 0;

    // Transparent background, so UITextView's default white background doesn't cover the bubble's background color
    self.backgroundColor = [UIColor clearColor];
    self.opaque = NO;

    // Disable keyboard input related features
    self.inputView = [[UIView alloc] initWithFrame:CGRectZero];

    // accessibility
    self.isAccessibilityElement = YES;
    self.accessibilityTraits |= UIAccessibilityTraitStaticText;

    // Native long-press gesture: hit-tests the paragraph and reports the range/anchor back to JS,
    // letting the host decide the follow-up selection action.
    // cancelsTouchesInView=NO ensures UITextView's touches are not intercepted, so handle-drag touches
    // still arrive normally once a selection command is active.
    UILongPressGestureRecognizer *paragraphLongPressGesture =
        [[UILongPressGestureRecognizer alloc] initWithTarget:self
                                                     action:@selector(handleParagraphLongPress:)];
    paragraphLongPressGesture.cancelsTouchesInView = NO;
    [self addGestureRecognizer:paragraphLongPressGesture];

    _rnSelectable = NO;
    // System menu items such as copy/select-all are kept by default; callers can turn them off via showSystemMenuItems.
    _showSystemMenuItems = YES;
    // The selection is kept after a menu tap by default; callers can enable automatic clearing via clearSelectionOnMenuAction.
    _clearSelectionOnMenuAction = NO;
  }
  return self;
}

#pragma mark - Selection State

// When the current SelectableText starts an interaction, clear the previous instance's leftover
// selection, so tapping the old location again doesn't restore the old selection.
- (void)markAsActiveSelectableTextView
{
  RCTSelectableRichTextView *previousActiveTextView = RCTActiveSelectableRichTextView;

  // Only clear when switching to a different instance, so long-press and handle-dragging within the
  // current instance aren't disrupted.
  if (previousActiveTextView != nil && previousActiveTextView != self) {
    [previousActiveTextView clearTextSelection];
  }

  RCTActiveSelectableRichTextView = self;
}

// Clears the selectedRange retained internally by UITextView, and restores editable/selectable to
// the real state set by the props.
// selectRange commands may have temporarily enabled editable/selectable; clearSelection must revoke
// that state to avoid leaving the view editable long-term.
- (void)clearTextSelection
{
  // Revoke the command-selection flags first, so textViewDidChangeSelection doesn't recursively
  // re-process this when selectedRange is cleared.
  _commandSelectionActive = NO;
  _isSettingCommandSelection = NO;

  // Remove the window tap listener — once the selection is cleared, the dismiss listener is no longer needed.
  [self stopDismissTapListener];

  // Revoke editable first so the handles/caret disappear immediately, then clear the selection —
  // this avoids a brief caret flicker while editable is still YES.
  self.editable = NO;

  // Clear selectedRange regardless of whether the selection has length, to remove any leftover
  // insertion point/handles/selection highlight.
  // Previously this only cleared when length>0, which left a collapsed {location, 0} insertion point
  // behind after dismiss, making it look like the selection wasn't fully cleared.
  if (self.selectedRange.location != NSNotFound) {
    self.selectedRange = NSMakeRange(0, 0);
  }

  // Restore selectable: the [super setSelectable:YES] in selectTextRangeWithStart goes through a
  // UIKit callback
  // that corrupts _rnSelectable to 1, so _rnSelectable cannot be trusted here. Set it to NO directly,
  // revoking the command selection's temporary enablement.
  // [super setSelectable:NO] likewise goes through a UIKit callback that sets _rnSelectable back to
  // 0, keeping things consistent.
  // The real value of the RN selectable prop will be re-applied by ComponentView on the next updateProps.
  [super setSelectable:NO];

  // Resign first responder so UIKit's UITextSelectionDisplayInteraction fully removes the selection view/handles.
  // Just setting selectedRange={0,0} is not enough — UITextSelectionView can still leave highlighting
  // behind even after editable=NO.
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

// Sync UITextView's real selectable state from the selectable prop.
- (void)updateNativeSelectableState
{
  [super setSelectable:_rnSelectable];
}

// Called when JS triggers selection via ref.selectRange: forcibly enables selection, selects the
// given range, then shows the system menu.
- (void)selectTextRangeWithStart:(NSInteger)start end:(NSInteger)end
{
  NSRange range = [self clampedRangeWithStart:start end:end];

  // Leave the current selection unchanged if the range is invalid.
  if (range.location == NSNotFound || range.length == 0) {
    return;
  }

  [self markAsActiveSelectableTextView];
  // The command's semantics are a forced selection; temporarily enable editable=YES so the
  // programmatic selection's handles are draggable (see the init comment for the iOS mechanism).
  // When the selection has length, no caret is shown, only the left/right handles; editable is
  // reverted to NO in clearTextSelection.
  self.editable = YES;
  // Temporarily enable selectable even when _rnSelectable=false; it is restored in clearTextSelection.
  [super setSelectable:YES];
  // Mark the command selection as active and mid-setup, so the empty-selection callback triggered by
  // becomeFirstResponder doesn't wrongly clear it.
  _commandSelectionActive = YES;
  _isSettingCommandSelection = YES;
  [self becomeFirstResponder];
  self.selectedRange = range;
  _isSettingCommandSelection = NO;
  [self scrollRangeToVisible:range];
  [self showEditMenuForSelectedRange];

  // Once the selection is active, attach the window tap listener; tapping outside SelectableRichText
  // clears the selection.
  // This mirrors the example's full-screen menuDismissLayer dismiss, and still works even when a
  // FlatList swallows touches that would otherwise not bubble up.
  [self startDismissTapListener];
}

// startDismissTapListener adds a one-shot tap gesture to the window; tapping outside
// SelectableRichText clears the selection.
// cancelsTouchesInView=NO does not intercept other views' touches (scrolling, handle dragging, etc.
// keep working normally).
- (void)startDismissTapListener
{
  if (_dismissTapGesture != nil) {
    return;
  }
  _dismissTapGesture = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(handleDismissTap:)];
  _dismissTapGesture.cancelsTouchesInView = NO;
  _dismissTapGesture.delegate = self;
  // Attached to the window rather than self, so taps outside touch-swallowing containers like
  // FlatList are still received.
  UIWindow *window = self.window;
  if (window != nil) {
    [window addGestureRecognizer:_dismissTapGesture];
  }
}

// handleDismissTap checks whether the tap is outside SelectableRichText; if so, it clears the
// selection and removes the listener.
- (void)handleDismissTap:(UITapGestureRecognizer *)gesture
{
  CGPoint location = [gesture locationInView:self];
  // Don't clear when the tap is inside SelectableRichText (so handle/selection interactions inside
  // keep working).
  if (CGRectContainsPoint(self.bounds, location)) {
    return;
  }
  [self clearTextSelection];
}

// stopDismissTapListener removes the window tap listener.
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

// textViewDidChangeSelection observes selection changes: during a command selection, tapping the
// text outside the handle area collapses the selection
// to an insertion point (length=0); at that point editable is revoked to restore read-only mode,
// avoiding a lingering caret that looks like a text field.
- (void)textViewDidChangeSelection:(UITextView *)textView
{
  // Skip processing during synchronous setup or when there's no command selection, to avoid
  // interfering with a command-set selection or a normal tap.
  if (_isSettingCommandSelection || !_commandSelectionActive) {
    return;
  }

  // When the selection collapses to empty (an insertion point), revoke the command-selection state
  // and editable, and the caret disappears along with it.
  if (textView.selectedRange.location == NSNotFound || textView.selectedRange.length == 0) {
    [self clearTextSelection];
  }
}

// caretRectForPosition returns CGRectNull, so UITextView never draws an insertion caret.
// This avoids the caret briefly flashing during the frame where editable is still YES while
// dismissing/clearing the selection elsewhere, which would look like a text field.
// Selection handles are rendered via the selection highlight and are unaffected by this.
- (CGRect)caretRectForPosition:(UITextPosition *)position
{
  return CGRectNull;
}

// Called when JS triggers via ref.selectParagraphAt: hit-tests the paragraph at the local
// coordinates, selects it, then shows the system menu.
- (void)selectParagraphAtPoint:(CGPoint)point
{
  NSRange paragraphRange = [self paragraphRangeAtPoint:point];

  // Leave the current selection unchanged if no text is hit, to avoid tapping a blank area from
  // wrongly triggering a selection.
  if (paragraphRange.location == NSNotFound || paragraphRange.length == 0) {
    return;
  }

  [self selectTextRangeWithStart:(NSInteger)paragraphRange.location end:(NSInteger)NSMaxRange(paragraphRange)];
}

// Map the local coordinates to a character index, and cut out the paragraph range at that position
// using newline characters.
- (NSRange)paragraphRangeAtPoint:(CGPoint)point
{
  NSString *text = self.text;

  // No paragraph to select when the text is empty.
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

  // When the tap is past the end of the text, treat it as the paragraph containing the last character.
  if (charIndex >= text.length) {
    charIndex = text.length - 1;
  }

  NSCharacterSet *newlineSet = [NSCharacterSet newlineCharacterSet];
  NSInteger start = (NSInteger)charIndex;
  NSInteger end = (NSInteger)charIndex;

  // Scan backward to find the current paragraph's newline boundary.
  while (start > 0) {
    unichar character = [text characterAtIndex:(NSUInteger)(start - 1)];
    if ([newlineSet characterIsMember:character]) {
      break;
    }
    start--;
  }

  // Scan forward to find the current paragraph's newline boundary.
  while ((NSUInteger)end < text.length) {
    unichar character = [text characterAtIndex:(NSUInteger)end];
    if ([newlineSet characterIsMember:character]) {
      break;
    }
    end++;
  }

  // Don't return a paragraph when the long press hits a blank line, to avoid selecting zero-length content.
  if (end <= start) {
    return NSMakeRange(NSNotFound, 0);
  }

  return NSMakeRange((NSUInteger)start, (NSUInteger)(end - start));
}

// handleParagraphLongPress hit-tests the paragraph when the native long press begins, and reports
// the paragraph range and menu anchor back to JS.
// cancelsTouchesInView=NO, so the gesture doesn't intercept touches, and subsequent handle-dragging
// from an established selection command is unaffected.
- (void)handleParagraphLongPress:(UILongPressGestureRecognizer *)gesture
{
  // Only handle the start of the long press, to avoid reporting paragraph info repeatedly during the
  // changed/end phases.
  if (gesture.state != UIGestureRecognizerStateBegan) {
    return;
  }

  // Skip computing the paragraph when there's no listener, to avoid dispatching pointless events.
  if (self.onTextLongPress == nil) {
    return;
  }

  [self markAsActiveSelectableTextView];
  // Clear any leftover command selection, so the previous selection and the newly long-pressed
  // paragraph don't coexist.
  [self clearTextSelection];

  CGPoint location = [gesture locationInView:self];
  NSRange paragraphRange = [self paragraphRangeAtPoint:location];

  // Don't report back when no text is hit, to avoid a blank area wrongly triggering the business menu.
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

// After programmatically setting selectedRange, proactively show the system's selected-text menu.
- (void)showEditMenuForSelectedRange
{
  UITextRange *selectedTextRange = self.selectedTextRange;

  // The menu anchor can't be computed without a valid selectedTextRange.
  if (selectedTextRange == nil || selectedTextRange.empty) {
    return;
  }

  CGRect targetRect = [self firstRectForRange:selectedTextRange];

  // firstRectForRange may return an invalid rect; don't show the menu when it can't be positioned.
  if (CGRectIsNull(targetRect) || CGRectIsEmpty(targetRect) || CGRectIsInfinite(targetRect)) {
    return;
  }

  if (@available(iOS 16.0, *)) {
    if (_selectionEditMenuInteraction == nil) {
      _selectionEditMenuInteraction = [[UIEditMenuInteraction alloc] initWithDelegate:self];
      [self addInteraction:_selectionEditMenuInteraction];
    }
    // sourcePoint uses the selection's midpoint; the targetRectForConfiguration: delegate returns the
    // selection's real frame,
    // and UIKit uses that to show the menu around the selection (above/below, whichever fits),
    // pointing its arrow at the selection and automatically avoiding covering the selected text.
    UIEditMenuConfiguration *configuration =
        [UIEditMenuConfiguration configurationWithIdentifier:nil sourcePoint:CGPointMake(CGRectGetMidX(targetRect), CGRectGetMidY(targetRect))];
    [_selectionEditMenuInteraction presentEditMenuWithConfiguration:configuration];
    return;
  }

  UIMenuController *menuController = [UIMenuController sharedMenuController];
  [menuController showMenuFromView:self rect:targetRect];
}

// Called when JS triggers copy via ref.copyRange: writes the text in the given range to the system clipboard.
- (void)copyTextRangeWithStart:(NSInteger)start end:(NSInteger)end
{
  NSRange range = [self clampedRangeWithStart:start end:end];

  // Don't write to the clipboard when the range is invalid.
  if (range.location == NSNotFound || range.length == 0) {
    return;
  }

  [UIPasteboard generalPasteboard].string = [self.text substringWithRange:range];
}

// Clamp the start/end passed in from JS to the current text range, to avoid out-of-bounds access.
- (NSRange)clampedRangeWithStart:(NSInteger)start end:(NSInteger)end
{
  NSUInteger textLength = self.text.length;

  // Return an invalid range when the start/end positions are illegal or reversed.
  if (start < 0 || end <= start || textLength == 0) {
    return NSMakeRange(NSNotFound, 0);
  }

  NSUInteger clampedStart = MIN((NSUInteger)start, textLength);
  NSUInteger clampedEnd = MIN((NSUInteger)end, textLength);

  // Return an invalid range when there's no actual length left after clamping.
  if (clampedEnd <= clampedStart) {
    return NSMakeRange(NSNotFound, 0);
  }

  return NSMakeRange(clampedStart, clampedEnd - clampedStart);
}

#pragma mark - Custom Edit Menu

// Build the iOS 16+ text-selection menu, keeping the system's suggestedActions or not based on showSystemMenuItems.
- (UIMenu *)textView:(UITextView *)textView
    editMenuForTextInRange:(NSRange)range
          suggestedActions:(NSArray<UIMenuElement *> *)suggestedActions API_AVAILABLE(ios(16.0))
{
  return [self menuWithSuggestedActions:suggestedActions selectedRange:range];
}

// The same custom-menu logic is reused when programmatically presenting UIEditMenuInteraction.
- (UIMenu *)editMenuInteraction:(UIEditMenuInteraction *)interaction
           menuForConfiguration:(UIEditMenuConfiguration *)configuration
               suggestedActions:(NSArray<UIMenuElement *> *)suggestedActions API_AVAILABLE(ios(16.0))
{
  return [self menuWithSuggestedActions:suggestedActions selectedRange:self.selectedRange];
}

// targetRectForConfiguration returns the selection's real frame; UIKit uses it to show the menu
// around the selection (above/below,
// whichever fits), pointing its arrow at the selection and automatically avoiding covering the
// selected text. Both the initial present and
// updateVisibleMenuPosition query this method. The default (when unimplemented) uses a zero-size
// rect centered on sourcePoint, so the menu sits directly on top of sourcePoint.
- (CGRect)editMenuInteraction:(UIEditMenuInteraction *)interaction
   targetRectForConfiguration:(UIEditMenuConfiguration *)configuration API_AVAILABLE(ios(16.0))
{
  UITextRange *selectedTextRange = self.selectedTextRange;

  // Return CGRectNull when there's no valid selection; UIKit falls back to the default (sourcePoint).
  if (selectedTextRange == nil || selectedTextRange.empty) {
    return CGRectNull;
  }

  // selectionRectsForRange: returns an array of rects spanning every line of the selection; the
  // union of these gives the full selection frame.
  // firstRectForRange: only returns the first line's rect for a multi-line selection, so
  // positioning the menu off it would overlap the selection lines below it and block the trailing handle.
  NSArray<UITextSelectionRect *> *selectionRects = [self selectionRectsForRange:selectedTextRange];

  // Fall back to firstRectForRange when there are no selection rects.
  if (selectionRects.count == 0) {
    CGRect fallback = [self firstRectForRange:selectedTextRange];
    return CGRectIsNull(fallback) || CGRectIsEmpty(fallback) || CGRectIsInfinite(fallback) ? CGRectNull : fallback;
  }

  CGRect unionRect = CGRectNull;
  for (UITextSelectionRect *selectionRect in selectionRects) {
    CGRect rect = selectionRect.rect;
    // Skip invalid rects, to avoid polluting the union.
    if (CGRectIsNull(rect) || CGRectIsEmpty(rect) || CGRectIsInfinite(rect)) {
      continue;
    }
    unionRect = CGRectIsNull(unionRect) ? rect : CGRectUnion(unionRect, rect);
  }

  // Fall back to firstRectForRange when the union is invalid.
  if (CGRectIsNull(unionRect) || CGRectIsEmpty(unionRect) || CGRectIsInfinite(unionRect)) {
    CGRect fallback = [self firstRectForRange:selectedTextRange];
    return CGRectIsNull(fallback) || CGRectIsEmpty(fallback) || CGRectIsInfinite(fallback) ? CGRectNull : fallback;
  }

  return unionRect;
}

// editMenuInteraction:didEndForConfiguration fires when the system menu is dismissed.
// The system menu auto-dismisses when the user taps blank space or another bubble; at that point
// the selection is cleared, giving the behavior "menu gone means selection exited".
// This is more reliable than FlatList's onTouchStart — a FlatList's touch doesn't always bubble up
// to the parent View.
- (void)editMenuInteraction:(UIEditMenuInteraction *)interaction
  didEndForConfiguration:(UIEditMenuConfiguration *)configuration API_AVAILABLE(ios(16.0))
{
  [self clearTextSelection];
}

// Assemble the system menu items and the custom menu items passed from JS in one place, so
// different entry points don't produce inconsistent menu behavior.
- (UIMenu *)menuWithSuggestedActions:(NSArray<UIMenuElement *> *)suggestedActions
                       selectedRange:(NSRange)selectedRange API_AVAILABLE(ios(16.0))
{
  NSMutableArray<UIMenuElement *> *children =
      self.showSystemMenuItems ? [suggestedActions mutableCopy] : [NSMutableArray new];

  // If system menu items are kept but UIKit didn't provide suggestedActions, build the menu starting
  // from an empty array.
  if (children == nil) {
    children = [NSMutableArray new];
  }

  NSArray<UIMenuElement *> *customActions = [self customMenuActionsForSelectedRange:selectedRange];

  // If JS passed in usable menu items, append the custom items to the end of the current menu list.
  if (customActions.count > 0) {
    [children addObjectsFromArray:customActions];
  }

  return [UIMenu menuWithChildren:children];
}

// Convert JS menuItems into UIKit UIActions; on tap, report back the currently selected text and range.
- (NSArray<UIMenuElement *> *)customMenuActionsForSelectedRange:(NSRange)range API_AVAILABLE(ios(16.0))
{
  NSMutableArray<UIMenuElement *> *actions = [NSMutableArray new];
  __weak RCTSelectableRichTextView *weakSelf = self;

  for (NSDictionary *item in self.menuItems) {
    NSString *itemId = [item[@"id"] isKindOfClass:[NSString class]] ? item[@"id"] : nil;
    NSString *title = [item[@"title"] isKindOfClass:[NSString class]] ? item[@"title"] : nil;

    // Skip menu items missing an id or title, to avoid UIKit creating an unrecognizable action.
    if (itemId.length == 0 || title.length == 0) {
      continue;
    }

    UIAction *action = [UIAction actionWithTitle:title
                                           image:nil
                                      identifier:itemId
                                         handler:^(__unused UIAction *selectedAction) {
                                           // Read the latest selection at the moment the menu item
                                           // is tapped, ensuring the range is reported correctly
                                           // after handles have been dragged.
                                           [weakSelf handleCustomMenuItem:item selectedRange:range];
                                         }];
    [actions addObject:action];
  }

  return actions;
}

// Handle a custom menu tap: send the action id, title, selected text, and selection range to JS.
- (void)handleCustomMenuItem:(NSDictionary *)item selectedRange:(NSRange)fallbackRange
{
  // If JS isn't listening to onMenuAction, just dismiss the native menu action without doing anything else.
  if (!self.onMenuAction) {
    return;
  }

  NSRange selectedRange = [self validSelectedRangeWithFallbackRange:fallbackRange];

  // Don't send a menu event to JS without text context if the current selection is invalid.
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

  // Clear the selection (if configured) only after the menu callback has been sent to JS, so the
  // app side can still read the final selection at tap time.
  if (self.clearSelectionOnMenuAction) {
    [self clearTextSelection];
  }
}

// Get the valid selection at the moment the menu is tapped; if the current selectedRange isn't
// usable, fall back to the range captured when the menu was created.
- (NSRange)validSelectedRangeWithFallbackRange:(NSRange)fallbackRange
{
  NSRange selectedRange = self.selectedRange;
  NSUInteger textLength = self.text.length;

  // If the current selectedRange is already out of bounds, use the range UIKit provided when it
  // generated the menu.
  if (selectedRange.location == NSNotFound || NSMaxRange(selectedRange) > textLength || selectedRange.length == 0) {
    selectedRange = fallbackRange;
  }

  // If fallbackRange isn't usable either, return NSNotFound to indicate there's no actionable selection.
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

// Return the selectable state as recorded by RN, keeping it consistent with UITextView's isSelectable getter.
- (BOOL)isSelectable
{
  return _rnSelectable;
}

- (void)setTextStorage:(NSTextStorage *)textStorage
{
  // Set via attributedText; UITextView builds its internal TextKit pipeline on its own
  self.attributedText = textStorage;

  // Ensure layoutManager's usesFontLeading matches the ShadowView measurement
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
