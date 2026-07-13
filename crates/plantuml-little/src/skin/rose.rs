// skin::rose - The Rose theme (default PlantUML skin)
// Port of Java PlantUML's skin.rose package (26 files)
//
// Defines rendering constants, size calculations, and drawing instructions
// for all sequence diagram components: arrows, participants, notes,
// dividers, grouping headers, lifelines, activation boxes, etc.

use crate::klimt::color::HColor;
use crate::klimt::geom::{XDimension2D, XPoint2D};
use crate::klimt::shape::UPath;
use crate::klimt::svg::SvgGraphic;
use crate::klimt::{Fashion, UStroke};
use crate::model::sequence::ParticipantKind;
use crate::skin::actor::ActorStickMan;
use crate::skin::arrow::{
    ArrowConfiguration, ArrowDecoration, ArrowDirection, ArrowHead, ArrowPart,
};

// ── Rose constants ──────────────────────────────────────────────────

/// Padding X used by the Rose factory. Java: `Rose.paddingX = 5`
pub const ROSE_PADDING_X: f64 = 5.0;
/// Padding Y used by the Rose factory. Java: `Rose.paddingY = 5`
pub const ROSE_PADDING_Y: f64 = 5.0;

/// Note fold corner size. Java: `ComponentRoseNote.FOLD = 8`
pub const NOTE_FOLD: f64 = 8.0;
/// Note text inner padding. Java: `ComponentRoseNote.marginY1 = 6`
pub const NOTE_PADDING: f64 = 6.0;
/// Note background color. Java: Rose default `#FEFFDD`
pub const NOTE_BG: &str = "#FEFFDD";
/// Note border color. Java: Rose default `#181818`
pub const NOTE_BORDER: &str = "#181818";

/// Default border/stroke color. Java: `#181818`
pub const BORDER_COLOR: &str = "#181818";
/// Default entity background. Java: `#F1F1F1`
pub const ENTITY_BG: &str = "#F1F1F1";
/// Default participant background. Java: `#E2E2F0`
pub const PARTICIPANT_BG: &str = "#E2E2F0";

/// Sequence diagram: note fold is 10 (not 8) for the sequence note variant.
/// Java: `ComponentRoseNoteBox.FOLD = 10` (approximate)
pub const SEQ_NOTE_FOLD: f64 = 10.0;

/// Default text color. Java: `#000000`
pub const TEXT_COLOR: &str = "#000000";
/// Legend background. Java: `#DDDDDD`
pub const LEGEND_BG: &str = "#DDDDDD";
/// Legend border color. Java: `#000000`
pub const LEGEND_BORDER: &str = "#000000";
/// Group background color. Java: `#EEEEEE`
pub const GROUP_BG: &str = "#EEEEEE";
/// Activation box background. Java: `#FFFFFF`
pub const ACTIVATION_BG: &str = "#FFFFFF";
/// Destroy cross color. Java: `#A80036`
pub const DESTROY_COLOR: &str = "#A80036";
/// Divider line color. Java: `#888888`
pub const DIVIDER_COLOR: &str = "#888888";
/// Fork/join bar fill. Java: activityBar BackGroundColor = #555555
pub const FORK_FILL: &str = "#555555";
/// Initial/start state fill. Java: `#222222`
pub const INITIAL_FILL: &str = "#222222";

// ── Area ────────────────────────────────────────────────────────────

/// The available area for a component to draw into.
/// Java: `skin.Area`
#[derive(Debug, Clone)]
pub struct Area {
    pub dimension: XDimension2D,
    pub delta_x1: f64,
    pub text_delta_x: f64,
    pub level: i32,
    pub live_delta_size: f64,
}

impl Area {
    pub fn new(width: f64, height: f64) -> Self {
        Self {
            dimension: XDimension2D::new(width, height),
            delta_x1: 0.0,
            text_delta_x: 0.0,
            level: 0,
            live_delta_size: 0.0,
        }
    }

    pub fn from_dim(dim: XDimension2D) -> Self {
        Self::new(dim.width, dim.height)
    }

    pub fn with_delta_x1(mut self, dx: f64) -> Self {
        self.delta_x1 = dx;
        self
    }

    pub fn with_text_delta_x(mut self, dx: f64) -> Self {
        self.text_delta_x = dx;
        self
    }
}

// ── TextMetrics: simulates AbstractTextualComponent text sizing ─────

/// Holds the text-related dimensions computed by a component.
/// Mirrors Java's `AbstractTextualComponent` margin/text dimension logic.
#[derive(Debug, Clone)]
pub struct TextMetrics {
    /// Left margin (Java: marginX1)
    pub margin_x1: f64,
    /// Right margin (Java: marginX2)
    pub margin_x2: f64,
    /// Vertical margin (Java: marginY)
    pub margin_y: f64,
    /// Pure text width (from StringBounder)
    pub pure_text_width: f64,
    /// Text height (from StringBounder)
    pub text_height: f64,
}

impl TextMetrics {
    /// Compute text metrics. Java equivalent of `AbstractTextualComponent` constructor
    /// params: marginX1, marginX2, marginY, plus text measurement.
    pub fn new(
        margin_x1: f64,
        margin_x2: f64,
        margin_y: f64,
        text_width: f64,
        text_height: f64,
    ) -> Self {
        Self {
            margin_x1,
            margin_x2,
            margin_y,
            pure_text_width: text_width,
            text_height,
        }
    }

    /// Total text width including margins. Java: `getTextWidth()`
    pub fn text_width(&self) -> f64 {
        self.pure_text_width + self.margin_x1 + self.margin_x2
    }

    /// Total text height including margins. Java: `getTextHeight()`
    pub fn text_height(&self) -> f64 {
        self.text_height + 2.0 * self.margin_y
    }
}

// ══════════════════════════════════════════════════════════════════════
// Component size calculations
// ══════════════════════════════════════════════════════════════════════

// ── Arrow constants (AbstractComponentRoseArrow) ────────────────────

/// Arrow head delta X. Java: `AbstractComponentRoseArrow.arrowDeltaX = 10`
pub const ARROW_DELTA_X: f64 = 10.0;
/// Arrow head delta Y. Java: `AbstractComponentRoseArrow.arrowDeltaY = 4`
pub const ARROW_DELTA_Y: f64 = 4.0;
/// Arrow component padding Y. Java: `AbstractComponentRoseArrow.getPaddingY() = 4`
pub const ARROW_PADDING_Y: f64 = 4.0;
/// Arrow component padding X. Java: inherited `Rose.paddingX = 5`
pub const ARROW_PADDING_X: f64 = 5.0;

/// Cross X spacing. Java: `ComponentRoseArrow.spaceCrossX = 6`
pub const SPACE_CROSS_X: f64 = 6.0;
/// Circle decoration diameter. Java: `ComponentRoseArrow.diamCircle = 8`
pub const DIAM_CIRCLE: f64 = 8.0;
/// Circle decoration stroke. Java: `ComponentRoseArrow.thinCircle = 1.5`
pub const THIN_CIRCLE: f64 = 1.5;

// ── Self-arrow constants ────────────────────────────────────────────

/// Self-arrow width. Java: `ComponentRoseSelfArrow.arrowWidth = 45`
pub const SELF_ARROW_WIDTH: f64 = 45.0;
/// Self-arrow x-right. Java: `ComponentRoseSelfArrow.xRight = arrowWidth - 3 = 42`
pub const SELF_ARROW_XRIGHT: f64 = 42.0;
/// Self-arrow internal height. Java: `getArrowOnlyHeight() = 13`
pub const SELF_ARROW_ONLY_HEIGHT: f64 = 13.0;

// ── Destroy constants ───────────────────────────────────────────────

/// Destroy cross half-size. Java: `ComponentRoseDestroy.crossSize = 9`
pub const DESTROY_CROSS_SIZE: f64 = 9.0;

// ── Grouping constants ──────────────────────────────────────────────

/// Corner size for grouping header/reference. Java: `cornersize = 10`
pub const CORNER_SIZE: f64 = 10.0;
/// Grouping space default. Java: `ComponentRoseGroupingSpace(7)`
pub const GROUPING_SPACE_HEIGHT: f64 = 7.0;

// ── Reference constants ─────────────────────────────────────────────

/// Reference frame footer height. Java: `heightFooter = 5`
pub const REF_HEIGHT_FOOTER: f64 = 5.0;
/// Reference frame x margin. Java: `xMargin = 2`
pub const REF_X_MARGIN: f64 = 2.0;

// ── Active line width ───────────────────────────────────────────────

/// Active line box width. Java: `ComponentRoseActiveLine.getPreferredWidth() = 10`
pub const ACTIVE_LINE_WIDTH: f64 = 10.0;

// ── Participant ─────────────────────────────────────────────────────

/// Delta for collections offset. Java: `getDeltaCollection() = 4`
pub const COLLECTIONS_DELTA: f64 = 4.0;

/// Icon width for Boundary kind. Java: 2*radius(12) + left(17) + 2*margin(4)
const BOUNDARY_ICON_WIDTH: f64 = 49.0;
/// Icon width for Control kind. Java: 2*radius(12) + 2*margin(4)
const CONTROL_ICON_WIDTH: f64 = 32.0;
/// Icon width for Entity kind. Java: 2*radius(12) + 2*margin(4)
const ENTITY_ICON_WIDTH: f64 = 32.0;
/// Icon width for Database kind. Java: empty(16) + margin_x(10+10)
const DATABASE_ICON_WIDTH: f64 = 36.0;
/// Margin X for non-default participant types. Java: marginX in Component classes
const ICON_MARGIN_X: f64 = 3.0;
/// Queue USymbol margin left. Java: x1 = 5
const QUEUE_MARGIN_LEFT: f64 = 5.0;
/// Queue USymbol margin right. Java: x2 = 15
const QUEUE_MARGIN_RIGHT: f64 = 15.0;

// ══════════════════════════════════════════════════════════════════════
// Size calculation functions
// ══════════════════════════════════════════════════════════════════════

/// Preferred size for a normal (non-self) arrow.
/// Java: `ComponentRoseArrow.getPreferredWidth/Height`
pub fn arrow_preferred_size(
    text: &TextMetrics,
    inclination1: f64,
    inclination2: f64,
) -> XDimension2D {
    let w = text.text_width() + ARROW_DELTA_X;
    let h =
        text.text_height() + ARROW_DELTA_Y + 2.0 * ARROW_PADDING_Y + inclination1 + inclination2;
    XDimension2D::new(w, h)
}

/// Preferred size for a self-arrow.
/// Java: `ComponentRoseSelfArrow.getPreferredWidth/Height`
pub fn self_arrow_preferred_size(text: &TextMetrics) -> XDimension2D {
    let w = f64::max(text.text_width(), SELF_ARROW_WIDTH + 5.0);
    let h = text.text_height() + ARROW_DELTA_Y + SELF_ARROW_ONLY_HEIGHT + 2.0 * ARROW_PADDING_Y;
    XDimension2D::new(w, h)
}

/// Y point for normal arrow. Java: `ComponentRoseArrow.getYPoint`
pub fn arrow_y_point(text: &TextMetrics, below_for_response: bool) -> f64 {
    if below_for_response {
        ARROW_PADDING_Y
    } else {
        text.text_height() + ARROW_PADDING_Y
    }
}

/// Y point for self-arrow. Java: `ComponentRoseSelfArrow.getYPoint`
/// Note: Java uses `getPaddingX() = 0` here (NOT `ARROW_PADDING_X`).
pub fn self_arrow_y_point(text: &TextMetrics) -> f64 {
    let text_h = text.text_height();
    let text_and_arrow_h = text_h + SELF_ARROW_ONLY_HEIGHT;
    (text_h + text_and_arrow_h) / 2.0
}

