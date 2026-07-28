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

// setTextStorage 把 Fabric Paragraph state 转换得到的 NSTextStorage 设置到 UITextView，
// 是 RCTSelectableRichTextComponentView 唯一的文本内容入口。
- (void)setTextStorage:(NSTextStorage *)textStorage;

// selectTextRangeWithStart 选中指定 UTF-16 范围并弹出系统选区菜单。
- (void)selectTextRangeWithStart:(NSInteger)start end:(NSInteger)end;

// selectParagraphAtPoint 根据本地坐标命中长按所在段落，选中段落并弹出系统选区菜单。
// point 是相对 SelectableRichText 左上角的本地坐标，由宿主 Pressable 的 locationX/locationY 转换得到。
- (void)selectParagraphAtPoint:(CGPoint)point;

- (void)clearTextSelection;
- (void)copyTextRangeWithStart:(NSInteger)start end:(NSInteger)end;

@end

NS_ASSUME_NONNULL_END
