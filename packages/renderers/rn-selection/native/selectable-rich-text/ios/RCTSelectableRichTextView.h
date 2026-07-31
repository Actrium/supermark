#import <UIKit/UIKit.h>

#import <React/RCTComponent.h>

NS_ASSUME_NONNULL_BEGIN

@interface RCTSelectableRichTextView : UITextView

@property (nonatomic, assign, getter=isSelectable) BOOL selectable;
@property (nonatomic, copy, nullable) NSArray<NSDictionary *> *menuItems;
@property (nonatomic, assign) BOOL showSystemMenuItems;
@property (nonatomic, assign) BOOL clearSelectionOnMenuAction;
@property (nonatomic, copy, nullable) RCTDirectEventBlock onMenuAction;
@property (nonatomic, copy, nullable) RCTDirectEventBlock onTextLongPress;

// setTextStorage sets the NSTextStorage converted from the Fabric Paragraph state onto the
// UITextView, and is RCTSelectableRichTextComponentView's sole entry point for text content.
- (void)setTextStorage:(NSTextStorage *)textStorage;

// selectTextRangeWithStart selects the given UTF-16 range and shows the system selection menu.
- (void)selectTextRangeWithStart:(NSInteger)start end:(NSInteger)end;

// selectParagraphAtPoint hit-tests the paragraph at the local coordinates, selects it, then shows
// the system selection menu.
// point is the local coordinate relative to SelectableRichText's top-left corner, converted from
// the host Pressable's locationX/locationY.
- (void)selectParagraphAtPoint:(CGPoint)point;

- (void)clearTextSelection;
- (void)copyTextRangeWithStart:(NSInteger)start end:(NSInteger)end;

@end

NS_ASSUME_NONNULL_END