/// Start/end points for a normal arrow.
/// Java: `ComponentRoseArrow.getStartPoint/getEndPoint`
pub fn arrow_start_point(
    text: &TextMetrics,
    dim: XDimension2D,
    direction: ArrowDirection,
    below_for_response: bool,
    inclination2: f64,
) -> XPoint2D {
    let y = arrow_y_point(text, below_for_response);
    if direction == ArrowDirection::LeftToRight {
        XPoint2D::new(ARROW_PADDING_X, y + inclination2)
    } else {
        XPoint2D::new(dim.width + ARROW_PADDING_X, y + inclination2)
    }
}

pub fn arrow_end_point(
    text: &TextMetrics,
    dim: XDimension2D,
    direction: ArrowDirection,
    below_for_response: bool,
) -> XPoint2D {
    let y = arrow_y_point(text, below_for_response);
    if direction == ArrowDirection::LeftToRight {
        XPoint2D::new(dim.width + ARROW_PADDING_X, y)
    } else {
        XPoint2D::new(ARROW_PADDING_X, y)
    }
}

/// Start/end points for a self-arrow.
/// Java: `ComponentRoseSelfArrow.getStartPoint/getEndPoint`
pub fn self_arrow_start_point(text: &TextMetrics) -> XPoint2D {
    let text_h = text.text_height();
    XPoint2D::new(ARROW_PADDING_X, text_h + ARROW_PADDING_Y)
}

pub fn self_arrow_end_point(text: &TextMetrics) -> XPoint2D {
    let text_h = text.text_height();
    let text_and_arrow_h = text_h + SELF_ARROW_ONLY_HEIGHT;
    XPoint2D::new(ARROW_PADDING_X, text_and_arrow_h + ARROW_PADDING_Y)
}

/// Preferred size for a participant box.
/// Java: `ComponentRoseParticipant.getPreferredWidth/Height`
pub fn participant_preferred_size(
    text: &TextMetrics,
    delta_shadow: f64,
    collections: bool,
    padding: f64,
    min_width: f64,
) -> XDimension2D {
    let delta_coll = if collections { COLLECTIONS_DELTA } else { 0.0 };
    let pure = f64::max(text.pure_text_width, min_width);
    let tw = pure + text.margin_x1 + text.margin_x2;
    let w = tw + delta_shadow + delta_coll + 2.0 * padding;
    let h = text.text_height() + delta_shadow + 1.0 + delta_coll;
    XDimension2D::new(w, h)
}

/// Compute participant preferred width per kind, matching Java per-Component classes.
/// Each participant kind has its own `getPreferredWidth()` in Java with different margins
/// and icon dimensions.
///
/// - `kind`: the participant kind
/// - `pure_text_width`: measured text width (no margins)
/// - `thickness`: stroke thickness (Java default = 1.5 for sequence participants)
pub fn participant_preferred_width(
    kind: &ParticipantKind,
    pure_text_width: f64,
    thickness: f64,
) -> f64 {
    match kind {
        ParticipantKind::Default => pure_text_width + 2.0 * 7.0,
        ParticipantKind::Actor => {
            let icon_w = ActorStickMan::new(false).preferred_width(thickness);
            let text_w = pure_text_width + 2.0 * ICON_MARGIN_X;
            icon_w.max(text_w)
        }
        ParticipantKind::Boundary => BOUNDARY_ICON_WIDTH.max(pure_text_width + 2.0 * ICON_MARGIN_X),
        ParticipantKind::Control => CONTROL_ICON_WIDTH.max(pure_text_width + 2.0 * ICON_MARGIN_X),
        ParticipantKind::Entity => ENTITY_ICON_WIDTH.max(pure_text_width + 2.0 * ICON_MARGIN_X),
        ParticipantKind::Database => DATABASE_ICON_WIDTH.max(pure_text_width + 2.0 * ICON_MARGIN_X),
        ParticipantKind::Collections => pure_text_width + 2.0 * 7.0 + COLLECTIONS_DELTA,
        ParticipantKind::Queue => pure_text_width + QUEUE_MARGIN_LEFT + QUEUE_MARGIN_RIGHT,
    }
}

/// Preferred size for a note.
/// Java: `ComponentRoseNote.getPreferredWidth/Height`
pub fn note_preferred_size(
    text: &TextMetrics,
    padding_x: f64,
    padding_y: f64,
    delta_shadow: f64,
) -> XDimension2D {
    let w = text.text_width() + 2.0 * padding_x + delta_shadow;
    let h = text.text_height() + 2.0 * padding_y + delta_shadow;
    XDimension2D::new(w, h)
}

/// Preferred size for a note box.
/// Java: `ComponentRoseNoteBox.getPreferredWidth/Height`
pub fn note_box_preferred_size(text: &TextMetrics) -> XDimension2D {
    let px = 5.0;
    let py = 5.0;
    let w = text.text_width() + 2.0 * px;
    let h = text.text_height() + 2.0 * py;
    XDimension2D::new(w, h)
}

/// Preferred size for a hexagonal note.
/// Java: `ComponentRoseNoteHexagonal.getPreferredWidth/Height`
pub fn note_hexagonal_preferred_size(text: &TextMetrics) -> XDimension2D {
    let px = 5.0;
    let py = 5.0;
    let w = text.text_width() + 2.0 * px;
    let h = text.text_height() + 2.0 * py;
    XDimension2D::new(w, h)
}

/// Preferred size for a divider.
/// Java: `ComponentRoseDivider.getPreferredWidth/Height`
pub fn divider_preferred_size(text: &TextMetrics) -> XDimension2D {
    let w = text.text_width() + 30.0;
    let h = text.text_height() + 20.0;
    XDimension2D::new(w, h)
}

/// Preferred size for a grouping header.
/// Java: `ComponentRoseGroupingHeader.getPreferredWidth/Height`
pub fn grouping_header_preferred_size(
    text: &TextMetrics,
    comment_width: f64,
    comment_height: f64,
    padding_y: f64,
) -> XDimension2D {
    let supp_h = if comment_height > 15.0 {
        comment_height - 15.0
    } else {
        0.0
    };
    let sup = if comment_width > 0.0 {
        text.margin_x1 + comment_width
    } else {
        0.0
    };
    let w = text.text_width() + sup;
    let h = text.text_height() + 2.0 * padding_y + supp_h;
    XDimension2D::new(w, h)
}

/// Preferred size for a grouping else.
/// Java: `ComponentRoseGroupingElse.getPreferredWidth/Height`
pub fn grouping_else_preferred_size(text: &TextMetrics, teoz: bool) -> XDimension2D {
    let w = text.text_width();
    let h = if teoz {
        text.text_height() + 16.0
    } else {
        text.text_height()
    };
    XDimension2D::new(w, h)
}

/// Preferred size for grouping space.
/// Java: `ComponentRoseGroupingSpace.getPreferredWidth/Height`
pub fn grouping_space_preferred_size() -> XDimension2D {
    XDimension2D::new(0.0, GROUPING_SPACE_HEIGHT)
}

/// Preferred size for a reference.
/// Java: `ComponentRoseReference.getPreferredWidth/Height`
pub fn reference_preferred_size(
    text: &TextMetrics,
    header_width: f64,
    header_height: f64,
    delta_shadow: f64,
) -> XDimension2D {
    let w = f64::max(text.text_width(), header_width) + REF_X_MARGIN * 2.0 + delta_shadow;
    let h = text.text_height() + header_height + REF_HEIGHT_FOOTER;
    XDimension2D::new(w, h)
}

/// Header width for reference. Java: `getHeaderWidth = headerDim.width + 30 + 15`
pub fn reference_header_width(header_text_width: f64) -> f64 {
    header_text_width + 30.0 + 15.0
}

/// Header height for reference. Java: `getHeaderHeight = headerDim.height + 2`
pub fn reference_header_height(header_text_height: f64) -> f64 {
    header_text_height + 2.0
}

/// Preferred size for a lifeline.
/// Java: `ComponentRoseLine.getPreferredWidth/Height`
pub fn line_preferred_size() -> XDimension2D {
    XDimension2D::new(1.0, 20.0)
}

/// Preferred size for an activation box.
/// Java: `ComponentRoseActiveLine.getPreferredWidth/Height`
pub fn active_line_preferred_size() -> XDimension2D {
    XDimension2D::new(ACTIVE_LINE_WIDTH, 0.0)
}

/// Preferred size for a destroy cross.
/// Java: `ComponentRoseDestroy.getPreferredWidth/Height`
pub fn destroy_preferred_size() -> XDimension2D {
    let s = DESTROY_CROSS_SIZE * 2.0;
    XDimension2D::new(s, s)
}

/// Preferred size for a delay line.
/// Java: `ComponentRoseDelayLine.getPreferredWidth/Height`
pub fn delay_line_preferred_size() -> XDimension2D {
    XDimension2D::new(1.0, 20.0)
}

/// Preferred size for delay text.
/// Java: `ComponentRoseDelayText.getPreferredWidth/Height`
pub fn delay_text_preferred_size(text: &TextMetrics) -> XDimension2D {
    let w = text.pure_text_width;
    let h = text.text_height() + 20.0;
    XDimension2D::new(w, h)
}

/// Preferred size for a newpage line.
/// Java: `ComponentRoseNewpage.getPreferredWidth/Height`
pub fn newpage_preferred_size() -> XDimension2D {
    XDimension2D::new(0.0, 1.0)
}

/// Preferred size for an englober (box around participants).
/// Java: `ComponentRoseEnglober.getPreferredWidth/Height`
pub fn englober_preferred_size(text: &TextMetrics) -> XDimension2D {
    let w = text.text_width();
    let h = text.text_height() + 3.0;
    XDimension2D::new(w, h)
}

// ══════════════════════════════════════════════════════════════════════
// Drawing functions - write directly into SvgGraphic
// ══════════════════════════════════════════════════════════════════════

/// Build the polygon for a normal arrow head (pointing right).
/// Java: `ComponentRoseArrow.getPolygonNormal`
pub fn polygon_normal(part: ArrowPart, nice_arrow: bool) -> Vec<(f64, f64)> {
    match part {
        ArrowPart::TopPart => {
            vec![
                (-ARROW_DELTA_X, -ARROW_DELTA_Y),
                (0.0, 0.0),
                (-ARROW_DELTA_X, 0.0),
            ]
        }
        ArrowPart::BottomPart => {
            vec![
                (-ARROW_DELTA_X, 0.0),
                (0.0, 0.0),
                (-ARROW_DELTA_X, ARROW_DELTA_Y),
            ]
        }
        ArrowPart::Full => {
            let mut pts = vec![
                (-ARROW_DELTA_X, -ARROW_DELTA_Y),
                (0.0, 0.0),
                (-ARROW_DELTA_X, ARROW_DELTA_Y),
            ];
            if nice_arrow {
                pts.push((-ARROW_DELTA_X + 4.0, 0.0));
            }
            pts
        }
    }
}

/// Build the polygon for a reverse arrow head (pointing left).
/// Java: `ComponentRoseArrow.getPolygonReverse`
pub fn polygon_reverse(part: ArrowPart, nice_arrow: bool) -> Vec<(f64, f64)> {
    match part {
        ArrowPart::TopPart => {
            vec![
                (ARROW_DELTA_X, -ARROW_DELTA_Y),
                (0.0, 0.0),
                (ARROW_DELTA_X, 0.0),
            ]
        }
        ArrowPart::BottomPart => {
            vec![
                (ARROW_DELTA_X, 0.0),
                (0.0, 0.0),
                (ARROW_DELTA_X, ARROW_DELTA_Y),
            ]
        }
        ArrowPart::Full => {
            let mut pts = vec![
                (ARROW_DELTA_X, -ARROW_DELTA_Y),
                (0.0, 0.0),
                (ARROW_DELTA_X, ARROW_DELTA_Y),
            ];
            if nice_arrow {
                pts.push((ARROW_DELTA_X - 4.0, 0.0));
            }
            pts
        }
    }
}

/// Build the polygon for a self-arrow head.
/// Java: `ComponentRoseSelfArrow.getPolygon`
pub fn polygon_self(config: &ArrowConfiguration, nice_arrow: bool) -> Vec<(f64, f64)> {
    let direction: f64 = if config.is_reverse_define() {
        -1.0
    } else {
        1.0
    };
    let x = direction * ARROW_DELTA_X;
    match config.part() {
        ArrowPart::TopPart => {
            vec![(x - 1.0, -ARROW_DELTA_Y), (-1.0, 0.0), (x - 1.0, 0.0)]
        }
        ArrowPart::BottomPart => {
            vec![(x - 1.0, 0.0), (-1.0, 0.0), (x - 1.0, ARROW_DELTA_Y)]
        }
        ArrowPart::Full => {
            let mut pts = vec![(x, -ARROW_DELTA_Y), (0.0, 0.0), (x, ARROW_DELTA_Y)];
            if nice_arrow {
                pts.push((x - direction * 4.0, 0.0));
            }
            pts
        }
    }
}

/// Draw a normal (non-self) arrow into an SvgGraphic.
/// Java: `ComponentRoseArrow.drawInternalU`
pub fn draw_arrow(
    sg: &mut SvgGraphic,
    config: &ArrowConfiguration,
    text: &TextMetrics,
    area: &Area,
    fg_color: &HColor,
    bg_color: &HColor,
    stroke: &UStroke,
    nice_arrow: bool,
    below_for_response: bool,
    inclination1: f64,
    inclination2: f64,
) {
    if config.is_hidden() {
        return;
    }
    let dim = area.dimension;

    let dressing1 = config.dressing1();
    let dressing2 = config.dressing2();

    let mut start = 0.0;
    let mut len = dim.width - 1.0;
    let _len_full = dim.width;

    let pos1 = start + 1.0;
    let pos2 = len - 1.0;

    // Decoration adjustments
    if config.decoration2() == ArrowDecoration::Circle {
        if dressing2.head == ArrowHead::None {
            len -= DIAM_CIRCLE / 2.0;
        }
        if dressing2.head != ArrowHead::None {
            len -= DIAM_CIRCLE / 2.0 + THIN_CIRCLE;
        }
    }
    if config.decoration1() == ArrowDecoration::Circle {
        if dressing1.head == ArrowHead::None {
            start += DIAM_CIRCLE / 2.0;
            len -= DIAM_CIRCLE / 2.0;
        }
        if dressing1.head == ArrowHead::Async {
            start += DIAM_CIRCLE / 2.0 + THIN_CIRCLE;
            len -= DIAM_CIRCLE / 2.0 + THIN_CIRCLE;
        }
        if dressing1.head == ArrowHead::Normal {
            start += DIAM_CIRCLE / 2.0 + THIN_CIRCLE;
            len -= DIAM_CIRCLE / 2.0 + THIN_CIRCLE;
        }
    }

    if dressing2.head == ArrowHead::Normal {
        len -= ARROW_DELTA_X / 2.0;
    }
    if dressing1.head == ArrowHead::Normal {
        start += ARROW_DELTA_X / 2.0;
        len -= ARROW_DELTA_X / 2.0;
    }
    if dressing2.head == ArrowHead::CrossX {
        len -= 2.0 * SPACE_CROSS_X;
    }
    if dressing1.head == ArrowHead::CrossX {
        start += 2.0 * SPACE_CROSS_X;
        len -= 2.0 * SPACE_CROSS_X;
    }

    let is_below = below_for_response && config.is_reverse_define();
    let pos_arrow = if is_below { 0.0 } else { text.text_height() };

    // Main line
    let line_stroke = if config.is_dotted() {
        UStroke::new(5.0, 5.0, stroke.thickness)
    } else {
        stroke.clone()
    };

    if inclination1 == 0.0 && inclination2 == 0.0 {
        sg.set_stroke_color(Some(&fg_color.to_svg()));
        sg.set_stroke_width(line_stroke.thickness, line_stroke.dasharray_svg());
        sg.svg_line(start, pos_arrow, start + len, pos_arrow, 0.0);
    }

    // Dressing2 (right end) - normal arrow head
    if dressing2.head == ArrowHead::Normal {
        let poly = polygon_normal(ArrowPart::Full, nice_arrow);
        sg.set_fill_color(&fg_color.to_svg());
        sg.set_stroke_color(Some(&fg_color.to_svg()));
        sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
        let flat: Vec<f64> = poly
            .iter()
            .flat_map(|&(x, y)| [pos2 + x, pos_arrow + inclination2 + y])
            .collect();
        sg.svg_polygon(0.0, &flat);
    } else if dressing2.head == ArrowHead::Async {
        if config.part() != ArrowPart::BottomPart {
            sg.set_stroke_color(Some(&fg_color.to_svg()));
            sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
            sg.svg_line(
                pos2,
                pos_arrow + inclination2,
                pos2 - ARROW_DELTA_X,
                pos_arrow + inclination2 - ARROW_DELTA_Y,
                0.0,
            );
        }
        if config.part() != ArrowPart::TopPart {
            sg.set_stroke_color(Some(&fg_color.to_svg()));
            sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
            sg.svg_line(
                pos2,
                pos_arrow + inclination2,
                pos2 - ARROW_DELTA_X,
                pos_arrow + inclination2 + ARROW_DELTA_Y,
                0.0,
            );
        }
    } else if dressing2.head == ArrowHead::CrossX {
        let x_stroke = UStroke::with_thickness(2.0);
        sg.set_stroke_color(Some(&fg_color.to_svg()));
        sg.set_stroke_width(x_stroke.thickness, x_stroke.dasharray_svg());
        let x0 = pos2 - SPACE_CROSS_X - ARROW_DELTA_X;
        let y0 = pos_arrow + inclination2 - ARROW_DELTA_X / 2.0;
        sg.svg_line(x0, y0, x0 + ARROW_DELTA_X, y0 + ARROW_DELTA_X, 0.0);
        let y1 = pos_arrow + inclination2 + ARROW_DELTA_X / 2.0;
        sg.svg_line(x0, y1, x0 + ARROW_DELTA_X, y1 - ARROW_DELTA_X, 0.0);
    }

    // Dressing1 (left end) - reverse arrow head
    if dressing1.head == ArrowHead::Normal {
        let poly = polygon_reverse(ArrowPart::Full, nice_arrow);
        sg.set_fill_color(&fg_color.to_svg());
        sg.set_stroke_color(Some(&fg_color.to_svg()));
        sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
        let flat: Vec<f64> = poly
            .iter()
            .flat_map(|&(x, y)| [pos1 + x, pos_arrow + inclination1 + y])
            .collect();
        sg.svg_polygon(0.0, &flat);
    } else if dressing1.head == ArrowHead::Async {
        if config.part() != ArrowPart::BottomPart {
            sg.set_stroke_color(Some(&fg_color.to_svg()));
            sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
            sg.svg_line(
                pos1,
                pos_arrow + inclination1,
                pos1 + ARROW_DELTA_X,
                pos_arrow + inclination1 - ARROW_DELTA_Y,
                0.0,
            );
        }
        if config.part() != ArrowPart::TopPart {
            sg.set_stroke_color(Some(&fg_color.to_svg()));
            sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
            sg.svg_line(
                pos1,
                pos_arrow + inclination1,
                pos1 + ARROW_DELTA_X,
                pos_arrow + inclination1 + ARROW_DELTA_Y,
                0.0,
            );
        }
    } else if dressing1.head == ArrowHead::CrossX {
        let x_stroke = UStroke::with_thickness(2.0);
        sg.set_stroke_color(Some(&fg_color.to_svg()));
        sg.set_stroke_width(x_stroke.thickness, x_stroke.dasharray_svg());
        let x0 = pos1 + SPACE_CROSS_X;
        let y0 = pos_arrow + inclination1 - ARROW_DELTA_X / 2.0;
        sg.svg_line(x0, y0, x0 + ARROW_DELTA_X, y0 + ARROW_DELTA_X, 0.0);
        let y1 = pos_arrow + inclination1 + ARROW_DELTA_X / 2.0;
        sg.svg_line(x0, y1, x0 + ARROW_DELTA_X, y1 - ARROW_DELTA_X, 0.0);
    }

    // Decorations (circles)
    if config.decoration1() == ArrowDecoration::Circle {
        let cx = pos1 - DIAM_CIRCLE / 2.0 - THIN_CIRCLE + DIAM_CIRCLE / 2.0;
        let cy =
            pos_arrow + inclination1 - DIAM_CIRCLE / 2.0 - THIN_CIRCLE / 2.0 + DIAM_CIRCLE / 2.0;
        sg.set_fill_color(&bg_color.to_svg());
        sg.set_stroke_color(Some(&fg_color.to_svg()));
        sg.set_stroke_width(THIN_CIRCLE, None);
        sg.svg_ellipse(cx, cy, DIAM_CIRCLE / 2.0, DIAM_CIRCLE / 2.0, 0.0);
    }
    if config.decoration2() == ArrowDecoration::Circle {
        let cx = pos2 - DIAM_CIRCLE / 2.0 + THIN_CIRCLE + DIAM_CIRCLE / 2.0;
        let cy =
            pos_arrow + inclination2 - DIAM_CIRCLE / 2.0 - THIN_CIRCLE / 2.0 + DIAM_CIRCLE / 2.0;
        sg.set_fill_color(&bg_color.to_svg());
        sg.set_stroke_color(Some(&fg_color.to_svg()));
        sg.set_stroke_width(THIN_CIRCLE, None);
        sg.svg_ellipse(cx, cy, DIAM_CIRCLE / 2.0, DIAM_CIRCLE / 2.0, 0.0);
    }
}

/// Draw a self-arrow (right side) into an SvgGraphic.
/// Java: `ComponentRoseSelfArrow.drawRightSide`
pub fn draw_self_arrow(
    sg: &mut SvgGraphic,
    config: &ArrowConfiguration,
    text: &TextMetrics,
    _area: &Area,
    fg_color: &HColor,
    _bg_color: &HColor,
    stroke: &UStroke,
    nice_arrow: bool,
) {
    if config.is_hidden() {
        return;
    }
    let text_height = text.text_height();
    let arrow_height = SELF_ARROW_ONLY_HEIGHT;

    let line_stroke = if config.is_dotted() {
        UStroke::new(5.0, 5.0, stroke.thickness)
    } else {
        stroke.clone()
    };

    let mut x1: f64 = 0.0;
    let mut x2: f64 = 1.0;

    if config.decoration1() == ArrowDecoration::Circle {
        x1 += DIAM_CIRCLE / 2.0 + THIN_CIRCLE + 1.0;
    }
    if config.decoration2() == ArrowDecoration::Circle {
        x2 += DIAM_CIRCLE / 2.0 + THIN_CIRCLE;
    }

    let has_starting_cross = config.dressing1().head == ArrowHead::CrossX;
    if has_starting_cross {
        x1 += 2.0 * SPACE_CROSS_X;
    }

    let has_final_cross = config.dressing2().head == ArrowHead::CrossX;
    if has_final_cross {
        x2 += 2.0 * SPACE_CROSS_X;
    }

    // Three lines forming the self-arrow bracket
    sg.set_stroke_color(Some(&fg_color.to_svg()));
    sg.set_stroke_width(line_stroke.thickness, line_stroke.dasharray_svg());
    // Top horizontal
    sg.svg_line(x1, text_height, SELF_ARROW_XRIGHT, text_height, 0.0);
    // Vertical
    sg.svg_line(
        SELF_ARROW_XRIGHT,
        text_height,
        SELF_ARROW_XRIGHT,
        text_height + arrow_height,
        0.0,
    );
    // Bottom horizontal
    sg.svg_line(
        x2,
        text_height + arrow_height,
        SELF_ARROW_XRIGHT,
        text_height + arrow_height,
        0.0,
    );

    // Arrow head at bottom-left
    if has_final_cross {
        let x_stroke = UStroke::with_thickness(2.0);
        sg.set_stroke_color(Some(&fg_color.to_svg()));
        sg.set_stroke_width(x_stroke.thickness, x_stroke.dasharray_svg());
        let y0 = text_height - ARROW_DELTA_X / 2.0 + arrow_height;
        sg.svg_line(
            SPACE_CROSS_X,
            y0,
            SPACE_CROSS_X + ARROW_DELTA_X,
            y0 + ARROW_DELTA_X,
            0.0,
        );
        let y1 = text_height + ARROW_DELTA_X / 2.0 + arrow_height;
        sg.svg_line(
            SPACE_CROSS_X,
            y1,
            SPACE_CROSS_X + ARROW_DELTA_X,
            y1 - ARROW_DELTA_X,
            0.0,
        );
    } else if config.dressing2().head == ArrowHead::Async {
        if config.part() != ArrowPart::BottomPart {
            sg.set_stroke_color(Some(&fg_color.to_svg()));
            sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
            sg.svg_line(
                x2,
                text_height + arrow_height,
                x2 + ARROW_DELTA_X,
                text_height + arrow_height - ARROW_DELTA_Y,
                0.0,
            );
        }
        if config.part() != ArrowPart::TopPart {
            sg.set_stroke_color(Some(&fg_color.to_svg()));
            sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
            sg.svg_line(
                x2,
                text_height + arrow_height,
                x2 + ARROW_DELTA_X,
                text_height + arrow_height + ARROW_DELTA_Y,
                0.0,
            );
        }
    } else if config.dressing2().head == ArrowHead::Normal {
        let poly = polygon_self(config, nice_arrow);
        sg.set_fill_color(&fg_color.to_svg());
        sg.set_stroke_color(Some(&fg_color.to_svg()));
        sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
        let flat: Vec<f64> = poly
            .iter()
            .flat_map(|&(px, py)| [x2 + px, text_height + arrow_height + py])
            .collect();
        sg.svg_polygon(0.0, &flat);
    }

    // Starting dressing (top-left)
    if has_starting_cross {
        let x_stroke = UStroke::with_thickness(2.0);
        sg.set_stroke_color(Some(&fg_color.to_svg()));
        sg.set_stroke_width(x_stroke.thickness, x_stroke.dasharray_svg());
        let y0 = text_height - ARROW_DELTA_X / 2.0;
        sg.svg_line(
            SPACE_CROSS_X,
            y0,
            SPACE_CROSS_X + ARROW_DELTA_X,
            y0 + ARROW_DELTA_X,
            0.0,
        );
        let y1 = text_height + ARROW_DELTA_X / 2.0;
        sg.svg_line(
            SPACE_CROSS_X,
            y1,
            SPACE_CROSS_X + ARROW_DELTA_X,
            y1 - ARROW_DELTA_X,
            0.0,
        );
    } else if config.dressing1().head == ArrowHead::Async {
        if config.part() != ArrowPart::BottomPart {
            sg.set_stroke_color(Some(&fg_color.to_svg()));
            sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
            sg.svg_line(
                x1,
                text_height,
                x1 + ARROW_DELTA_X,
                text_height + ARROW_DELTA_Y,
                0.0,
            );
        }
        if config.part() != ArrowPart::TopPart {
            sg.set_stroke_color(Some(&fg_color.to_svg()));
            sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
            sg.svg_line(
                x1,
                text_height,
                x1 + ARROW_DELTA_X,
                text_height - ARROW_DELTA_Y,
                0.0,
            );
        }
    } else if config.dressing1().head == ArrowHead::Normal {
        let poly = polygon_self(config, nice_arrow);
        sg.set_fill_color(&fg_color.to_svg());
        sg.set_stroke_color(Some(&fg_color.to_svg()));
        sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
        let flat: Vec<f64> = poly
            .iter()
            .flat_map(|&(px, py)| [x1 + px, text_height + py])
            .collect();
        sg.svg_polygon(0.0, &flat);
    }
}

/// Draw a participant box into an SvgGraphic.
/// Java: `ComponentRoseParticipant.drawInternalU`
pub fn draw_participant(
    sg: &mut SvgGraphic,
    text: &TextMetrics,
    _area: &Area,
    fg_color: &HColor,
    bg_color: &HColor,
    stroke: &UStroke,
    round_corner: f64,
    _diagonal_corner: f64,
    delta_shadow: f64,
    collections: bool,
    padding: f64,
    min_width: f64,
) {
    let pure = f64::max(text.pure_text_width, min_width);
    let tw = pure + text.margin_x1 + text.margin_x2;
    let th = text.text_height();
    let delta_coll = if collections { COLLECTIONS_DELTA } else { 0.0 };

    if collections {
        sg.set_fill_color(&bg_color.to_svg());
        sg.set_stroke_color(Some(&fg_color.to_svg()));
        sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
        sg.svg_rectangle(
            padding + delta_coll,
            0.0,
            tw,
            th,
            round_corner,
            round_corner,
            delta_shadow,
        );
    }

    sg.set_fill_color(&bg_color.to_svg());
    sg.set_stroke_color(Some(&fg_color.to_svg()));
    sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
    sg.svg_rectangle(
        padding,
        delta_coll,
        tw,
        th,
        round_corner,
        round_corner,
        delta_shadow,
    );
}

/// Draw a note into an SvgGraphic.
/// Java: `ComponentRoseNote.drawInternalU`
pub fn draw_note(
    sg: &mut SvgGraphic,
    text: &TextMetrics,
    area: &Area,
    fashion: &Fashion,
    padding_x: f64,
    padding_y: f64,
    round_corner: f64,
) {
    let text_height = text.text_height() as i32;
    let mut x2 = text.text_width() as i32;

    let _diff_x = area.dimension.width
        - note_preferred_size(text, padding_x, padding_y, fashion.delta_shadow).width;

    if area.dimension.width
        > note_preferred_size(text, padding_x, padding_y, fashion.delta_shadow).width
    {
        x2 = (area.dimension.width - 2.0 * padding_x) as i32;
    }

    // Note polygon (rectangle with folded corner)
    let mut path = UPath::new();
    if round_corner == 0.0 {
        path.move_to(0.0, 0.0);
        path.line_to(x2 as f64 - CORNER_SIZE, 0.0);
        path.line_to(x2 as f64, CORNER_SIZE);
        path.line_to(x2 as f64, text_height as f64);
        path.line_to(0.0, text_height as f64);
        path.close();
    } else {
        let r = round_corner;
        path.move_to(r, 0.0);
        path.line_to(x2 as f64 - CORNER_SIZE, 0.0);
        path.line_to(x2 as f64, CORNER_SIZE);
        path.line_to(x2 as f64, text_height as f64 - r);
        path.arc_to(r, r, 0.0, 0.0, 1.0, x2 as f64 - r, text_height as f64);
        path.line_to(r, text_height as f64);
        path.arc_to(r, r, 0.0, 0.0, 1.0, 0.0, text_height as f64 - r);
        path.line_to(0.0, r);
        path.arc_to(r, r, 0.0, 0.0, 1.0, r, 0.0);
    }

    if let Some(ref f) = fashion.back_color {
        sg.set_fill_color(&f.to_svg());
    }
    if let Some(ref c) = fashion.fore_color {
        sg.set_stroke_color(Some(&c.to_svg()));
    }
    sg.set_stroke_width(fashion.stroke.thickness, fashion.stroke.dasharray_svg());
    sg.svg_path(0.0, 0.0, &path, fashion.delta_shadow);

    // Corner fold
    let mut corner = UPath::new();
    corner.move_to(x2 as f64 - CORNER_SIZE, 0.0);
    corner.line_to(x2 as f64 - CORNER_SIZE, CORNER_SIZE);
    corner.line_to(x2 as f64, CORNER_SIZE);
    sg.set_fill_color("none");
    if let Some(ref c) = fashion.fore_color {
        sg.set_stroke_color(Some(&c.to_svg()));
    }
    sg.set_stroke_width(fashion.stroke.thickness, fashion.stroke.dasharray_svg());
    sg.svg_path(0.0, 0.0, &corner, 0.0);
}

/// Draw a divider into an SvgGraphic.
/// Java: `ComponentRoseDivider.drawInternalU`
pub fn draw_divider(
    sg: &mut SvgGraphic,
    text: &TextMetrics,
    area: &Area,
    border_color: &HColor,
    bg_color: &HColor,
    stroke: &UStroke,
    round_corner: f64,
    shadow: f64,
    empty: bool,
) {
    let dim = area.dimension;

    if empty {
        // Just draw separator lines
        draw_divider_sep(
            sg,
            dim.width,
            dim.height / 2.0,
            bg_color,
            border_color,
            stroke,
            round_corner,
            shadow,
        );
    } else {
        let text_width = text.text_width();
        let text_height = text.text_height();
        let delta_x = 6.0;
        let xpos = (dim.width - text_width - delta_x) / 2.0;
        let ypos = (dim.height - text_height) / 2.0;

        draw_divider_sep(
            sg,
            dim.width,
            dim.height / 2.0,
            bg_color,
            border_color,
            stroke,
            round_corner,
            shadow,
        );

        // Text background rect
        sg.set_fill_color(&bg_color.to_svg());
        sg.set_stroke_color(Some(&border_color.to_svg()));
        sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
        sg.svg_rectangle(
            xpos,
            ypos,
            text_width + delta_x,
            text_height,
            round_corner,
            round_corner,
            shadow,
        );
    }
}

fn draw_divider_sep(
    sg: &mut SvgGraphic,
    width: f64,
    y: f64,
    bg_color: &HColor,
    border_color: &HColor,
    stroke: &UStroke,
    round_corner: f64,
    shadow: f64,
) {
    // Background rect (3px tall)
    let simple = UStroke::simple();
    sg.set_fill_color(&bg_color.to_svg());
    sg.set_stroke_color(Some(&bg_color.to_svg()));
    sg.set_stroke_width(simple.thickness, simple.dasharray_svg());
    sg.svg_rectangle(0.0, y - 1.0, width, 3.0, round_corner, round_corner, shadow);

    // Double lines
    let half_thick = stroke.thickness / 2.0;
    sg.set_stroke_color(Some(&border_color.to_svg()));
    sg.set_stroke_width(half_thick, None);
    sg.svg_line(0.0, y - 1.0, width, y - 1.0, 0.0);
    sg.svg_line(0.0, y + 2.0, width, y + 2.0, 0.0);
}

/// Draw a grouping header into an SvgGraphic.
/// Java: `ComponentRoseGroupingHeader.drawInternalU` + `drawBackgroundInternalU`
pub fn draw_grouping_header(
    sg: &mut SvgGraphic,
    text: &TextMetrics,
    area: &Area,
    fashion: &Fashion,
    corner_fashion: &Fashion,
    background: &HColor,
    round_corner: f64,
) {
    let dim = area.dimension;
    let text_width = text.text_width();
    let text_height = text.text_height();

    // Background rect
    sg.set_fill_color(&background.to_svg());
    if let Some(ref c) = fashion.fore_color {
        sg.set_stroke_color(Some(&c.to_svg()));
    }
    sg.set_stroke_width(fashion.stroke.thickness, fashion.stroke.dasharray_svg());
    sg.svg_rectangle(
        0.0,
        0.0,
        dim.width,
        dim.height,
        round_corner,
        round_corner,
        fashion.delta_shadow,
    );

    // Corner tab
    let corner_path = grouping_corner_path(text_width, text_height, round_corner);
    if let Some(ref f) = corner_fashion.back_color {
        sg.set_fill_color(&f.to_svg());
    }
    if let Some(ref c) = corner_fashion.fore_color {
        sg.set_stroke_color(Some(&c.to_svg()));
    }
    sg.set_stroke_width(
        corner_fashion.stroke.thickness,
        corner_fashion.stroke.dasharray_svg(),
    );
    sg.svg_path(0.0, 0.0, &corner_path, 0.0);

    // Outline rect (no fill)
    sg.set_fill_color("none");
    if let Some(ref c) = fashion.fore_color {
        sg.set_stroke_color(Some(&c.to_svg()));
    }
    sg.set_stroke_width(fashion.stroke.thickness, fashion.stroke.dasharray_svg());
    sg.svg_rectangle(
        0.0,
        0.0,
        dim.width,
        dim.height,
        round_corner,
        round_corner,
        0.0,
    );
}

/// Build the corner tab path for a grouping header.
/// Java: `ComponentRoseGroupingHeader.getCorner`
pub fn grouping_corner_path(width: f64, height: f64, round_corner: f64) -> UPath {
    let mut path = UPath::new();
    if round_corner == 0.0 {
        path.move_to(0.0, 0.0);
        path.line_to(width, 0.0);
        path.line_to(width, height - CORNER_SIZE);
        path.line_to(width - CORNER_SIZE, height);
        path.line_to(0.0, height);
        path.line_to(0.0, 0.0);
    } else {
        let r = round_corner / 2.0;
        path.move_to(r, 0.0);
        path.line_to(width, 0.0);
        path.line_to(width, height - CORNER_SIZE);
        path.line_to(width - CORNER_SIZE, height);
        path.line_to(0.0, height);
        path.line_to(0.0, r);
        path.arc_to(r, r, 0.0, 0.0, 1.0, r, 0.0);
    }
    path
}

/// Draw a grouping else separator into an SvgGraphic.
/// Java: `ComponentRoseGroupingElse.drawInternalU`
pub fn draw_grouping_else(
    sg: &mut SvgGraphic,
    _text: &TextMetrics,
    area: &Area,
    border_color: &HColor,
) {
    let dim = area.dimension;
    let dash_stroke = UStroke::new(2.0, 2.0, 1.0);

    // Dashed line
    sg.set_stroke_color(Some(&border_color.to_svg()));
    sg.set_stroke_width(dash_stroke.thickness, dash_stroke.dasharray_svg());
    sg.svg_line(0.0, 1.0, dim.width, 1.0, 0.0);
}

/// Draw a lifeline into an SvgGraphic.
/// Java: `ComponentRoseLine.drawInternalU`
pub fn draw_line(sg: &mut SvgGraphic, area: &Area, color: &HColor, stroke: &UStroke) {
    let dim = area.dimension;
    let x = (dim.width / 2.0) as i32;

    // Hover target rect (transparent)
    if dim.height > 0.0 {
        let hover_w = 8.0;
        let zero_stroke = UStroke::with_thickness(0.0);
        sg.set_fill_color(&HColor::None.to_svg());
        sg.set_stroke_color(Some(&HColor::None.to_svg()));
        sg.set_stroke_width(zero_stroke.thickness, zero_stroke.dasharray_svg());
        sg.svg_rectangle(
            (dim.width - hover_w) / 2.0,
            0.0,
            hover_w,
            dim.height,
            0.0,
            0.0,
            0.0,
        );
    }

    sg.set_stroke_color(Some(&color.to_svg()));
    sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
    sg.svg_line(x as f64, 0.0, x as f64, dim.height, 0.0);
}

/// Draw an activation box into an SvgGraphic.
/// Java: `ComponentRoseActiveLine.drawInternalU`
pub fn draw_active_line(
    sg: &mut SvgGraphic,
    area: &Area,
    fashion: &Fashion,
    close_up: bool,
    close_down: bool,
) {
    let dim = area.dimension;
    let x = ((dim.width - ACTIVE_LINE_WIDTH) / 2.0) as i32;

    if dim.height == 0.0 {
        return;
    }

    let shadow = if fashion.is_shadowing() { 1.0 } else { 0.0 };
    let simple = UStroke::simple();

    if close_up && close_down {
        if let Some(ref f) = fashion.back_color {
            sg.set_fill_color(&f.to_svg());
        }
        if let Some(ref c) = fashion.fore_color {
            sg.set_stroke_color(Some(&c.to_svg()));
        }
        sg.set_stroke_width(simple.thickness, simple.dasharray_svg());
        sg.svg_rectangle(
            x as f64,
            0.0,
            ACTIVE_LINE_WIDTH,
            dim.height,
            0.0,
            0.0,
            shadow,
        );
    } else {
        // Background rect (no border)
        if let Some(ref f) = fashion.back_color {
            sg.set_fill_color(&f.to_svg());
        }
        if let Some(ref c) = fashion.back_color {
            sg.set_stroke_color(Some(&c.to_svg()));
        }
        sg.set_stroke_width(simple.thickness, simple.dasharray_svg());
        sg.svg_rectangle(x as f64, 0.0, ACTIVE_LINE_WIDTH, dim.height, 0.0, 0.0, 0.0);

        // Left & right vertical lines
        if let Some(ref c) = fashion.fore_color {
            sg.set_stroke_color(Some(&c.to_svg()));
        }
        sg.set_stroke_width(simple.thickness, simple.dasharray_svg());
        sg.svg_line(x as f64, 0.0, x as f64, dim.height, 0.0);
        sg.svg_line(
            x as f64 + ACTIVE_LINE_WIDTH,
            0.0,
            x as f64 + ACTIVE_LINE_WIDTH,
            dim.height,
            0.0,
        );

        // Top/bottom lines if closed
        if close_up {
            sg.svg_line(x as f64, 0.0, x as f64 + ACTIVE_LINE_WIDTH, 0.0, 0.0);
        }
        if close_down {
            sg.svg_line(
                x as f64,
                dim.height,
                x as f64 + ACTIVE_LINE_WIDTH,
                dim.height,
                0.0,
            );
        }
    }
}

/// Draw a destroy cross into an SvgGraphic.
/// Java: `ComponentRoseDestroy.drawInternalU`
pub fn draw_destroy(sg: &mut SvgGraphic, color: &HColor, stroke: &UStroke) {
    let s = DESTROY_CROSS_SIZE;
    sg.set_stroke_color(Some(&color.to_svg()));
    sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
    sg.svg_line(0.0, 0.0, 2.0 * s, 2.0 * s, 0.0);
    sg.svg_line(0.0, 2.0 * s, 2.0 * s, 0.0, 0.0);
}

/// Draw a delay line into an SvgGraphic.
/// Java: `ComponentRoseDelayLine.drawInternalU`
pub fn draw_delay_line(sg: &mut SvgGraphic, area: &Area, color: &HColor, stroke: &UStroke) {
    let dim = area.dimension;
    let x = (dim.width / 2.0) as i32;
    sg.set_stroke_color(Some(&color.to_svg()));
    sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
    sg.svg_line(x as f64, 0.0, x as f64, dim.height, 0.0);
}

/// Draw a newpage line into an SvgGraphic.
/// Java: `ComponentRoseNewpage.drawInternalU`
pub fn draw_newpage(sg: &mut SvgGraphic, area: &Area, color: &HColor, stroke: &UStroke) {
    let dim = area.dimension;
    sg.set_stroke_color(Some(&color.to_svg()));
    sg.set_stroke_width(stroke.thickness, stroke.dasharray_svg());
    sg.svg_line(0.0, 0.0, dim.width, 0.0, 0.0);
}

/// Draw a reference frame into an SvgGraphic.
/// Java: `ComponentRoseReference.drawInternalU`
pub fn draw_reference(
    sg: &mut SvgGraphic,
    _text: &TextMetrics,
    area: &Area,
    header_fashion: &Fashion,
    body_fashion: &Fashion,
    header_text_width: f64,
    header_text_height: f64,
    round_corner: f64,
) {
    let dim = area.dimension;

    let text_header_width = reference_header_width(header_text_width) as i32;
    let text_header_height = reference_header_height(header_text_height) as i32;

    // Body rect
    let body_width = dim.width - REF_X_MARGIN * 2.0 - body_fashion.delta_shadow;
    let body_height = dim.height - REF_HEIGHT_FOOTER;
    if let Some(ref f) = body_fashion.back_color {
        sg.set_fill_color(&f.to_svg());
    }
    if let Some(ref c) = body_fashion.fore_color {
        sg.set_stroke_color(Some(&c.to_svg()));
    }
    sg.set_stroke_width(
        body_fashion.stroke.thickness,
        body_fashion.stroke.dasharray_svg(),
    );
    sg.svg_rectangle(
        REF_X_MARGIN,
        0.0,
        body_width,
        body_height,
        round_corner,
        round_corner,
        body_fashion.delta_shadow,
    );

    // Header corner tab
    let header_corner = reference_corner_path(
        text_header_width as f64,
        text_header_height as f64,
        round_corner,
    );
    if let Some(ref f) = header_fashion.back_color {
        sg.set_fill_color(&f.to_svg());
    }
    if let Some(ref c) = header_fashion.fore_color {
        sg.set_stroke_color(Some(&c.to_svg()));
    }
    sg.set_stroke_width(
        header_fashion.stroke.thickness,
        header_fashion.stroke.dasharray_svg(),
    );
    sg.svg_path(REF_X_MARGIN, 0.0, &header_corner, 0.0);
}

/// Build the corner tab path for a reference header.
/// Java: `ComponentRoseReference` corner path
pub fn reference_corner_path(width: f64, height: f64, round_corner: f64) -> UPath {
    let mut path = UPath::new();
    if round_corner == 0.0 {
        path.move_to(0.0, 0.0);
        path.line_to(width, 0.0);
        path.line_to(width, height - CORNER_SIZE);
        path.line_to(width - CORNER_SIZE, height);
        path.line_to(0.0, height);
        path.line_to(0.0, 0.0);
    } else {
        let r = round_corner / 2.0;
        path.move_to(r, 0.0);
        path.line_to(width, 0.0);
        path.line_to(width, height - CORNER_SIZE);
        path.line_to(width - CORNER_SIZE, height);
        path.line_to(0.0, height);
        path.line_to(0.0, r);
        path.arc_to(r, r, 0.0, 0.0, 1.0, r, 0.0);
    }
    path
}

/// Draw a note box into an SvgGraphic.
/// Java: `ComponentRoseNoteBox.drawInternalU`
pub fn draw_note_box(
    sg: &mut SvgGraphic,
    text: &TextMetrics,
    area: &Area,
    fashion: &Fashion,
    round_corner: f64,
) {
    let px = 5.0;

    let text_height = text.text_height() as i32;
    let mut x2 = text.text_width() as i32;

    if area.dimension.width > note_box_preferred_size(text).width {
        x2 = (area.dimension.width - 2.0 * px) as i32;
    }

    if let Some(ref f) = fashion.back_color {
        sg.set_fill_color(&f.to_svg());
    }
    if let Some(ref c) = fashion.fore_color {
        sg.set_stroke_color(Some(&c.to_svg()));
    }
    sg.set_stroke_width(fashion.stroke.thickness, fashion.stroke.dasharray_svg());
    sg.svg_rectangle(
        0.0,
        0.0,
        x2 as f64,
        text_height as f64,
        round_corner,
        round_corner,
        fashion.delta_shadow,
    );
}

/// Draw a hexagonal note into an SvgGraphic.
/// Java: `ComponentRoseNoteHexagonal.drawInternalU`
pub fn draw_note_hexagonal(
    sg: &mut SvgGraphic,
    text: &TextMetrics,
    area: &Area,
    fashion: &Fashion,
) {
    let px = 5.0;

    let text_height = text.text_height() as i32;
    let mut x2 = text.text_width() as i32;

    if area.dimension.width > note_hexagonal_preferred_size(text).width {
        x2 = (area.dimension.width - 2.0 * px) as i32;
    }

    let cs = CORNER_SIZE;
    let th2 = text_height as f64 / 2.0;
    let points = [
        (cs, 0.0),
        (x2 as f64 - cs, 0.0),
        (x2 as f64, th2),
        (x2 as f64 - cs, text_height as f64),
        (cs, text_height as f64),
        (0.0, th2),
        (cs, 0.0),
    ];

    if let Some(ref f) = fashion.back_color {
        sg.set_fill_color(&f.to_svg());
    }
    if let Some(ref c) = fashion.fore_color {
        sg.set_stroke_color(Some(&c.to_svg()));
    }
    sg.set_stroke_width(fashion.stroke.thickness, fashion.stroke.dasharray_svg());
    let flat: Vec<f64> = points.iter().flat_map(|&(x, y)| [x, y]).collect();
    sg.svg_polygon(0.0, &flat);
}

/// Draw an englober (box around participants) into an SvgGraphic.
/// Java: `ComponentRoseEnglober.drawBackgroundInternalU`
pub fn draw_englober(
    sg: &mut SvgGraphic,
    _text: &TextMetrics,
    area: &Area,
    fashion: &Fashion,
    round_corner: f64,
) {
    let dim = area.dimension;
    if let Some(ref f) = fashion.back_color {
        sg.set_fill_color(&f.to_svg());
    }
    if let Some(ref c) = fashion.fore_color {
        sg.set_stroke_color(Some(&c.to_svg()));
    }
    sg.set_stroke_width(fashion.stroke.thickness, fashion.stroke.dasharray_svg());
    sg.svg_rectangle(
        0.0,
        0.0,
        dim.width,
        dim.height,
        round_corner,
        round_corner,
        fashion.delta_shadow,
    );
}

// ══════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skin::arrow::ArrowBody;

    fn make_text(pure_w: f64, h: f64) -> TextMetrics {
        TextMetrics::new(7.0, 7.0, 1.0, pure_w, h)
    }

    // ── TextMetrics ─────────────────────────────────────────────────

    #[test]
    fn text_metrics_width() {
        let tm = make_text(50.0, 14.0);
        assert_eq!(tm.text_width(), 50.0 + 7.0 + 7.0);
    }

    #[test]
    fn text_metrics_height() {
        let tm = make_text(50.0, 14.0);
        assert_eq!(tm.text_height(), 14.0 + 2.0);
    }

    // ── Arrow size ──────────────────────────────────────────────────

    #[test]
    fn arrow_preferred_size_basic() {
        let tm = make_text(80.0, 14.0);
        let dim = arrow_preferred_size(&tm, 0.0, 0.0);
        assert_eq!(dim.width, tm.text_width() + ARROW_DELTA_X);
        assert_eq!(
            dim.height,
            tm.text_height() + ARROW_DELTA_Y + 2.0 * ARROW_PADDING_Y
        );
    }

    #[test]
    fn arrow_preferred_size_with_inclination() {
        let tm = make_text(80.0, 14.0);
        let dim = arrow_preferred_size(&tm, 5.0, 3.0);
        let base = arrow_preferred_size(&tm, 0.0, 0.0);
        assert_eq!(dim.height, base.height + 8.0);
    }

    // ── Self-arrow size ─────────────────────────────────────────────

    #[test]
    fn self_arrow_preferred_size_basic() {
        let tm = make_text(30.0, 14.0);
        let dim = self_arrow_preferred_size(&tm);
        assert_eq!(dim.width, SELF_ARROW_WIDTH + 5.0);
        assert_eq!(
            dim.height,
            tm.text_height() + ARROW_DELTA_Y + SELF_ARROW_ONLY_HEIGHT + 2.0 * ARROW_PADDING_Y
        );
    }

    #[test]
    fn self_arrow_preferred_size_wide_text() {
        let tm = make_text(100.0, 14.0);
        let dim = self_arrow_preferred_size(&tm);
        assert_eq!(dim.width, tm.text_width());
    }

    // ── Participant size ────────────────────────────────────────────

    #[test]
    fn participant_preferred_size_basic() {
        let tm = make_text(60.0, 14.0);
        let dim = participant_preferred_size(&tm, 0.0, false, 0.0, 0.0);
        assert_eq!(dim.width, tm.text_width());
        assert_eq!(dim.height, tm.text_height() + 1.0);
    }

    #[test]
    fn participant_preferred_size_with_min_width() {
        let tm = make_text(20.0, 14.0);
        let dim = participant_preferred_size(&tm, 0.0, false, 0.0, 100.0);
        assert!(dim.width >= 100.0 + tm.margin_x1 + tm.margin_x2);
    }

    #[test]
    fn participant_preferred_size_with_collections() {
        let tm = make_text(60.0, 14.0);
        let dim_normal = participant_preferred_size(&tm, 0.0, false, 0.0, 0.0);
        let dim_coll = participant_preferred_size(&tm, 0.0, true, 0.0, 0.0);
        assert_eq!(dim_coll.width, dim_normal.width + COLLECTIONS_DELTA);
        assert_eq!(dim_coll.height, dim_normal.height + COLLECTIONS_DELTA);
    }

    #[test]
    fn participant_preferred_size_with_padding() {
        let tm = make_text(60.0, 14.0);
        let dim = participant_preferred_size(&tm, 0.0, false, 10.0, 0.0);
        let dim_no_pad = participant_preferred_size(&tm, 0.0, false, 0.0, 0.0);
        assert_eq!(dim.width, dim_no_pad.width + 20.0);
    }

    // ── Participant preferred width (per kind) ────────────────────

    #[test]
    fn participant_width_default() {
        // Default: text + 2*7 margin
        let w = participant_preferred_width(&ParticipantKind::Default, 51.15, 1.5);
        assert!((w - 65.15).abs() < 0.01, "Default got {w}");
    }

    #[test]
    fn participant_width_actor() {
        // Actor: max(icon_w=29, text+6=39.67) = 39.67
        let w = participant_preferred_width(&ParticipantKind::Actor, 33.67, 1.5);
        assert!((w - 39.67).abs() < 0.01, "Actor got {w}");
    }

    #[test]
    fn participant_width_boundary() {
        // Boundary: max(49, text+6) — text 27.06+6=33.06 < 49
        let w = participant_preferred_width(&ParticipantKind::Boundary, 27.06, 1.5);
        assert!((w - 49.0).abs() < 0.01, "Boundary got {w}");
    }

    #[test]
    fn participant_width_control() {
        // Control: max(32, text+6) — text 49.38+6=55.38 > 32
        let w = participant_preferred_width(&ParticipantKind::Control, 49.38, 1.5);
        assert!((w - 55.38).abs() < 0.01, "Control got {w}");
    }

    #[test]
    fn participant_width_entity() {
        // Entity: max(32, text+6) — text 20+6=26 < 32
        let w = participant_preferred_width(&ParticipantKind::Entity, 20.0, 1.5);
        assert!((w - 32.0).abs() < 0.01, "Entity got {w}");
    }

    #[test]
    fn participant_width_database() {
        // Database: max(36, text+6) — text 60+6=66 > 36
        let w = participant_preferred_width(&ParticipantKind::Database, 60.0, 1.5);
        assert!((w - 66.0).abs() < 0.01, "Database got {w}");
    }

    #[test]
    fn participant_width_collections() {
        // Collections: text + 14 + 4
        let w = participant_preferred_width(&ParticipantKind::Collections, 40.0, 1.5);
        assert!((w - 58.0).abs() < 0.01, "Collections got {w}");
    }

    #[test]
    fn participant_width_queue() {
        // Queue: text + 5 + 15
        let w = participant_preferred_width(&ParticipantKind::Queue, 40.0, 1.5);
        assert!((w - 60.0).abs() < 0.01, "Queue got {w}");
    }

    // ── Note size ───────────────────────────────────────────────────

    #[test]
    fn note_preferred_size_basic() {
        let tm = make_text(80.0, 14.0);
        let dim = note_preferred_size(&tm, 5.0, 5.0, 0.0);
        assert_eq!(dim.width, tm.text_width() + 10.0);
        assert_eq!(dim.height, tm.text_height() + 10.0);
    }

    #[test]
    fn note_preferred_size_with_shadow() {
        let tm = make_text(80.0, 14.0);
        let dim = note_preferred_size(&tm, 5.0, 5.0, 3.0);
        let dim_noshadow = note_preferred_size(&tm, 5.0, 5.0, 0.0);
        assert_eq!(dim.width, dim_noshadow.width + 3.0);
        assert_eq!(dim.height, dim_noshadow.height + 3.0);
    }

    // ── Divider size ────────────────────────────────────────────────

    #[test]
    fn divider_preferred_size_basic() {
        let tm = make_text(40.0, 14.0);
        let dim = divider_preferred_size(&tm);
        assert_eq!(dim.width, tm.text_width() + 30.0);
        assert_eq!(dim.height, tm.text_height() + 20.0);
    }

    // ── Grouping header size ────────────────────────────────────────

    #[test]
    fn grouping_header_preferred_size_no_comment() {
        let tm = TextMetrics::new(15.0, 30.0, 1.0, 40.0, 14.0);
        let dim = grouping_header_preferred_size(&tm, 0.0, 0.0, 5.0);
        assert_eq!(dim.width, tm.text_width());
        assert_eq!(dim.height, tm.text_height() + 10.0);
    }

    #[test]
    fn grouping_header_preferred_size_with_comment() {
        let tm = TextMetrics::new(15.0, 30.0, 1.0, 40.0, 14.0);
        let dim = grouping_header_preferred_size(&tm, 50.0, 20.0, 5.0);
        assert!(dim.width > tm.text_width());
        assert_eq!(dim.height, tm.text_height() + 10.0 + 5.0);
    }

    // ── Grouping else size ──────────────────────────────────────────

    #[test]
    fn grouping_else_preferred_size_legacy() {
        let tm = make_text(30.0, 14.0);
        let dim = grouping_else_preferred_size(&tm, false);
        assert_eq!(dim.height, tm.text_height());
    }

    #[test]
    fn grouping_else_preferred_size_teoz() {
        let tm = make_text(30.0, 14.0);
        let dim = grouping_else_preferred_size(&tm, true);
        assert_eq!(dim.height, tm.text_height() + 16.0);
    }

    // ── Grouping space size ─────────────────────────────────────────

    #[test]
    fn grouping_space_size() {
        let dim = grouping_space_preferred_size();
        assert_eq!(dim.width, 0.0);
        assert_eq!(dim.height, 7.0);
    }

    // ── Reference size ──────────────────────────────────────────────

    #[test]
    fn reference_preferred_size_basic() {
        let tm = make_text(80.0, 14.0);
        let hw = reference_header_width(30.0);
        let hh = reference_header_height(14.0);
        let dim = reference_preferred_size(&tm, hw, hh, 0.0);
        assert_eq!(dim.height, tm.text_height() + hh + REF_HEIGHT_FOOTER);
    }

    #[test]
    fn reference_header_dimensions() {
        assert_eq!(reference_header_width(30.0), 30.0 + 45.0);
        assert_eq!(reference_header_height(14.0), 16.0);
    }

    // ── Line size ───────────────────────────────────────────────────

    #[test]
    fn line_preferred() {
        let dim = line_preferred_size();
        assert_eq!(dim.width, 1.0);
        assert_eq!(dim.height, 20.0);
    }

    // ── Active line size ────────────────────────────────────────────

    #[test]
    fn active_line_preferred() {
        let dim = active_line_preferred_size();
        assert_eq!(dim.width, 10.0);
        assert_eq!(dim.height, 0.0);
    }

    // ── Destroy size ────────────────────────────────────────────────

    #[test]
    fn destroy_preferred() {
        let dim = destroy_preferred_size();
        assert_eq!(dim.width, 18.0);
        assert_eq!(dim.height, 18.0);
    }

    // ── Delay sizes ─────────────────────────────────────────────────

    #[test]
    fn delay_line_preferred() {
        let dim = delay_line_preferred_size();
        assert_eq!(dim.width, 1.0);
        assert_eq!(dim.height, 20.0);
    }

    #[test]
    fn delay_text_preferred() {
        let tm = TextMetrics::new(0.0, 0.0, 4.0, 50.0, 14.0);
        let dim = delay_text_preferred_size(&tm);
        assert_eq!(dim.width, 50.0);
        assert_eq!(dim.height, tm.text_height() + 20.0);
    }

    // ── Newpage size ────────────────────────────────────────────────

    #[test]
    fn newpage_preferred() {
        let dim = newpage_preferred_size();
        assert_eq!(dim.width, 0.0);
        assert_eq!(dim.height, 1.0);
    }

    // ── Englober size ───────────────────────────────────────────────

    #[test]
    fn englober_preferred() {
        let tm = TextMetrics::new(3.0, 3.0, 1.0, 60.0, 14.0);
        let dim = englober_preferred_size(&tm);
        assert_eq!(dim.width, tm.text_width());
        assert_eq!(dim.height, tm.text_height() + 3.0);
    }

    // ── NoteBox / NoteHexagonal sizes ───────────────────────────────

    #[test]
    fn note_box_preferred() {
        let tm = make_text(50.0, 14.0);
        let dim = note_box_preferred_size(&tm);
        assert_eq!(dim.width, tm.text_width() + 10.0);
        assert_eq!(dim.height, tm.text_height() + 10.0);
    }

    #[test]
    fn note_hexagonal_preferred() {
        let tm = make_text(50.0, 14.0);
        let dim = note_hexagonal_preferred_size(&tm);
        assert_eq!(dim.width, tm.text_width() + 10.0);
        assert_eq!(dim.height, tm.text_height() + 10.0);
    }

    // ── Constants match Java ────────────────────────────────────────

    #[test]
    fn constants_match_java() {
        assert_eq!(ARROW_DELTA_X, 10.0);
        assert_eq!(ARROW_DELTA_Y, 4.0);
        assert_eq!(ARROW_PADDING_Y, 4.0);
        assert_eq!(SPACE_CROSS_X, 6.0);
        assert_eq!(DIAM_CIRCLE, 8.0);
        assert_eq!(THIN_CIRCLE, 1.5);
        assert_eq!(SELF_ARROW_WIDTH, 45.0);
        assert_eq!(SELF_ARROW_XRIGHT, 42.0);
        assert_eq!(SELF_ARROW_ONLY_HEIGHT, 13.0);
        assert_eq!(DESTROY_CROSS_SIZE, 9.0);
        assert_eq!(CORNER_SIZE, 10.0);
        assert_eq!(GROUPING_SPACE_HEIGHT, 7.0);
        assert_eq!(REF_HEIGHT_FOOTER, 5.0);
        assert_eq!(REF_X_MARGIN, 2.0);
        assert_eq!(ACTIVE_LINE_WIDTH, 10.0);
        assert_eq!(COLLECTIONS_DELTA, 4.0);
    }

    // ── Polygon generation ──────────────────────────────────────────

    #[test]
    fn polygon_normal_full() {
        let pts = polygon_normal(ArrowPart::Full, false);
        assert_eq!(pts.len(), 3);
        assert_eq!(pts[0], (-ARROW_DELTA_X, -ARROW_DELTA_Y));
        assert_eq!(pts[1], (0.0, 0.0));
        assert_eq!(pts[2], (-ARROW_DELTA_X, ARROW_DELTA_Y));
    }

    #[test]
    fn polygon_normal_nice() {
        let pts = polygon_normal(ArrowPart::Full, true);
        assert_eq!(pts.len(), 4);
        assert_eq!(pts[3], (-ARROW_DELTA_X + 4.0, 0.0));
    }

    #[test]
    fn polygon_normal_top_part() {
        let pts = polygon_normal(ArrowPart::TopPart, false);
        assert_eq!(pts.len(), 3);
        assert_eq!(pts[2], (-ARROW_DELTA_X, 0.0));
    }

    #[test]
    fn polygon_normal_bottom_part() {
        let pts = polygon_normal(ArrowPart::BottomPart, false);
        assert_eq!(pts.len(), 3);
        assert_eq!(pts[0], (-ARROW_DELTA_X, 0.0));
    }

    #[test]
    fn polygon_reverse_full() {
        let pts = polygon_reverse(ArrowPart::Full, false);
        assert_eq!(pts.len(), 3);
        assert_eq!(pts[0], (ARROW_DELTA_X, -ARROW_DELTA_Y));
        assert_eq!(pts[1], (0.0, 0.0));
        assert_eq!(pts[2], (ARROW_DELTA_X, ARROW_DELTA_Y));
    }

    #[test]
    fn polygon_reverse_nice() {
        let pts = polygon_reverse(ArrowPart::Full, true);
        assert_eq!(pts.len(), 4);
        assert_eq!(pts[3], (ARROW_DELTA_X - 4.0, 0.0));
    }

    #[test]
    fn polygon_self_forward() {
        let config = ArrowConfiguration::with_direction_self(false);
        let pts = polygon_self(&config, false);
        assert_eq!(pts.len(), 3);
        assert_eq!(pts[0], (ARROW_DELTA_X, -ARROW_DELTA_Y));
    }

    #[test]
    fn polygon_self_reversed() {
        let config = ArrowConfiguration::with_direction_self(true);
        let pts = polygon_self(&config, false);
        assert_eq!(pts.len(), 3);
        assert_eq!(pts[0], (-ARROW_DELTA_X, -ARROW_DELTA_Y));
    }

    #[test]
    fn polygon_self_nice() {
        let config = ArrowConfiguration::with_direction_self(false);
        let pts = polygon_self(&config, true);
        assert_eq!(pts.len(), 4);
    }

    // ── Arrow y-point ───────────────────────────────────────────────

    #[test]
    fn arrow_y_point_normal() {
        let tm = make_text(80.0, 14.0);
        let y = arrow_y_point(&tm, false);
        assert_eq!(y, tm.text_height() + ARROW_PADDING_Y);
    }

    #[test]
    fn arrow_y_point_below() {
        let tm = make_text(80.0, 14.0);
        let y = arrow_y_point(&tm, true);
        assert_eq!(y, ARROW_PADDING_Y);
    }

    // ── Self-arrow y-point ──────────────────────────────────────────

    #[test]
    fn self_arrow_y_point_calc() {
        let tm = make_text(30.0, 14.0);
        let y = self_arrow_y_point(&tm);
        let th = tm.text_height();
        // Java: getPaddingX() = 0 for ComponentRoseSelfArrow
        let expected = (th + th + SELF_ARROW_ONLY_HEIGHT) / 2.0;
        assert_eq!(y, expected);
    }

    // ── Start/end points ────────────────────────────────────────────

    #[test]
    fn arrow_start_point_ltr() {
        let tm = make_text(80.0, 14.0);
        let dim = XDimension2D::new(200.0, 30.0);
        let pt = arrow_start_point(&tm, dim, ArrowDirection::LeftToRight, false, 0.0);
        assert_eq!(pt.x, ARROW_PADDING_X);
    }

    #[test]
    fn arrow_start_point_rtl() {
        let tm = make_text(80.0, 14.0);
        let dim = XDimension2D::new(200.0, 30.0);
        let pt = arrow_start_point(&tm, dim, ArrowDirection::RightToLeft, false, 0.0);
        assert_eq!(pt.x, dim.width + ARROW_PADDING_X);
    }

    #[test]
    fn arrow_end_point_ltr() {
        let tm = make_text(80.0, 14.0);
        let dim = XDimension2D::new(200.0, 30.0);
        let pt = arrow_end_point(&tm, dim, ArrowDirection::LeftToRight, false);
        assert_eq!(pt.x, dim.width + ARROW_PADDING_X);
    }

    #[test]
    fn self_arrow_start_end() {
        let tm = make_text(30.0, 14.0);
        let start = self_arrow_start_point(&tm);
        let end = self_arrow_end_point(&tm);
        assert!(end.y > start.y);
        assert_eq!(start.x, end.x);
    }

    // ── Drawing functions produce SVG ─────────────────────────────────

    fn new_sg() -> SvgGraphic {
        SvgGraphic::new(0, 1.0)
    }

    #[test]
    fn draw_arrow_hidden_produces_empty() {
        let hidden_config =
            ArrowConfiguration::with_direction_normal().with_body(ArrowBody::Hidden);
        let tm = make_text(80.0, 14.0);
        let area = Area::new(200.0, 30.0);
        let fg = HColor::rgb(0, 0, 0);
        let bg = HColor::rgb(255, 255, 255);
        let stroke = UStroke::simple();
        let mut sg = new_sg();
        draw_arrow(
            &mut sg,
            &hidden_config,
            &tm,
            &area,
            &fg,
            &bg,
            &stroke,
            true,
            false,
            0.0,
            0.0,
        );
        assert!(sg.body().is_empty());
    }

    #[test]
    fn draw_arrow_normal_produces_ops() {
        let config = ArrowConfiguration::with_direction_normal();
        let tm = make_text(80.0, 14.0);
        let area = Area::new(200.0, 30.0);
        let fg = HColor::rgb(0, 0, 0);
        let bg = HColor::rgb(255, 255, 255);
        let stroke = UStroke::simple();
        let mut sg = new_sg();
        draw_arrow(
            &mut sg, &config, &tm, &area, &fg, &bg, &stroke, true, false, 0.0, 0.0,
        );
        let body = sg.body();
        assert!(!body.is_empty());
        // Should have at least a line and a polygon
        assert!(body.contains("<line"), "should have a line");
        assert!(body.contains("<polygon"), "should have a polygon");
    }

    #[test]
    fn draw_arrow_async_produces_lines() {
        let config = ArrowConfiguration::with_direction_normal().with_head2(ArrowHead::Async);
        let tm = make_text(80.0, 14.0);
        let area = Area::new(200.0, 30.0);
        let fg = HColor::rgb(0, 0, 0);
        let bg = HColor::rgb(255, 255, 255);
        let stroke = UStroke::simple();
        let mut sg = new_sg();
        draw_arrow(
            &mut sg, &config, &tm, &area, &fg, &bg, &stroke, true, false, 0.0, 0.0,
        );
        let body = sg.body();
        assert!(!body.is_empty());
        // Async arrow: main line + 2 async head lines
        let line_count = body.matches("<line").count();
        assert!(line_count >= 3, "expected >= 3 lines, got {}", line_count);
    }

    #[test]
    fn draw_arrow_crossx_produces_lines() {
        let config = ArrowConfiguration::with_direction_normal().with_head2(ArrowHead::CrossX);
        let tm = make_text(80.0, 14.0);
        let area = Area::new(200.0, 30.0);
        let fg = HColor::rgb(0, 0, 0);
        let bg = HColor::rgb(255, 255, 255);
        let stroke = UStroke::simple();
        let mut sg = new_sg();
        draw_arrow(
            &mut sg, &config, &tm, &area, &fg, &bg, &stroke, true, false, 0.0, 0.0,
        );
        let body = sg.body();
        let line_count = body.matches("<line").count();
        assert!(line_count >= 3, "expected >= 3 lines, got {}", line_count);
    }

    #[test]
    fn draw_arrow_with_circle_decoration() {
        let config = ArrowConfiguration::with_direction_normal()
            .with_decoration1(ArrowDecoration::Circle)
            .with_decoration2(ArrowDecoration::Circle);
        let tm = make_text(80.0, 14.0);
        let area = Area::new(200.0, 30.0);
        let fg = HColor::rgb(0, 0, 0);
        let bg = HColor::rgb(255, 255, 255);
        let stroke = UStroke::simple();
        let mut sg = new_sg();
        draw_arrow(
            &mut sg, &config, &tm, &area, &fg, &bg, &stroke, true, false, 0.0, 0.0,
        );
        let body = sg.body();
        let ellipse_count = body.matches("<ellipse").count();
        assert_eq!(ellipse_count, 2);
    }

    #[test]
    fn draw_self_arrow_hidden() {
        let config = ArrowConfiguration::with_direction_self(false).with_body(ArrowBody::Hidden);
        let tm = make_text(30.0, 14.0);
        let area = Area::new(100.0, 40.0);
        let fg = HColor::rgb(0, 0, 0);
        let bg = HColor::rgb(255, 255, 255);
        let stroke = UStroke::simple();
        let mut sg = new_sg();
        draw_self_arrow(&mut sg, &config, &tm, &area, &fg, &bg, &stroke, true);
        assert!(sg.body().is_empty());
    }

    #[test]
    fn draw_self_arrow_normal() {
        let config = ArrowConfiguration::with_direction_self(false);
        let tm = make_text(30.0, 14.0);
        let area = Area::new(100.0, 40.0);
        let fg = HColor::rgb(0, 0, 0);
        let bg = HColor::rgb(255, 255, 255);
        let stroke = UStroke::simple();
        let mut sg = new_sg();
        draw_self_arrow(&mut sg, &config, &tm, &area, &fg, &bg, &stroke, true);
        let body = sg.body();
        assert!(!body.is_empty());
        // Should have 3 bracket lines + 1 polygon
        let line_count = body.matches("<line").count();
        assert!(line_count >= 3, "expected >= 3 lines, got {}", line_count);
    }

    #[test]
    fn draw_participant_basic() {
        let tm = make_text(60.0, 14.0);
        let area = Area::new(80.0, 20.0);
        let fg = HColor::rgb(0, 0, 0);
        let bg = HColor::rgb(255, 255, 200);
        let stroke = UStroke::simple();
        let mut sg = new_sg();
        draw_participant(
            &mut sg, &tm, &area, &fg, &bg, &stroke, 5.0, 0.0, 0.0, false, 0.0, 0.0,
        );
        let body = sg.body();
        let rect_count = body.matches("<rect").count();
        assert_eq!(rect_count, 1);
    }

    #[test]
    fn draw_participant_collections() {
        let tm = make_text(60.0, 14.0);
        let area = Area::new(80.0, 20.0);
        let fg = HColor::rgb(0, 0, 0);
        let bg = HColor::rgb(255, 255, 200);
        let stroke = UStroke::simple();
        let mut sg = new_sg();
        draw_participant(
            &mut sg, &tm, &area, &fg, &bg, &stroke, 5.0, 0.0, 0.0, true, 0.0, 0.0,
        );
        let body = sg.body();
        let rect_count = body.matches("<rect").count();
        assert_eq!(rect_count, 2); // two rects for collections
    }

    #[test]
    fn draw_note_produces_path() {
        let tm = make_text(60.0, 14.0);
        let area = Area::new(100.0, 30.0);
        let fashion = Fashion::new(Some(HColor::rgb(255, 255, 200)), Some(HColor::rgb(0, 0, 0)));
        let mut sg = new_sg();
        draw_note(&mut sg, &tm, &area, &fashion, 5.0, 5.0, 0.0);
        let body = sg.body();
        let path_count = body.matches("<path").count();
        assert_eq!(path_count, 2); // main note shape + corner fold
    }

    #[test]
    fn draw_divider_empty() {
        let tm = make_text(0.0, 0.0);
        let area = Area::new(200.0, 20.0);
        let border = HColor::rgb(0, 0, 0);
        let bg = HColor::rgb(200, 200, 200);
        let stroke = UStroke::simple();
        let mut sg = new_sg();
        draw_divider(&mut sg, &tm, &area, &border, &bg, &stroke, 0.0, 0.0, true);
        assert!(!sg.body().is_empty());
    }

    #[test]
    fn draw_divider_with_text() {
        let tm = make_text(40.0, 14.0);
        let area = Area::new(200.0, 40.0);
        let border = HColor::rgb(0, 0, 0);
        let bg = HColor::rgb(200, 200, 200);
        let stroke = UStroke::simple();
        let mut sg = new_sg();
        draw_divider(&mut sg, &tm, &area, &border, &bg, &stroke, 5.0, 0.0, false);
        let body = sg.body();
        let rect_count = body.matches("<rect").count();
        assert!(rect_count >= 2, "expected >= 2 rects, got {}", rect_count); // sep rect + text rect
    }

    #[test]
    fn draw_grouping_header_produces_ops() {
        let tm = TextMetrics::new(15.0, 30.0, 1.0, 40.0, 14.0);
        let area = Area::new(200.0, 30.0);
        let fashion = Fashion::new(Some(HColor::rgb(200, 200, 200)), Some(HColor::rgb(0, 0, 0)));
        let corner_fashion =
            Fashion::new(Some(HColor::rgb(180, 180, 180)), Some(HColor::rgb(0, 0, 0)));
        let bg = HColor::rgb(240, 240, 240);
        let mut sg = new_sg();
        draw_grouping_header(&mut sg, &tm, &area, &fashion, &corner_fashion, &bg, 0.0);
        let body = sg.body();
        assert!(!body.is_empty());
        let rect_count = body.matches("<rect").count();
        assert!(rect_count >= 2, "expected >= 2 rects, got {}", rect_count); // background + outline
    }

    #[test]
    fn draw_grouping_else_produces_line() {
        let tm = make_text(30.0, 14.0);
        let area = Area::new(200.0, 20.0);
        let color = HColor::rgb(0, 0, 0);
        let mut sg = new_sg();
        draw_grouping_else(&mut sg, &tm, &area, &color);
        let body = sg.body();
        assert_eq!(body.matches("<line").count(), 1);
    }

    #[test]
    fn draw_line_produces_ops() {
        let area = Area::new(10.0, 100.0);
        let color = HColor::rgb(0, 0, 0);
        let stroke = UStroke::new(5.0, 5.0, 1.0);
        let mut sg = new_sg();
        draw_line(&mut sg, &area, &color, &stroke);
        let body = sg.body();
        // hover rect + line
        assert!(body.contains("<rect"), "should have a rect");
        assert!(body.contains("<line"), "should have a line");
    }

    #[test]
    fn draw_active_line_close_both() {
        let area = Area::new(20.0, 50.0);
        let fashion = Fashion::new(Some(HColor::rgb(255, 255, 200)), Some(HColor::rgb(0, 0, 0)));
        let mut sg = new_sg();
        draw_active_line(&mut sg, &area, &fashion, true, true);
        let body = sg.body();
        let rect_count = body.matches("<rect").count();
        assert_eq!(rect_count, 1);
    }

    #[test]
    fn draw_active_line_open_both() {
        let area = Area::new(20.0, 50.0);
        let fashion = Fashion::new(Some(HColor::rgb(255, 255, 200)), Some(HColor::rgb(0, 0, 0)));
        let mut sg = new_sg();
        draw_active_line(&mut sg, &area, &fashion, false, false);
        let body = sg.body();
        // background rect + 2 vertical lines, no horizontal
        let line_count = body.matches("<line").count();
        assert_eq!(line_count, 2);
    }

    #[test]
    fn draw_active_line_zero_height() {
        let area = Area::new(20.0, 0.0);
        let fashion = Fashion::new(Some(HColor::rgb(255, 255, 200)), Some(HColor::rgb(0, 0, 0)));
        let mut sg = new_sg();
        draw_active_line(&mut sg, &area, &fashion, true, true);
        assert!(sg.body().is_empty());
    }

    #[test]
    fn draw_destroy_produces_two_lines() {
        let color = HColor::rgb(0, 0, 0);
        let stroke = UStroke::with_thickness(2.0);
        let mut sg = new_sg();
        draw_destroy(&mut sg, &color, &stroke);
        let body = sg.body();
        assert_eq!(body.matches("<line").count(), 2);
    }

    #[test]
    fn draw_delay_line_produces_one_line() {
        let area = Area::new(10.0, 50.0);
        let color = HColor::rgb(0, 0, 0);
        let stroke = UStroke::simple();
        let mut sg = new_sg();
        draw_delay_line(&mut sg, &area, &color, &stroke);
        let body = sg.body();
        assert_eq!(body.matches("<line").count(), 1);
    }

    #[test]
    fn draw_newpage_produces_one_line() {
        let area = Area::new(200.0, 1.0);
        let color = HColor::rgb(0, 0, 0);
        let stroke = UStroke::simple();
        let mut sg = new_sg();
        draw_newpage(&mut sg, &area, &color, &stroke);
        let body = sg.body();
        assert_eq!(body.matches("<line").count(), 1);
    }

    #[test]
    fn draw_reference_produces_rect_and_path() {
        let tm = make_text(80.0, 14.0);
        let area = Area::new(200.0, 60.0);
        let header_fashion =
            Fashion::new(Some(HColor::rgb(200, 200, 200)), Some(HColor::rgb(0, 0, 0)));
        let body_fashion =
            Fashion::new(Some(HColor::rgb(255, 255, 255)), Some(HColor::rgb(0, 0, 0)));
        let mut sg = new_sg();
        draw_reference(
            &mut sg,
            &tm,
            &area,
            &header_fashion,
            &body_fashion,
            30.0,
            14.0,
            0.0,
        );
        let body = sg.body();
        let rect_count = body.matches("<rect").count();
        let path_count = body.matches("<path").count();
        assert_eq!(rect_count, 1);
        assert_eq!(path_count, 1);
    }

    #[test]
    fn draw_note_box_produces_rect() {
        let tm = make_text(50.0, 14.0);
        let area = Area::new(80.0, 30.0);
        let fashion = Fashion::new(Some(HColor::rgb(255, 255, 200)), Some(HColor::rgb(0, 0, 0)));
        let mut sg = new_sg();
        draw_note_box(&mut sg, &tm, &area, &fashion, 5.0);
        let body = sg.body();
        let rect_count = body.matches("<rect").count();
        assert_eq!(rect_count, 1);
    }

    #[test]
    fn draw_note_hexagonal_produces_polygon() {
        let tm = make_text(50.0, 14.0);
        let area = Area::new(80.0, 30.0);
        let fashion = Fashion::new(Some(HColor::rgb(255, 255, 200)), Some(HColor::rgb(0, 0, 0)));
        let mut sg = new_sg();
        draw_note_hexagonal(&mut sg, &tm, &area, &fashion);
        let body = sg.body();
        let poly_count = body.matches("<polygon").count();
        assert_eq!(poly_count, 1);
    }

    #[test]
    fn draw_englober_produces_rect() {
        let tm = TextMetrics::new(3.0, 3.0, 1.0, 60.0, 14.0);
        let area = Area::new(100.0, 20.0);
        let fashion = Fashion::new(Some(HColor::rgb(240, 240, 240)), Some(HColor::rgb(0, 0, 0)));
        let mut sg = new_sg();
        draw_englober(&mut sg, &tm, &area, &fashion, 5.0);
        let body = sg.body();
        assert_eq!(body.matches("<rect").count(), 1);
    }

    // ── Corner paths ────────────────────────────────────────────────

    #[test]
    fn grouping_corner_path_no_round() {
        let path = grouping_corner_path(50.0, 20.0, 0.0);
        assert_eq!(path.segments.len(), 6); // move + 5 lines
    }

    #[test]
    fn grouping_corner_path_with_round() {
        let path = grouping_corner_path(50.0, 20.0, 10.0);
        // move + lines + arc
        assert!(path.segments.len() >= 7);
    }

    #[test]
    fn reference_corner_path_no_round() {
        let path = reference_corner_path(50.0, 20.0, 0.0);
        assert_eq!(path.segments.len(), 6);
    }

    #[test]
    fn reference_corner_path_with_round() {
        let path = reference_corner_path(50.0, 20.0, 10.0);
        assert!(path.segments.len() >= 7);
    }

    // ── Area ────────────────────────────────────────────────────────

    #[test]
    fn area_new() {
        let a = Area::new(100.0, 50.0);
        assert_eq!(a.dimension.width, 100.0);
        assert_eq!(a.dimension.height, 50.0);
        assert_eq!(a.delta_x1, 0.0);
    }

    #[test]
    fn area_from_dim() {
        let dim = XDimension2D::new(200.0, 100.0);
        let a = Area::from_dim(dim);
        assert_eq!(a.dimension.width, 200.0);
    }

    #[test]
    fn area_with_delta() {
        let a = Area::new(100.0, 50.0)
            .with_delta_x1(10.0)
            .with_text_delta_x(5.0);
        assert_eq!(a.delta_x1, 10.0);
        assert_eq!(a.text_delta_x, 5.0);
    }
}
