use std::collections::HashMap;

use crate::font_metrics;
use crate::model::sequence::{
    FragmentKind, ParticipantKind, SeqArrowHead, SeqArrowStyle, SeqDirection, SeqEvent,
};
use crate::model::SequenceDiagram;
use crate::skin::rose::{self, TextMetrics, NOTE_PADDING, SEQ_NOTE_FOLD as NOTE_FOLD};
use crate::Result;

// ── Constants ────────────────────────────────────────────────────────────────

const FONT_SIZE: f64 = 14.0;
const SELF_MSG_WIDTH: f64 = 42.0;
const ACTIVATION_WIDTH: f64 = 10.0;
const NOTE_FONT_SIZE: f64 = 13.0;
const GROUP_PADDING: f64 = 10.0;
const FRAGMENT_PADDING: f64 = 10.0;
const REF_EDGE_PAD: f64 = 3.0;
const MARGIN: f64 = 5.0;
/// Java note component padding (Rose.paddingX = 5). Added on each side of the
/// note's drawn area when computing InGroupable extents for fragment bounds.
const NOTE_COMPONENT_PADDING_X: f64 = 5.0;
/// Java ComponentRoseNote paddingY (Rose.paddingY = 5).
/// Applied via AbstractComponent.drawU before drawInternalU.
const NOTE_COMPONENT_PADDING_Y: f64 = 5.0;
const MSG_FONT_SIZE: f64 = 13.0;
/// Font size for fragment else/separator labels. Java: SansSerif 11pt
const FRAG_ELSE_FONT_SIZE: f64 = 11.0;
/// Font size for delay text. Java: rose.skin delay { FontSize 11 }
const DELAY_FONT_SIZE: f64 = 11.0;

fn active_left_shift(level: usize) -> f64 {
    if level == 0 {
        0.0
    } else {
        ACTIVATION_WIDTH / 2.0
    }
}

fn active_right_shift(level: usize) -> f64 {
    level as f64 * (ACTIVATION_WIDTH / 2.0)
}

fn live_thickness_width(level: usize) -> f64 {
    active_left_shift(level) + active_right_shift(level)
}

// ── Dynamic layout parameters computed from rose preferred_size functions ────

/// Layout parameters derived from rose::preferred_size functions and font metrics.
/// Replaces the former hardcoded constants so that sizes respond to font changes.
struct LayoutParams {
    /// Arrow component height (Java: ComponentRoseArrow.getPreferredHeight)
    message_spacing: f64,
    /// Self-arrow internal height
    self_msg_height: f64,
    /// Participant box height for default (non-actor) kind
    participant_height: f64,
    /// Message text line height (SansSerif 13pt)
    msg_line_height: f64,
    /// Fragment header height (Java: ComponentRoseGroupingHeader)
    #[allow(dead_code)] // stored for future fragment rendering
    frag_header_height: f64,
    /// Divider component height
    divider_height: f64,
    /// Delay component height
    delay_height: f64,
    /// Reference frame height (per-ref, but default for empty label)
    ref_height: f64,
    // Fragment y-spacing: derived from component heights
    frag_y_backoff: f64,
    frag_after_header: f64,
    frag_sep_backoff: f64,
    frag_after_sep: f64,
    frag_end_backoff: f64,
    frag_after_end: f64,
    ref_y_backoff: f64,
    ref_after_end: f64,
    /// Offset from freeY (top of arrow component) to the arrow line (msg_y).
    /// Java: ComponentRoseArrow.getYPoint = textHeight + paddingY
    arrow_y_point: f64,
}

impl LayoutParams {
    fn compute(font_family: &str, msg_font_size: f64, part_font_size: f64) -> Self {
        let h13 = font_metrics::line_height(font_family, msg_font_size, false, false);
        let h14 = font_metrics::line_height(font_family, part_font_size, false, false);
        let h11 = font_metrics::line_height(font_family, FRAG_ELSE_FONT_SIZE, false, false);

        // Arrow height = message spacing between consecutive messages
        let arrow_tm = TextMetrics::new(7.0, 7.0, 1.0, 0.0, h13);
        let message_spacing = rose::arrow_preferred_size(&arrow_tm, 0.0, 0.0).height;

        // Self-arrow internal height
        let self_msg_height = rose::SELF_ARROW_ONLY_HEIGHT;

        // Participant box height (default kind, single line, no shadow)
        let part_tm = TextMetrics::new(5.0, 5.0, 6.5, 0.0, h14);
        let participant_height =
            rose::participant_preferred_size(&part_tm, 0.0, false, 0.0, 0.0).height;

        // Fragment header height: margin_y=0 matches Java layout positioning
        let frag_header_height = h13 + 2.0;

        // Divider/delay heights for empty text
        // Java: ComponentRoseDivider super(marginX1=4, marginX2=4, marginY=4)
        let divider_tm = TextMetrics::new(4.0, 4.0, 4.0, 0.0, 0.0);
        let divider_height = rose::divider_preferred_size(&divider_tm).height;

        // Java: ComponentRoseDelayText super(marginX1=0, marginX2=0, marginY=4)
        let delay_tm = TextMetrics::new(0.0, 0.0, 4.0, 0.0, 0.0);
        let delay_height = rose::delay_text_preferred_size(&delay_tm).height;

        // Reference frame height: h13 (body line) + h14 (header line scaled) +
        // REF_HEIGHT_FOOTER(5) + header_offset(2) + Java Step/Frontier internal delta
        let ref_height = h13 + h14 + rose::REF_HEIGHT_FOOTER + 2.0 + 0.671875;

        // Fragment y-spacing: derived from font metrics
        let frag_y_backoff = h13 - 1.0;
        let frag_after_header = 2.0 * h13 + 8.0;
        let frag_sep_backoff = h13 + 5.0;
        let frag_after_sep = h13 + h11 + rose::GROUPING_SPACE_HEIGHT;
        let frag_end_backoff = h13 + 6.0;
        let frag_after_end = message_spacing - 1.0;
        let ref_y_backoff = h13 + 6.0;
        let ref_after_end = message_spacing - 3.0;

        // Arrow y-point: offset from freeY to the actual arrow line position.
        // Java: ComponentRoseArrow.getYPoint = textHeight + paddingY
        let arrow_y_point = arrow_tm.text_height() + rose::ARROW_PADDING_Y;

        Self {
            message_spacing,
            self_msg_height,
            participant_height,
            msg_line_height: h13,
            frag_header_height,
            divider_height,
            delay_height,
            ref_height,
            frag_y_backoff,
            frag_after_header,
            frag_sep_backoff,
            frag_after_sep,
            frag_end_backoff,
            frag_after_end,
            ref_y_backoff,
            ref_after_end,
            arrow_y_point,
        }
    }
}

/// Fragment stack entry tracking open fragments during layout.
struct FragmentStackEntry {
    y_start: f64,
    kind: FragmentKind,
    label: String,
    separators: Vec<(f64, String)>,
    min_part_idx: Option<usize>,
    max_part_idx: Option<usize>,
    depth_at_push: usize,
    /// Minimum x-extent of all messages within this fragment (includes text area)
    msg_min_x: Option<f64>,
    /// Maximum x-extent of all messages within this fragment (includes text area)
    msg_max_x: Option<f64>,
    /// Background color from `#color` prefix
    color: Option<String>,
}

// ── Layout output types ──────────────────────────────────────────────────────

/// Participant layout info
#[derive(Debug, Clone)]
pub struct ParticipantLayout {
    pub name: String,
    pub x: f64,
    pub box_width: f64,
    pub box_height: f64,
    pub kind: ParticipantKind,
    pub color: Option<String>,
}

/// Message layout info
#[derive(Debug, Clone)]
pub struct MessageLayout {
    pub from_x: f64,
    pub to_x: f64,
    pub y: f64,
    pub text: String,
    pub text_lines: Vec<String>,
    pub is_self: bool,
    pub is_dashed: bool,
    pub is_left: bool,
    pub has_open_head: bool,
    /// Arrow head type for rendering (full V, top half, bottom half)
    pub arrow_head: SeqArrowHead,
    /// Autonumber string (e.g. "1", "2") — rendered as separate text element
    pub autonumber: Option<String>,
    /// Source line number (0-based) for data-source-line SVG attribute
    pub source_line: Option<usize>,
    /// For self-messages: the effective left x for the return arrow, accounting
    /// for any activation bar that overlaps at the return y.
    /// `return_x = max(from_x, activation_bar_right) + 1`
    pub self_return_x: f64,
    /// For self-messages: the participant center x (pos2). Used by the renderer
    /// for text positioning, which Java bases on pos2 not the activation edge.
    pub self_center_x: f64,
    /// Per-message arrow color override (from `[#color]` syntax)
    pub color: Option<String>,
    /// Circle decoration on the "from" end of the arrow
    pub circle_from: bool,
    /// Circle decoration on the "to" end of the arrow
    pub circle_to: bool,
    /// Cross (X) decoration on the "from" end of the arrow
    pub cross_from: bool,
    /// Cross (X) decoration on the "to" end of the arrow
    pub cross_to: bool,
    /// Bidirectional arrow: arrowheads at both ends
    pub bidirectional: bool,
    /// Text horizontal offset for boundary arrows.
    /// Java CommunicationExoTile uses textDeltaX to shift text when the arrow
    /// area extends to the diagram edge but text remains near the participant.
    pub text_delta_x: f64,
    /// Activation level at the self-message participant (levelIgnore in Java).
    /// Used by the renderer to adjust self-message line positions for stacked
    /// activation bars (Java: CommunicationTileSelf.drawU level-based shift).
    pub active_level: usize,
    /// Java: area.deltaX1 = (levelIgnore - levelConsidere) * LIVE_DELTA_SIZE.
    /// Used by ComponentRoseSelfArrow.drawLeftSide to adjust x1/x2 line
    /// endpoints when activation level changes on this message.
    pub delta_x1: f64,
}

/// Activation bar layout
#[derive(Debug, Clone)]
pub struct ActivationLayout {
    pub participant: String,
    pub x: f64,
    pub y_start: f64,
    pub y_end: f64,
    /// Nesting level (1-based). Level 1 = first activation, 2 = nested, etc.
    pub level: usize,
    /// Optional background color for the activation bar (e.g., "#FF0000")
    pub color: Option<String>,
}

/// Destroy marker layout
#[derive(Debug, Clone)]
pub struct DestroyLayout {
    pub x: f64,
    pub y: f64,
    /// Owning participant name (for teoz per-participant draw order).
    /// Empty string when the destroy is not bound to a specific participant.
    pub participant: String,
}

/// Note layout
#[derive(Debug, Clone)]
pub struct NoteLayout {
    pub x: f64,
    pub y: f64,
    /// Visual width used for polygon rendering (estimate_note_width).
    pub width: f64,
    /// Layout width = visual width + 2*paddingX (10px).
    /// Matches Java ComponentRoseNote.getPreferredWidth.
    pub layout_width: f64,
    pub height: f64,
    pub text: String,
    pub is_left: bool,
    /// Whether this note is attached to a self-message (affects width computation).
    pub(crate) is_self_msg_note: bool,
    /// Whether this note is attached to any message (for note-on-message y-binding).
    #[allow(dead_code)]
    pub(crate) is_note_on_message: bool,
    /// Index of the associated message (for rendering order).
    /// None for standalone notes (not following a message).
    pub(crate) assoc_message_idx: Option<usize>,
    /// Whether this note was laid out in teoz mode (affects x truncation).
    /// In teoz mode, note x coordinates come from the constraint solver
    /// and should not be truncated.
    pub(crate) teoz_mode: bool,
    /// Optional background color override (from `note right #red`)
    pub color: Option<String>,
}

/// Group box layout
#[derive(Debug, Clone)]
pub struct GroupLayout {
    pub x: f64,
    pub y_start: f64,
    pub y_end: f64,
    pub width: f64,
    pub label: Option<String>,
}

/// Combined fragment layout
#[derive(Debug, Clone)]
pub struct FragmentLayout {
    pub kind: FragmentKind,
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// (y_position, label) for each separator (else) within the fragment
    pub separators: Vec<(f64, String)>,
    /// Index of the first message tile inside this fragment (for render ordering).
    /// Used to interleave fragment frames with messages in correct tile order.
    pub first_msg_index: Option<usize>,
    /// Background color from `#color` prefix (e.g., `group #ffa Label`)
    pub color: Option<String>,
}

/// Divider layout
#[derive(Debug, Clone)]
pub struct DividerLayout {
    pub y: f64,
    pub x: f64,
    pub width: f64,
    pub height: f64,
    pub text: Option<String>,
    /// Java component origin Y (startingY = y - arrow_y_point).
    /// Used for correct drawing position calculations.
    pub component_y: f64,
}

/// Delay indicator layout
#[derive(Debug, Clone)]
pub struct DelayLayout {
    pub y: f64,
    pub height: f64,
    pub x: f64,
    pub width: f64,
    pub text: Option<String>,
    /// Y coordinate where lifeline break starts (Java freeY at delay start).
    /// The break ends at `lifeline_break_y + height`.
    pub lifeline_break_y: f64,
}

/// Ref layout
#[derive(Debug, Clone)]
pub struct RefLayout {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub label: String,
}

/// Complete sequence diagram layout result
#[derive(Debug, Clone)]
pub struct SeqLayout {
    pub participants: Vec<ParticipantLayout>,
    pub messages: Vec<MessageLayout>,
    pub activations: Vec<ActivationLayout>,
    pub destroys: Vec<DestroyLayout>,
    pub notes: Vec<NoteLayout>,
    pub groups: Vec<GroupLayout>,
    pub fragments: Vec<FragmentLayout>,
    pub dividers: Vec<DividerLayout>,
    pub delays: Vec<DelayLayout>,
    pub refs: Vec<RefLayout>,
    pub autonumber_enabled: bool,
    pub autonumber_start: u32,
    pub lifeline_top: f64,
    pub lifeline_bottom: f64,
    pub total_width: f64,
    pub total_height: f64,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Find the center x coordinate for a participant by name
fn find_participant_x(participants: &[ParticipantLayout], name: &str) -> f64 {
    for p in participants {
        if p.name == name {
            return p.x;
        }
    }
    log::warn!("participant '{name}' not found in layout, defaulting to 0");
    0.0
}

/// Find the index of a participant by name
fn find_participant_idx(name_to_idx: &HashMap<String, usize>, name: &str) -> Option<usize> {
    name_to_idx.get(name).copied()
}

/// Update min/max participant indices for all open fragments on the stack
fn update_fragment_participant_range(fragment_stack: &mut [FragmentStackEntry], idx: usize) {
    for entry in fragment_stack.iter_mut() {
        entry.min_part_idx = Some(entry.min_part_idx.map_or(idx, |cur| cur.min(idx)));
        entry.max_part_idx = Some(entry.max_part_idx.map_or(idx, |cur| cur.max(idx)));
    }
}

/// Update message x-extent tracking for all open fragments on the stack.
/// Called when a message is laid out; min_x/max_x represent the message's
/// full horizontal footprint including text area.
fn update_fragment_message_extent(
    fragment_stack: &mut [FragmentStackEntry],
    min_x: f64,
    max_x: f64,
) {
    for entry in fragment_stack.iter_mut() {
        entry.msg_min_x = Some(entry.msg_min_x.map_or(min_x, |cur| cur.min(min_x)));
        entry.msg_max_x = Some(entry.msg_max_x.map_or(max_x, |cur| cur.max(max_x)));
    }
}

/// Count effective text lines, splitting on real newlines and NEWLINE_CHAR.
/// Note: `\n` escape (two-char backslash+n) is NOT expanded here because
/// multiline note text already uses real newlines as separators.  The `\n`
/// escape is only relevant for inline text rendering, handled by the SVG
/// renderer.
#[allow(dead_code)] // reserved for sequence note sizing
fn count_note_lines(text: &str) -> usize {
    text.split(crate::NEWLINE_CHAR)
        .flat_map(|s| s.lines())
        .flat_map(|s| s.split("\\n"))
        .count()
        .max(1)
}

/// Estimate extra height added by creole formatting in note text.
/// Java TextBlock layout adds:
///   - Table rows: each cell in a table (`|...|`) gets +4px padding (2+2)
///   - Horizontal separator (`----` or `====`): ~8px per separator
///   - Bullet items: same height as normal lines (no extra)
///   - Inline SVG sprites: max(sprite_height, line_height) - line_height per sprite line
#[allow(dead_code)] // reserved for sequence note sizing
fn creole_note_extra_height(text: &str) -> f64 {
    let lh = font_metrics::line_height("SansSerif", NOTE_FONT_SIZE, false, false);
    let mut extra = 0.0;
    let mut in_table = false;
    let mut table_rows = 0;
    for line in text.split(crate::NEWLINE_CHAR).flat_map(|s| s.lines()) {
        let trimmed = line.trim();
        if trimmed.starts_with('|') && trimmed.ends_with('|') && trimmed.len() > 2 {
            if !in_table {
                in_table = true;
                table_rows = 0;
            }
            table_rows += 1;
        } else {
            if in_table {
                // Table block ended: add padding per row + border overhead
                extra += table_rows as f64 * 4.0 + 6.0;
                in_table = false;
            }
            if trimmed == "----"
                || trimmed == "===="
                || trimmed.starts_with("----")
                || trimmed.starts_with("====")
            {
                // Horizontal separator line: Java CreoleHorizontalLine height
                extra += 8.0;
            }
            // Inline SVG sprites add their viewBox height when taller than line height
            if let Some(sprite_extra) = estimate_sprite_line_extra_height(trimmed, lh) {
                extra += sprite_extra;
            }
        }
    }
    if in_table {
        extra += table_rows as f64 * 4.0 + 6.0;
    }
    extra
}

/// Estimate extra height from inline sprites on a single line.
/// Returns Some(extra_height) if the line contains sprites that are taller than line_height.
#[allow(dead_code)] // reserved for sequence sprite sizing
pub(crate) fn estimate_sprite_line_extra_height(line: &str, line_height: f64) -> Option<f64> {
    use crate::render::svg_richtext::get_sprite_svg;
    use crate::render::svg_sprite::sprite_info;

    // Quick check: does this line contain <$...>?
    if !line.contains("<$") {
        return None;
    }

    let mut max_sprite_h = 0.0_f64;
    let mut pos = 0;
    while let Some(start) = line[pos..].find("<$") {
        let name_start = pos + start + 2;
        // Find closing > or {
        let end = line[name_start..]
            .find(['>', '{', ','])
            .map(|i| name_start + i)
            .unwrap_or(line.len());
        let name = &line[name_start..end];
        if !name.is_empty() {
            if let Some(svg) = get_sprite_svg(name) {
                let info = sprite_info(&svg);
                max_sprite_h = max_sprite_h.max(info.vb_height);
            }
        }
        pos = end + 1;
        if pos >= line.len() {
            break;
        }
    }

    if max_sprite_h > line_height {
        Some(max_sprite_h - line_height)
    } else {
        None
    }
}

/// Estimate note visual height (for rendering the note polygon).
/// Java ComponentRoseNote: marginY=5, textBlock height computed via BodyEnhanced2.
/// Visual height = (int)(textBlockH + 2*marginY), clamped to min 25.
fn estimate_note_height(text: &str) -> f64 {
    let text_block_h =
        crate::render::svg_richtext::compute_creole_note_text_height(text, NOTE_FONT_SIZE);
    let h = text_block_h + 10.0; // marginY1(5) + marginY2(5) = 10
    h.trunc().max(25.0)
}

/// Estimate note layout preferred height (for ArrowAndNoteBox centering).
/// Java ComponentRoseNote.getPreferredHeight = getTextHeight + 2*paddingY + deltaShadow.
/// paddingY=5 (Rose.paddingY), deltaShadow=0 (default plantuml.skin).
fn estimate_note_preferred_height(text: &str) -> f64 {
    let text_block_h =
        crate::render::svg_richtext::compute_creole_note_text_height(text, NOTE_FONT_SIZE);
    let text_height = text_block_h + 10.0; // textBlockH + 2*marginY(5)
    text_height + 10.0 // + 2*paddingY(5), shadow=0
}

/// Compute note width based on text content using font metrics.
/// Width = left_pad + max_line_width + right_pad (includes fold corner).
/// Table lines and horizontal rules are measured specially (Java block elements).
fn estimate_note_width(text: &str) -> f64 {
    let mut max_line_w = 0.0_f64;
    for line in text
        .split(crate::NEWLINE_CHAR)
        .flat_map(|s| s.lines())
        .flat_map(|s| s.split("\\n"))
    {
        let trimmed = line.trim();
        if trimmed == "----"
            || trimmed == "===="
            || trimmed.starts_with("----")
            || trimmed.starts_with("====")
        {
            // Horizontal rule: width is determined by other content, not by the rule itself
            continue;
        }
        if trimmed.starts_with('|') && trimmed.ends_with('|') && trimmed.len() > 2 {
            // Table row: measure cell widths including space padding.
            // Java StripeTable tokenizes on '|', preserving spaces around content.
            // Cell width = text_width(content_with_spaces) where each cell has
            // a leading and trailing space.
            let cells: Vec<&str> = trimmed[1..trimmed.len() - 1].split('|').collect();
            let mut row_w = 0.0_f64;
            for cell in &cells {
                let cell_text = cell.trim().trim_start_matches('=').trim();
                let bold = cell.trim().starts_with('=');
                let space_w =
                    font_metrics::text_width(" ", "SansSerif", NOTE_FONT_SIZE, bold, false);
                let cw =
                    font_metrics::text_width(cell_text, "SansSerif", NOTE_FONT_SIZE, bold, false);
                row_w += cw + 2.0 * space_w; // Java: ' text ' = space + text + space
            }
            max_line_w = max_line_w.max(row_w);
        } else if trimmed.starts_with("* ") || trimmed.starts_with("# ") {
            // Bullet/numbered list: measure text after bullet marker
            let text_part = &trimmed[2..];
            let w = font_metrics::text_width(text_part, "SansSerif", NOTE_FONT_SIZE, false, false);
            max_line_w = max_line_w.max(w + 12.0); // bullet icon + gap
        } else if line.contains("<&") {
            // OpenIconic icon line: measure icon width + text segments.
            // Java AtomOpenIcon: factor = scale * fontSize / 12.0
            // TextBlockUtils.withMargin(block, 1, 0) adds 1+1 margin.
            let raw = line.trim_end_matches('\r');
            let parsed = crate::parser::creole::parse_inline(raw);
            let w = crate::render::svg_richtext::measure_line_width_with_icons(
                &parsed,
                "SansSerif",
                NOTE_FONT_SIZE,
            );
            max_line_w = max_line_w.max(w);
        } else if line.contains("<img") {
            // Inline image line: measure image width
            let raw = line.trim_end_matches('\r');
            let parsed = crate::parser::creole::parse_inline(raw);
            let w = crate::render::svg_richtext::measure_line_width_with_icons(
                &parsed,
                "SansSerif",
                NOTE_FONT_SIZE,
            );
            max_line_w = max_line_w.max(w);
        } else if line.contains("<$") {
            // Sprite-bearing line: Java BodyEnhanced2 sums atom widths
            // (sprite atoms + text atoms) without trimming whitespace, so
            // any trailing/leading spaces in the source line contribute
            // to the measured line width.
            let raw = line.trim_end_matches('\r');
            let mut sprite_w = 0.0_f64;
            let mut text_segments_w = 0.0_f64;
            let mut pos = 0;
            while let Some(start) = raw[pos..].find("<$") {
                let abs_start = pos + start;
                // Text segment before this sprite
                if abs_start > pos {
                    let seg = &raw[pos..abs_start];
                    text_segments_w +=
                        font_metrics::text_width(seg, "SansSerif", NOTE_FONT_SIZE, false, false);
                }
                let name_start = abs_start + 2;
                if let Some(end) = raw[name_start..].find('>') {
                    let name_part = &raw[name_start..name_start + end];
                    let name = name_part.split(',').next().unwrap_or(name_part).trim();
                    if let Some(svg) = crate::render::svg_richtext::get_sprite_svg(name) {
                        let (sw, _) = parse_sprite_viewbox(&svg);
                        sprite_w += sw;
                    }
                    pos = name_start + end + 1;
                } else {
                    break;
                }
            }
            // Trailing text segment after the last sprite
            if pos < raw.len() {
                let seg = &raw[pos..];
                text_segments_w +=
                    font_metrics::text_width(seg, "SansSerif", NOTE_FONT_SIZE, false, false);
            }
            max_line_w = max_line_w.max(sprite_w + text_segments_w);
        } else {
            // Regular text: strip creole markup for width measurement.
            let plain = crate::render::svg_richtext::creole_plain_text(trimmed);
            let w = font_metrics::text_width(&plain, "SansSerif", NOTE_FONT_SIZE, false, false);
            max_line_w = max_line_w.max(w);
        }
    }
    // left pad (6) + text + right pad (4) + fold (10) = text + 20
    let w = max_line_w + NOTE_PADDING + NOTE_PADDING / 2.0 + NOTE_FOLD + 2.0;
    w.max(30.0)
}

/// Word-wrap a line to fit within `max_width` pixels at the given font size.
/// Returns a vec of wrapped lines.
fn wrap_text_to_width(
    text: &str,
    max_width: f64,
    font_family: &str,
    font_size: f64,
) -> Vec<String> {
    let full_w = font_metrics::text_width(text, font_family, font_size, false, false);
    if full_w <= max_width {
        return vec![text.to_string()];
    }
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        let candidate = if current.is_empty() {
            word.to_string()
        } else {
            format!("{current} {word}")
        };
        let w = font_metrics::text_width(&candidate, font_family, font_size, false, false);
        if w > max_width && !current.is_empty() {
            lines.push(current);
            current = word.to_string();
        } else {
            current = candidate;
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    if lines.is_empty() {
        vec![text.to_string()]
    } else {
        lines
    }
}

// -- Sprite width/height helpers --

fn sprite_text_gap() -> f64 {
    crate::font_metrics::char_width(' ', "SansSerif", 13.0, false, false)
}
/// The line height that an inline sprite replaces in a message body.
/// Uses the actual SansSerif size-13 line height (Java's BodyEnhanced2 uses
/// the same metric), preserving full f64 precision rather than a 4-decimal
/// constant — important to keep lifeline math byte-exact with Java.
fn sprite_height_threshold() -> f64 {
    crate::font_metrics::line_height("SansSerif", 13.0, false, false)
}

fn message_line_width(line: &str, font_family: &str, font_size: f64) -> f64 {
    // Lines with OpenIconic icons or images: use parsed measurement
    if line.contains("<&") || line.contains("<img") {
        let parsed = crate::parser::creole::parse_inline(line);
        return crate::render::svg_richtext::measure_line_width_with_icons(
            &parsed,
            font_family,
            font_size,
        );
    }
    if !line.contains("<$") {
        // Compute width respecting font-family changes in creole markup
        return crate::render::svg_richtext::creole_text_width(
            line,
            font_family,
            font_size,
            false,
            false,
        );
    }
    let gap = sprite_text_gap();
    let mut total = 0.0_f64;
    let mut first = true;
    let mut pos = 0;
    let mut had_sprite = false;
    while let Some(start) = line[pos..].find("<$") {
        let abs_start = pos + start;
        if abs_start > pos {
            let text = &line[pos..abs_start];
            let text = if had_sprite {
                text.strip_prefix(' ').unwrap_or(text)
            } else {
                text
            };
            let text = text.strip_suffix(' ').unwrap_or(text);
            if !text.is_empty() {
                let w = font_metrics::text_width(text, font_family, font_size, false, false);
                if w > 0.0 {
                    if !first {
                        total += gap;
                    }
                    total += w;
                    first = false;
                }
            }
        }
        let name_start = abs_start + 2;
        if let Some(end) = line[name_start..].find('>') {
            let name_part = &line[name_start..name_start + end];
            let name = name_part.split(',').next().unwrap_or(name_part).trim();
            if let Some(svg) = crate::render::svg_richtext::get_sprite_svg(name) {
                let (w, _) = parse_sprite_viewbox(&svg);
                if !first {
                    total += gap;
                }
                total += w;
                first = false;
            }
            pos = name_start + end + 1;
            had_sprite = true;
        } else {
            break;
        }
    }
    if pos < line.len() {
        let text = &line[pos..];
        let text = if had_sprite {
            text.strip_prefix(' ').unwrap_or(text)
        } else {
            text
        };
        if !text.is_empty() {
            let w = font_metrics::text_width(text, font_family, font_size, false, false);
            if w > 0.0 {
                if !first {
                    total += gap;
                }
                total += w;
            }
        }
    }
    total
}

fn message_sprite_extra_height(line: &str) -> f64 {
    if !line.contains("<$") {
        return 0.0;
    }
    let mut max_extra = 0.0_f64;
    let mut pos = 0;
    while let Some(start) = line[pos..].find("<$") {
        let abs_start = pos + start + 2;
        if let Some(end) = line[abs_start..].find('>') {
            let name_part = &line[abs_start..abs_start + end];
            let name = name_part.split(',').next().unwrap_or(name_part).trim();
            if let Some(svg) = crate::render::svg_richtext::get_sprite_svg(name) {
                let (_, h) = parse_sprite_viewbox(&svg);
                let extra = (h - sprite_height_threshold()).max(0.0);
                max_extra = max_extra.max(extra);
            }
            pos = abs_start + end + 1;
        } else {
            break;
        }
    }
    max_extra
}

fn parse_sprite_viewbox(svg: &str) -> (f64, f64) {
    if let Some(vb_start) = svg.find("viewBox=\"") {
        let rest = &svg[vb_start + 9..];
        if let Some(vb_end) = rest.find('"') {
            let parts: Vec<&str> = rest[..vb_end].split_whitespace().collect();
            if parts.len() == 4 {
                return (
                    parts[2].parse().unwrap_or(100.0),
                    parts[3].parse().unwrap_or(50.0),
                );
            }
        }
    }
    (100.0, 50.0)
}

// ── Main layout function ─────────────────────────────────────────────────────

/// Perform columnar layout on a SequenceDiagram
pub fn layout_sequence(sd: &SequenceDiagram, skin: &crate::style::SkinParams) -> Result<SeqLayout> {
    log::debug!(
        "layout_sequence: {} participants, {} events",
        sd.participants.len(),
        sd.events.len()
    );

    // Resolve font family and sizes from skin params
    let default_font = skin.get("defaultfontname").unwrap_or("SansSerif");
    let default_font_size: Option<f64> = skin
        .get("defaultfontsize")
        .and_then(|s| s.parse::<f64>().ok());
    let msg_font_size: f64 = default_font_size.unwrap_or(MSG_FONT_SIZE);
    let participant_font_size: f64 = skin
        .get("participantfontsize")
        .and_then(|s| s.parse::<f64>().ok())
        .or(default_font_size)
        .unwrap_or(FONT_SIZE);

    let lp = LayoutParams::compute(default_font, msg_font_size, participant_font_size);

    // Maxmessagesize skinparam: limits message text width, causing text wrapping
    let max_message_size: Option<f64> = skin
        .get("maxmessagesize")
        .and_then(|s| s.parse::<f64>().ok());
    // Participant box height: already computed in lp with the correct font
    let base_participant_height = lp.participant_height;
    // Actor stickman thickness from style (default 0.5, `!theme plain` sets 1.0)
    let actor_thickness = skin.line_thickness("participant", 0.5);
    // Root margin from style: adds to the base diagram MARGIN (default 0)
    let root_margin: f64 = skin
        .get("root.margin")
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    let effective_margin = MARGIN + root_margin;

    // 1. Compute participant box widths first
    let mut box_widths: Vec<f64> = Vec::with_capacity(sd.participants.len());
    let mut box_heights: Vec<f64> = Vec::with_capacity(sd.participants.len());
    let mut part_name_to_idx: HashMap<String, usize> = HashMap::new();

    for (i, p) in sd.participants.iter().enumerate() {
        let display = p.display_name.as_deref().unwrap_or(&p.name);
        // Split display name by literal \n for multiline participants
        let display_lines: Vec<&str> = display
            .split("\\n")
            .flat_map(|s| s.split(crate::NEWLINE_CHAR))
            .collect();
        let num_lines = display_lines.len();
        let max_line_w = display_lines
            .iter()
            .map(|line| {
                font_metrics::text_width(line, default_font, participant_font_size, false, false)
            })
            .fold(0.0_f64, f64::max);
        let bw = rose::participant_preferred_width(&p.kind, max_line_w, 1.5);
        let participant_line_height =
            font_metrics::line_height(default_font, participant_font_size, false, false);
        let multiline_extra = if num_lines > 1 {
            participant_line_height * (num_lines - 1) as f64
        } else {
            0.0
        };
        // Actor height offset: stickman_height(thickness) - participant_rect_height_offset
        // At default thickness=0.5: stickman_height=60, offset=45.0
        // At thickness=1.0: stickman_height=61, offset=46.0
        // Formula: 45.0 + 2*(thickness - 0.5), since stickman adds 2*thickness
        let actor_extra = 45.0 + 2.0 * (actor_thickness - 0.5);
        let bh = match p.kind {
            ParticipantKind::Actor => base_participant_height + actor_extra + multiline_extra,
            // Boundary/Control/Entity: Java icon height = 32 (radius=12, margin=4)
            // Actor stickman height = 60 → difference = 28, so offset = 45 - 28 = 17
            ParticipantKind::Boundary | ParticipantKind::Control | ParticipantKind::Entity => {
                base_participant_height + 17.0 + multiline_extra
            }
            // Database: Java dimStickman = (36, 46), actor diff = 60-46 = 14, offset = 45-14 = 31
            ParticipantKind::Database => base_participant_height + 31.0 + multiline_extra,
            // Collections: rect + shadow offset (DELTA=4), total = base + 4
            ParticipantKind::Collections => base_participant_height + 4.0 + multiline_extra,
            // Queue: text inside shape, preferredHeight = stickmanDim only
            ParticipantKind::Queue => base_participant_height - 5.0 + multiline_extra,
            ParticipantKind::Default => base_participant_height + multiline_extra,
        };
        box_widths.push(bw);
        box_heights.push(bh);
        part_name_to_idx.insert(p.name.clone(), i);
    }

    // 2. Compute minimum gaps between adjacent participant centers
    // Java: ParticipantPadding adds 2*padding to rect participant preferred widths
    // (actors are NOT affected by ParticipantPadding)
    let participant_padding: f64 = skin
        .get("participantpadding")
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    let n = sd.participants.len();
    // Effective width for gap computation: add 2*padding to non-actor participants
    let effective_widths: Vec<f64> = sd
        .participants
        .iter()
        .enumerate()
        .map(|(i, p)| {
            if matches!(p.kind, ParticipantKind::Actor) {
                box_widths[i]
            } else {
                box_widths[i] + 2.0 * participant_padding
            }
        })
        .collect();
    let mut min_gaps: Vec<f64> = if n > 1 {
        (0..n - 1)
            .map(|i| effective_widths[i] / 2.0 + effective_widths[i + 1] / 2.0 + 10.0)
            .collect()
    } else {
        Vec::new()
    };

    // Scan events in order and reproduce Java's sequence constraints:
    // - normal messages widen the span between participants
    // - self messages widen the gap before/after the participant
    // - current activation level contributes extra live-line thickness
    let mut gap_autonumber_enabled = false;
    let mut gap_autonumber_counter: u32 = 1;
    let mut gap_active_levels: HashMap<&str, usize> = HashMap::new();
    let mut max_active_levels: HashMap<&str, usize> = HashMap::new();
    // Java constraint: for a reverse self-message on the first participant (idx=0),
    // the constraint solver ensures centerX >= arrowPreferredWidth. Track this
    // so we can apply it when positioning participants.
    let mut min_first_center: f64 = 0.0;
    // Multi-participant (span > 1) message constraints, collected as Java teoz
    // difference constraints `posC[hi] - posC[lo] >= needed` and solved by
    // longest-path in the positioning pass below. See `span_constraints` use.
    let mut span_constraints: Vec<(usize, usize, f64)> = Vec::new();
    for event in &sd.events {
        match event {
            SeqEvent::AutoNumber { start } => {
                gap_autonumber_enabled = true;
                if let Some(n) = start {
                    gap_autonumber_counter = *n;
                }
            }
            SeqEvent::Message(msg) => {
                // Compute autonumber extra width
                let autonumber_extra_w = if gap_autonumber_enabled {
                    let num_str = format!("{gap_autonumber_counter}");
                    let num_w = font_metrics::text_width(
                        &num_str,
                        default_font,
                        msg_font_size,
                        true,
                        false,
                    );
                    gap_autonumber_counter += 1;
                    num_w + 4.0 // 4px gap between number and text
                } else {
                    0.0
                };

                let mut text_lines: Vec<String> = msg
                    .text
                    .split("\\n")
                    .flat_map(|s| s.split(crate::NEWLINE_CHAR))
                    .map(ToString::to_string)
                    .collect();
                if let Some(max_w) = max_message_size {
                    text_lines = text_lines
                        .into_iter()
                        .flat_map(|line| {
                            wrap_text_to_width(&line, max_w, default_font, msg_font_size)
                        })
                        .collect();
                }
                let text_w = text_lines
                    .iter()
                    .map(|line| message_line_width(line, default_font, msg_font_size))
                    .fold(0.0_f64, f64::max)
                    + autonumber_extra_w;
                let text_h = lp.msg_line_height * text_lines.len().max(1) as f64;

                if msg.from == msg.to {
                    if let Some(&idx) = part_name_to_idx.get(&msg.from) {
                        let active_level = gap_active_levels
                            .get(msg.from.as_str())
                            .copied()
                            .unwrap_or(0);
                        let tm = rose::TextMetrics::new(7.0, 7.0, 1.0, text_w, text_h);
                        // Java: MessageSelfArrow.getPreferredWidth = componentPrefW + liveLength
                        // Step1Message: length = arrowOnlyWidth + liveLength
                        //             = (componentPrefW + liveLength) + liveLength
                        //             = componentPrefW + 2 * liveLength
                        let live_thick = live_thickness_width(active_level);
                        let needed =
                            rose::self_arrow_preferred_size(&tm).width + live_thick + live_thick;
                        match msg.direction {
                            SeqDirection::LeftToRight => {
                                if idx < min_gaps.len() && needed > min_gaps[idx] {
                                    min_gaps[idx] = needed;
                                }
                            }
                            SeqDirection::RightToLeft => {
                                if idx > 0 && needed > min_gaps[idx - 1] {
                                    min_gaps[idx - 1] = needed;
                                }
                                // Java constraint: for idx=0, constraintBefore
                                // ensures centerX >= arrowPreferredWidth
                                if idx == 0 && needed > min_first_center {
                                    min_first_center = needed;
                                }
                            }
                        }
                    }
                    continue;
                }
                if let (Some(&fi), Some(&ti)) = (
                    part_name_to_idx.get(&msg.from),
                    part_name_to_idx.get(&msg.to),
                ) {
                    let (lo, hi) = if fi < ti { (fi, ti) } else { (ti, fi) };
                    let tm = rose::TextMetrics::new(7.0, 7.0, 1.0, text_w, text_h);
                    let fi_level = gap_active_levels
                        .get(msg.from.as_str())
                        .copied()
                        .unwrap_or(0);
                    let ti_level = gap_active_levels.get(msg.to.as_str()).copied().unwrap_or(0);
                    let needed = rose::arrow_preferred_size(&tm, 0.0, 0.0).width
                        + active_right_shift(fi_level)
                        + active_left_shift(ti_level);
                    let span = hi - lo; // number of gaps this message spans
                    if span > 0 {
                        if span == 1 {
                            // Adjacent participants: widen the single gap directly.
                            if needed > min_gaps[lo] {
                                min_gaps[lo] = needed;
                            }
                        } else {
                            // Multi-participant span: the arrow + label needs the
                            // TOTAL width from `lo` to `hi` to be >= `needed`, not
                            // each individual gap. Java (teoz RealLine) models this
                            // as a difference constraint `posC[hi] - posC[lo] >=
                            // needed`, solved by longest-path when positioning.
                            // Only the final gap absorbs any deficit; earlier gaps
                            // keep their base width. Splitting `needed` evenly
                            // across every gap over-constrains already-satisfied
                            // spans (e.g. an Alice->Log message crossing a very
                            // wide Alice->Bob gap wrongly inflates Bob->Log) —
                            // see issue #28.
                            span_constraints.push((lo, hi, needed));
                        }
                    }
                }
            }
            SeqEvent::Activate(name, _act_color) => {
                let level = gap_active_levels.entry(name.as_str()).or_default();
                *level += 1;
                let max = max_active_levels.entry(name.as_str()).or_default();
                if *level > *max {
                    *max = *level;
                }
            }
            SeqEvent::Deactivate(name) | SeqEvent::Destroy(name) => {
                let level = gap_active_levels.entry(name.as_str()).or_default();
                *level = level.saturating_sub(1);
            }
            _ => {}
        }
    }

    // Java: LivingSpace.getMaxPosition() — the rightward extent of activation
    // bars pushes adjacent participants apart even when no messages span the gap.
    // maxPosition = (width/2) * maxNestingLevel = 5 * maxLevel.
    // Only add extra gap when nested activation bars extend beyond the participant box.
    // This ensures deep nesting doesn't overlap adjacent participant boxes.
    for (i, p) in sd.participants.iter().enumerate() {
        let max_level = max_active_levels.get(p.name.as_str()).copied().unwrap_or(0);
        if max_level > 1 && i < min_gaps.len() {
            // Level L bar right edge = center + L*5 (from nesting shift + bar width)
            let act_right_extent = max_level as f64 * (ACTIVATION_WIDTH / 2.0);
            let half_box = box_widths[i] / 2.0;
            // Only widen gap if activation extends beyond the box
            let overflow = (act_right_extent - half_box).max(0.0);
            if overflow > 0.0 {
                min_gaps[i] += overflow;
            }
        }
    }

    // Pre-scan: compute fragment nesting depth per participant and determine left margin.
    // max_frag_depth_per_participant[i] = max nesting depth (1-based) of fragments involving participant i.
    let mut max_frag_depth: Vec<usize> = vec![0; n];
    {
        // Track (min_idx, max_idx, depth_at_push) per open fragment level
        let mut prescan_stack: Vec<(Option<usize>, Option<usize>, usize)> = Vec::new();

        for event in &sd.events {
            match event {
                SeqEvent::FragmentStart { .. } => {
                    let depth = prescan_stack.len();
                    prescan_stack.push((None, None, depth));
                }
                SeqEvent::Message(msg) => {
                    if !prescan_stack.is_empty() {
                        let fi = part_name_to_idx.get(&msg.from).copied();
                        let ti = part_name_to_idx.get(&msg.to).copied();
                        for entry in prescan_stack.iter_mut() {
                            if let Some(idx) = fi {
                                entry.0 = Some(entry.0.map_or(idx, |cur: usize| cur.min(idx)));
                                entry.1 = Some(entry.1.map_or(idx, |cur: usize| cur.max(idx)));
                            }
                            if let Some(idx) = ti {
                                entry.0 = Some(entry.0.map_or(idx, |cur: usize| cur.min(idx)));
                                entry.1 = Some(entry.1.map_or(idx, |cur: usize| cur.max(idx)));
                            }
                        }
                    }
                }
                SeqEvent::FragmentEnd => {
                    if let Some((min_idx, max_idx, _depth)) = prescan_stack.pop() {
                        let frag_depth = prescan_stack.len() + 1; // 1-based depth
                        if let (Some(lo), Some(hi)) = (min_idx, max_idx) {
                            for depth_val in &mut max_frag_depth[lo..=hi] {
                                if frag_depth > *depth_val {
                                    *depth_val = frag_depth;
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    let max_depth_for_leftmost = if n > 0 { max_frag_depth[0] } else { 0 };
    let left_margin = if max_depth_for_leftmost > 0 {
        2.0 * effective_margin + max_depth_for_leftmost as f64 * FRAGMENT_PADDING
    } else {
        effective_margin
    };

    // 3. Position participants left-to-right using computed gaps.
    // This is a longest-path solve over difference constraints: each adjacent
    // `min_gaps[i-1]` gives `posC[i] >= posC[i-1] + min_gaps[i-1]`, and each
    // multi-span message gives `posC[hi] >= posC[lo] + needed`. A single forward
    // pass is exact because every constraint has lo < i, so posC[lo] is already
    // finalized when participant i is placed.
    let mut participants: Vec<ParticipantLayout> = Vec::with_capacity(n);
    let mut prev_center: Option<f64> = None;
    for (i, p) in sd.participants.iter().enumerate() {
        let center_x = match prev_center {
            // Java: first participant center uses effective width (including
            // ParticipantPadding) so the padded box edge sits at left_margin.
            None => (left_margin + effective_widths[i] / 2.0).max(min_first_center),
            Some(pc) => {
                // Adjacent gap: participant boxes + span-1 messages + activation.
                let mut cx = pc + min_gaps[i - 1];
                // Multi-span message difference constraints (Java teoz RealLine):
                // posC[i] >= posC[lo] + needed.
                for &(lo, hi, needed) in &span_constraints {
                    if hi == i {
                        cx = cx.max(participants[lo].x + needed);
                    }
                }
                cx
            }
        };

        participants.push(ParticipantLayout {
            name: p.name.clone(),
            x: center_x,
            box_width: box_widths[i],
            box_height: box_heights[i],
            kind: p.kind.clone(),
            color: p.color.clone(),
        });

        prev_center = Some(center_x);
    }

    // 2. Event layout
    let max_ph = participants
        .iter()
        .map(|pp| pp.box_height)
        .fold(lp.participant_height, f64::max);

    // Pre-scan: check if any note immediately follows a non-self message.
    // Java PlantUML adds ~3px extra initial spacing when notes overlay
    // regular (non-self) messages. Sprite-bearing messages place the
    // following note BELOW the sprite (standalone NoteBox), so they do
    // not contribute to this overlay-extra spacing.
    let has_regular_msg_note = sd.events.windows(2).any(|w| {
        if let SeqEvent::Message(msg) = &w[0] {
            if msg.from == msg.to {
                return false;
            }
            if !matches!(
                &w[1],
                SeqEvent::NoteRight { .. } | SeqEvent::NoteLeft { .. } | SeqEvent::NoteOver { .. }
            ) {
                return false;
            }
            // Skip if the message text contains a sprite tall enough to
            // push the following note below it (standalone path).
            let msg_sprite_extra = msg
                .text
                .split("\\n")
                .flat_map(|s| s.split(crate::NEWLINE_CHAR))
                .map(message_sprite_extra_height)
                .fold(0.0_f64, f64::max);
            msg_sprite_extra <= 0.0
        } else {
            false
        }
    });
    let note_extra = if has_regular_msg_note { 3.0 } else { 0.0 };
    // Initial y_cursor: MARGIN + max_participant_height + 1(lifeline gap) +
    // line_preferred_height(20) + (msg_line_height - ARROW_DELTA_Y)
    let initial_offset =
        1.0 + rose::line_preferred_size().height + (lp.msg_line_height - rose::ARROW_DELTA_Y);
    let mut y_cursor = MARGIN + max_ph + initial_offset + note_extra;

    // Track the bottom y of the last rendered event for lifeline sizing.
    // Minimum lifeline height matches Java ComponentRoseLine.getPreferredHeight (20px).
    let lifeline_min_bottom = MARGIN + max_ph + 1.0 + 20.0;
    let mut lifeline_extend_y: f64 = lifeline_min_bottom;

    // For self-messages followed by activate: the activation bar should start
    // at the self-message return y, not at y_cursor (which has already advanced
    // to the next message position).  Keyed by participant name.
    let mut pending_self_return_y: HashMap<String, f64> = HashMap::new();

    // Track the y of the most recent message for note back-offset positioning.
    // In Java PlantUML, notes following a message are placed alongside it
    // (overlapping vertically) rather than below it.
    let mut last_message_y: Option<f64> = None;
    let mut last_message_was_self: bool = false;
    // Index of the last message in the messages array (for note association)
    let mut last_message_idx: Option<usize> = None;
    // Name of the last message's target participant (for note activation
    // look-ahead: Java's LifeLine stairs records activate at message y, so a
    // note between a message and the following `activate target` sees
    // level >= 1 even though the activate event comes after the note.)
    let mut last_message_to: Option<String> = None;
    let mut _last_message_from: Option<String> = None;
    // Extra height from multiline message text (used to adjust note back-offset)
    let mut last_message_extra_height: f64 = 0.0;
    // Sprite-specific extra height in the last message text. When sprites
    // make the arrow component significantly taller, the note must be placed
    // BELOW the message (like Java's standalone NoteBox at freeY_after),
    // not alongside it (like Java's on-message ArrowAndNoteBox).
    let mut last_message_sprite_extra: f64 = 0.0;
    // For self-messages: store the starting Y and preferred height of the
    // combined ArrowAndNoteBox tile so notes can be centered within it.
    let mut last_self_msg_starting_y: f64 = 0.0;
    let mut last_self_msg_preferred_h: f64 = 0.0;
    // Java pushes NoteRight by arrowPreferredWidth for non-reverse self-msgs,
    // and NoteLeft by -arrowPreferredWidth for reverse self-msgs.
    let mut last_self_msg_is_left: bool = false;
    let mut last_self_msg_preferred_w: f64 = 0.0;

    // When a note is placed alongside a message (back-offset), the next
    // activate should start at the message's y, not at y_cursor.
    let mut pending_note_activate_y: Option<f64> = None;

    // Track the y of the most recent message for activation/deactivation.
    // Unlike `last_message_y` (used for note back-offset, cleared by notes),
    // this persists across notes so activate/deactivate can bind to the
    // correct message y — matching Java's tile-based y assignment.
    let mut last_event_msg_y: Option<f64> = None;

    let mut messages: Vec<MessageLayout> = Vec::new();
    let mut activations: Vec<ActivationLayout> = Vec::new();
    let mut destroys: Vec<DestroyLayout> = Vec::new();
    let mut notes: Vec<NoteLayout> = Vec::new();
    let mut groups: Vec<GroupLayout> = Vec::new();
    let mut fragments: Vec<FragmentLayout> = Vec::new();
    let mut dividers: Vec<DividerLayout> = Vec::new();
    let mut delays: Vec<DelayLayout> = Vec::new();
    let mut refs: Vec<RefLayout> = Vec::new();
    // Track self-msg notes that need x recomputation after left_overflow shift.
    // Java dynamically recomputes note positions at post-shift coordinates, which
    // gives different (int) truncation results. Stores (note_index, participant_x,
    // note_layout_width, arrow_preferred_width, is_reverse_self_msg).
    let mut self_msg_note_fixups: Vec<(usize, usize, f64, f64, bool)> = Vec::new();
    let mut autonumber_enabled = false;
    let mut autonumber_start: u32 = 1;
    let mut autonumber_counter: u32 = 1;

    // Activation stack: participant name -> Vec<(y_start, level)>
    let mut activation_stack: HashMap<String, Vec<(f64, usize)>> = HashMap::new();
    // Group stack: (y_start, label)
    let mut group_stack: Vec<(f64, Option<String>)> = Vec::new();
    // Fragment stack: (y_start, kind, label, separators)
    let mut fragment_stack: Vec<FragmentStackEntry> = Vec::new();

    let leftmost = participants
        .first()
        .map_or(MARGIN, |p| p.x - p.box_width / 2.0);
    let rightmost = participants
        .last()
        .map_or(MARGIN, |p| p.x + p.box_width / 2.0);
    let full_width = (rightmost - leftmost).max(60.0) + 2.0 * FRAGMENT_PADDING;
    // Divider/delay width: Java uses dimension.getWidth() = content width with MARGIN padding.
    let body_width = (rightmost - leftmost).max(60.0) + 2.0 * MARGIN;
    let body_x = leftmost - MARGIN;

    for (event_idx, event) in sd.events.iter().enumerate() {
        match event {
            SeqEvent::Message(msg) => {
                let mut from_x = find_participant_x(&participants, &msg.from);
                let mut to_x = find_participant_x(&participants, &msg.to);
                let is_self = msg.from == msg.to;
                let is_dashed = msg.arrow_style == SeqArrowStyle::Dashed
                    || msg.arrow_style == SeqArrowStyle::Dotted;
                let is_left = if is_self {
                    // Bidirectional self-messages always loop RIGHT in Java
                    !msg.bidirectional && msg.direction == SeqDirection::RightToLeft
                } else {
                    from_x > to_x
                };

                // Adjust arrow endpoints for activation boxes (Java: LIVE_DELTA_SIZE=5).
                // Incoming arrows stop at the activation box left/right edge,
                // outgoing arrows start from the activation box right/left edge.
                // Java associates LifeEvents with messages, so a message "knows"
                // about upcoming activations. We look ahead past notes to find
                // any Activate for from/to before the next message.
                if !is_self {
                    let from_active = activation_stack
                        .get(&msg.from)
                        .is_some_and(|s| !s.is_empty());
                    let to_active = activation_stack.get(&msg.to).is_some_and(|s| !s.is_empty());
                    // Look-ahead: will the target be activated before the next message?
                    let to_will_activate = !to_active
                        && sd.events[event_idx + 1..]
                            .iter()
                            .take_while(|e| !matches!(e, SeqEvent::Message(_)))
                            .any(|e| matches!(e, SeqEvent::Activate(n, _) if n == &msg.to));
                    // Look-ahead: will the sender be activated before the next message?
                    // Java: activation bar starts at the message y, so offset applies.
                    let from_will_activate = !from_active
                        && sd.events[event_idx + 1..]
                            .iter()
                            .take_while(|e| !matches!(e, SeqEvent::Message(_)))
                            .any(|e| matches!(e, SeqEvent::Activate(n, _) if n == &msg.from));
                    // Look-ahead: will the sender be deactivated before the next message?
                    // Java: activation bar ends at the return message y. getLevel(y)
                    // returns 0 at that point, so no activation offset is applied.
                    let from_will_deactivate = from_active
                        && sd.events[event_idx + 1..]
                            .iter()
                            .take_while(|e| !matches!(e, SeqEvent::Message(_)))
                            .any(|e| matches!(e, SeqEvent::Deactivate(n) if n == &msg.from));
                    if (from_active || from_will_activate) && !from_will_deactivate {
                        if is_left {
                            from_x -= ACTIVATION_WIDTH / 2.0;
                        } else {
                            from_x += ACTIVATION_WIDTH / 2.0;
                        }
                    }
                    // Check if target will be deactivated after this message
                    let to_will_deactivate = to_active
                        && sd.events[event_idx + 1..]
                            .iter()
                            .take_while(|e| !matches!(e, SeqEvent::Message(_)))
                            .any(|e| matches!(e, SeqEvent::Deactivate(n) if n == &msg.to));
                    if (to_active || to_will_activate) && !to_will_deactivate {
                        if is_left {
                            to_x += ACTIVATION_WIDTH / 2.0;
                        } else {
                            to_x -= ACTIVATION_WIDTH / 2.0;
                        }
                    }
                }
                let has_open_head = matches!(
                    msg.arrow_head,
                    SeqArrowHead::Open | SeqArrowHead::HalfTop | SeqArrowHead::HalfBottom
                );

                // Track participant indices for fragment spanning
                if !fragment_stack.is_empty() {
                    if let Some(fi) = find_participant_idx(&part_name_to_idx, &msg.from) {
                        update_fragment_participant_range(&mut fragment_stack, fi);
                    }
                    if let Some(ti) = find_participant_idx(&part_name_to_idx, &msg.to) {
                        update_fragment_participant_range(&mut fragment_stack, ti);
                    }
                }

                let mut text_lines: Vec<String> = msg
                    .text
                    .split("\\n")
                    .flat_map(|s| s.split(crate::NEWLINE_CHAR))
                    .map(|s| s.to_string())
                    .collect();
                // Apply Maxmessagesize word wrapping
                if let Some(max_w) = max_message_size {
                    text_lines = text_lines
                        .into_iter()
                        .flat_map(|line| {
                            wrap_text_to_width(&line, max_w, default_font, msg_font_size)
                        })
                        .collect();
                }
                let num_extra_lines = if text_lines.len() > 1 {
                    text_lines.len() - 1
                } else {
                    0
                };
                // Compute this message's text line height (respecting <size:N> markup).
                // If the text uses a larger font (e.g., <size:18>), the arrow component
                // is taller. Java's tile model uses the actual text block height.
                let msg_line_h = crate::render::svg_richtext::creole_line_height(
                    text_lines.first().map(|s| s.as_str()).unwrap_or(""),
                    default_font,
                    msg_font_size,
                );
                // Extra height from text being taller than the default font size
                let size_extra = msg_line_h - lp.msg_line_height;
                let size_extra = if size_extra > 0.0 { size_extra } else { 0.0 };
                // Multiline message text: extra lines push the arrow down
                let multiline_extra = num_extra_lines as f64 * lp.msg_line_height;
                let sprite_extra = msg
                    .text
                    .split("\\n")
                    .flat_map(|s| s.split(crate::NEWLINE_CHAR))
                    .map(message_sprite_extra_height)
                    .fold(0.0_f64, f64::max);
                let extra_height = multiline_extra + sprite_extra + size_extra;
                // Java: arrow position = freeY + textHeight, where textHeight
                // includes text block height + 2*marginY(1). When text is empty,
                // textHeight = 2 instead of (lineHeight + 2). Our initial y_cursor
                // assumes a single-line text, so subtract the difference for empty text.
                let has_text = text_lines.iter().any(|l| !l.is_empty());
                let empty_text_adjust = if !has_text {
                    lp.msg_line_height // h13: difference between full-line and empty textHeight
                } else {
                    0.0
                };
                // Save tile start (freeY in Java terms) before computing msg_y.
                // y_cursor at this point is freeY + textHeight for the default
                // single-line case. The actual tile start (freeY) is where the
                // tile begins, which is msg_y - back_offset (the note's y position).
                let msg_y = y_cursor + extra_height - empty_text_adjust;
                if is_self {
                    log::debug!("self-msg: text_lines={}, num_extra={num_extra_lines}, extra_height={extra_height}, y_cursor_before={y_cursor}, msg_y={msg_y}", text_lines.len());
                }

                let msg_autonumber = if autonumber_enabled {
                    let num = format!("{autonumber_counter}");
                    autonumber_counter += 1;
                    Some(num)
                } else {
                    None
                };

                // For self-messages, compute activation-aware positions.
                // The return arrow and loop width must clear any activation bar
                // at the return y. This includes look-ahead: if the next event
                // is Activate for this participant, the activation bar will start
                // at the self-message return y.
                let is_activated = is_self
                    && activation_stack
                        .get(&msg.from)
                        .is_some_and(|s| !s.is_empty());
                // Check if activation is about to start (next event is Activate)
                let will_activate = is_self
                    && sd
                        .events
                        .get(event_idx + 1)
                        .is_some_and(|e| matches!(e, SeqEvent::Activate(n, _) if n == &msg.from));
                // Check if deactivation follows (next events before next message
                // include Deactivate for this participant).
                // Java: ComponentRoseSelfArrow deltaY += halfLifeWidth for deactivate.
                let will_deactivate_self = is_self
                    && sd.events[event_idx + 1..]
                        .iter()
                        .take_while(|e| !matches!(e, SeqEvent::Message(_)))
                        .any(|e| matches!(e, SeqEvent::Deactivate(n) if n == &msg.from));

                // Java deltaY adjustments for self-messages:
                //   if isActivate:   deltaY -= halfLifeWidth (shift UP)
                //   if isDeactivate: deltaY += halfLifeWidth (shift DOWN)
                // Both can apply simultaneously.
                // The shift affects RENDERING only (arrow/text position).
                // Activation bar positions use the UNSHIFTED msg_y.
                let mut self_delta_y = 0.0;
                if is_self && will_activate && !is_activated {
                    self_delta_y -= ACTIVATION_WIDTH / 2.0;
                }
                if is_self && will_deactivate_self {
                    self_delta_y += ACTIVATION_WIDTH / 2.0;
                }
                // msg_y_unshifted: used for activation tracking, cursor advancement
                let msg_y_unshifted = msg_y;
                // msg_y: used for rendering (includes deltaY shift)
                let msg_y = msg_y + self_delta_y;

                let (self_from_x, self_return_x, self_to_x) = if is_self {
                    let has_bar = is_activated || will_activate;
                    // For deactivating self-messages, the return arrow lands
                    // BELOW the activation bar (due to deltaY shift), so use
                    // lifeline center (no activation bar at return y).
                    let has_bar_at_return = has_bar && !will_deactivate_self;
                    if is_left {
                        // Left self-message: arrow goes to the LEFT
                        let act_left = if has_bar {
                            from_x - ACTIVATION_WIDTH / 2.0
                        } else {
                            from_x
                        };
                        let ret_edge = if has_bar_at_return { act_left } else { from_x };
                        let outgoing_x = if is_activated { act_left } else { from_x };
                        let ret_x = ret_edge - 1.0;
                        let to = act_left - SELF_MSG_WIDTH;
                        (outgoing_x, ret_x, to)
                    } else {
                        // Right self-message: arrow goes to the RIGHT
                        let act_right = if has_bar {
                            from_x + ACTIVATION_WIDTH / 2.0
                        } else {
                            from_x
                        };
                        let ret_edge = if has_bar_at_return { act_right } else { from_x };
                        let outgoing_x = if is_activated { act_right } else { from_x };
                        let ret_x = ret_edge + 1.0;
                        let to = act_right + SELF_MSG_WIDTH;
                        (outgoing_x, ret_x, to)
                    }
                } else {
                    (from_x, from_x, to_x)
                };

                messages.push(MessageLayout {
                    from_x: if is_self { self_from_x } else { from_x },
                    to_x: if is_self { self_to_x } else { to_x },
                    y: msg_y,
                    text: msg.text.clone(),
                    text_lines: text_lines.clone(),
                    is_self,
                    is_dashed,
                    is_left,
                    has_open_head,
                    arrow_head: msg.arrow_head.clone(),
                    autonumber: msg_autonumber,
                    source_line: msg.source_line,
                    self_return_x,
                    self_center_x: from_x,
                    color: msg.color.clone(),
                    circle_from: msg.circle_from,
                    circle_to: msg.circle_to,
                    cross_from: msg.cross_from,
                    cross_to: msg.cross_to,
                    bidirectional: msg.bidirectional,
                    text_delta_x: 0.0,
                    active_level: 0,
                    delta_x1: 0.0,
                });

                // Compute self-message arrow preferred width (used for fragment
                // bounds AND for note x offset).
                if is_self {
                    let text_w = text_lines
                        .iter()
                        .map(|line| message_line_width(line, default_font, msg_font_size))
                        .fold(0.0_f64, f64::max);
                    let preferred = f64::max(text_w + 14.0, rose::SELF_ARROW_WIDTH + 5.0);
                    last_self_msg_is_left = is_left;
                    last_self_msg_preferred_w = preferred;
                }
                // Track message x-extent for fragment bounds (Java: InGroupable).
                // Self-messages extend beyond the participant box by their text width.
                if is_self && !fragment_stack.is_empty() {
                    let preferred = last_self_msg_preferred_w;
                    let (msg_x_min, msg_x_max) = if is_left {
                        // Left self-message text extends to the left
                        (from_x - preferred, from_x)
                    } else {
                        // Right self-message text extends to the right
                        (from_x, from_x + preferred)
                    };
                    log::trace!("self-msg frag extent: preferred={preferred}, from_x={from_x}, msg_x_min={msg_x_min}, msg_x_max={msg_x_max}");
                    update_fragment_message_extent(&mut fragment_stack, msg_x_min, msg_x_max);
                }

                // Java positions notes alongside messages regardless of
                // line count (both single-line and multi-line).
                last_message_y = Some(msg_y);
                last_message_was_self = is_self;
                last_message_extra_height = extra_height;
                last_message_sprite_extra = sprite_extra;
                last_message_idx = Some(messages.len() - 1);
                last_message_to = Some(msg.to.clone());
                _last_message_from = Some(msg.from.clone());
                // For self-messages with deactivation, the activation bar end
                // position in Java = posYendLevel which maps to msg_y + 1 in
                // SVG coordinates. For non-self messages, msg_y_unshifted works.
                if is_self && will_deactivate_self {
                    last_event_msg_y = Some(msg_y + 1.0);
                } else {
                    last_event_msg_y = Some(msg_y_unshifted);
                }

                if is_self {
                    // Lifeline extent uses unshifted position (deltaY only
                    // affects rendering, not the tile's freeY advancement).
                    let return_y_for_lifeline = msg_y_unshifted + lp.self_msg_height;
                    lifeline_extend_y = return_y_for_lifeline + 18.0;
                    // Java: y advances by ComponentRoseSelfArrow.getPreferredHeight
                    // = textHeight + arrowDeltaY(4) + arrowOnlyHeight(13) + 2*paddingY(0)
                    // where textHeight = textBlockHeight + 2*marginY(1)
                    // textBlockHeight = 0 for empty text, num_lines * lineHeight otherwise
                    let has_text = text_lines.iter().any(|l| !l.is_empty());
                    let text_block_h = if has_text {
                        text_lines.len() as f64 * msg_line_h
                    } else {
                        0.0
                    };
                    let self_margin_y = 1.0; // AbstractComponentRoseArrow marginY
                    let self_text_h = text_block_h + 2.0 * self_margin_y;
                    let self_preferred_h = self_text_h
                        + rose::ARROW_DELTA_Y
                        + rose::SELF_ARROW_ONLY_HEIGHT
                        + 2.0 * rose::ARROW_PADDING_Y;
                    // Save for note centering (Java ArrowAndNoteBox).
                    // Java: msg_y = tile.startingY + paddingY + textHeight
                    // So tile.startingY = msg_y - paddingY - textHeight
                    last_self_msg_starting_y = msg_y - self_text_h - rose::ARROW_PADDING_Y;
                    last_self_msg_preferred_h = self_preferred_h;
                    y_cursor += self_preferred_h;
                    // Java STRICT_SELFMESSAGE_POSITION: activation start uses
                    // arrowYStartLevel + 8, which equals the shifted (rendered)
                    // return y. For destroy/deactivate, the end position uses
                    // arrowYEndLevel (unshifted). Use shifted msg_y for activate
                    // and unshifted msg_y for destroy/deactivate.
                    let pending_y = if will_activate && !is_activated {
                        msg_y + lp.self_msg_height
                    } else {
                        msg_y_unshifted + lp.self_msg_height
                    };
                    pending_self_return_y.insert(msg.from.clone(), pending_y);
                } else {
                    lifeline_extend_y = msg_y + 18.0;
                    y_cursor = msg_y + lp.message_spacing;
                    pending_self_return_y.clear();
                }
            }

            SeqEvent::Activate(name, _act_color) => {
                // Priority: 1) self-message return y, 2) note-attached message y,
                // 3) last message y, 4) y_cursor.
                // Java binds activation start to the message y, not y_cursor.
                let act_y = if let Some(y) = pending_self_return_y.remove(name.as_str()) {
                    y
                } else if let Some(y) = pending_note_activate_y.take() {
                    // When activation follows a note attached to a message,
                    // add extra spacing for subsequent messages to match Java.
                    y_cursor += 3.0;
                    y
                } else {
                    // When activation occurs before any message, Java starts
                    // at lifeline_top + 10, not at y_cursor.
                    let base = last_event_msg_y.unwrap_or(MARGIN + max_ph + 1.0 + 10.0);
                    // Java STRICT_SELFMESSAGE_POSITION: when activation follows
                    // a self-message, add delta1=8 to the posYstartLevel.
                    if last_message_was_self {
                        base + 8.0
                    } else {
                        base
                    }
                };
                let stack = activation_stack.entry(name.clone()).or_default();
                let level = stack.len() + 1; // 1-based nesting level
                log::debug!("activate '{name}' at y={act_y:.1} level={level}");
                stack.push((act_y, level));
            }

            SeqEvent::Deactivate(name) => {
                let px = find_participant_x(&participants, name);
                if let Some(stack) = activation_stack.get_mut(name.as_str()) {
                    if let Some((y_start, level)) = stack.pop() {
                        // Java binds activation end to the deactivating message y,
                        // not y_cursor (which has advanced past the message).
                        let y_end = last_event_msg_y.unwrap_or(y_cursor);
                        // Java shifts nested activations right by (level-1)*width/2
                        let x = px - ACTIVATION_WIDTH / 2.0
                            + (level - 1) as f64 * (ACTIVATION_WIDTH / 2.0);
                        activations.push(ActivationLayout {
                            participant: name.clone(),
                            x,
                            y_start,
                            y_end,
                            level,
                            color: None,
                        });
                        log::debug!(
                            "deactivate '{name}' at y={y_end:.1}, bar from {y_start:.1} level={level}"
                        );
                    } else {
                        log::warn!("deactivate '{name}' with empty stack");
                    }
                } else {
                    log::warn!("deactivate '{name}' without prior activate");
                }
            }

            SeqEvent::Destroy(name) => {
                let px = find_participant_x(&participants, name);
                // For self-messages, the destroy should be at the return y
                let destroy_y = pending_self_return_y
                    .remove(name.as_str())
                    .unwrap_or(y_cursor);
                destroys.push(DestroyLayout {
                    x: px,
                    y: destroy_y,
                    participant: name.clone(),
                });

                // Also close any active activation bar for this participant.
                // The bar ends slightly above the destroy center (offset -7
                // matches Java PlantUML visual spacing).
                if let Some(stack) = activation_stack.get_mut(name.as_str()) {
                    if let Some((y_start, level)) = stack.pop() {
                        let bar_end = destroy_y - 7.0;
                        let x = px - ACTIVATION_WIDTH / 2.0
                            + (level - 1) as f64 * (ACTIVATION_WIDTH / 2.0);
                        activations.push(ActivationLayout {
                            participant: name.clone(),
                            x,
                            y_start,
                            y_end: bar_end,
                            level,
                            color: None,
                        });
                        log::debug!(
                            "destroy-deactivate '{name}' bar from {y_start:.1} to {bar_end:.1} level={level}"
                        );
                    }
                }

                y_cursor = destroy_y + lp.message_spacing;
                last_message_y = None;
                log::debug!("destroy '{name}' at y={destroy_y:.1}");
            }

            SeqEvent::NoteRight {
                participant, text, ..
            } => {
                let px = find_participant_x(&participants, participant);
                let note_height = estimate_note_height(text);
                let note_preferred_h = estimate_note_preferred_height(text);
                let note_width = estimate_note_width(text);
                // In Java PlantUML, notes following a message are placed alongside
                // the message (with a back-offset) rather than below it.
                // The note doesn't advance y_cursor when it fits within the
                // message spacing already consumed.
                let note_y = if let Some(msg_y) = last_message_y {
                    if last_message_was_self {
                        // Java ArrowAndNoteBox: note is centered within the
                        // combined tile height = max(arrowPH, notePH).
                        // Use layout preferred height for centering, but the
                        // note polygon y is at NoteBox.startingY + paddingY.
                        let combined_h = last_self_msg_preferred_h.max(note_preferred_h);
                        let note_push = (combined_h - note_preferred_h) / 2.0;
                        log::debug!("NoteRight(self): startingY={last_self_msg_starting_y}, arrowPH={last_self_msg_preferred_h}, notePrefH={note_preferred_h}, combined={combined_h}, push={note_push}");
                        // Java: note polygon y = imageMargin + freeY + push + paddingY
                        // Our tile_start_y already includes imageMargin, so:
                        last_self_msg_starting_y + note_push + NOTE_COMPONENT_PADDING_Y
                    } else if last_message_sprite_extra > 0.0 {
                        // Sprite messages have a taller arrow component.
                        // In Java, the arrow's preferredHeight includes the
                        // sprite height, advancing freeY past the sprite area.
                        // A standalone NoteBox is placed at freeY_after_arrow,
                        // and its polygon Y = freeY_after + NOTE_COMPONENT_PADDING_Y.
                        // freeY_after = msg.y + (preferred - textHeight)
                        //             = msg.y + ARROW_DELTA_Y(4) + 2*ARROW_PADDING_Y(8)
                        //             = msg.y + 12.
                        // Distance from arrow LINE y to standalone NoteBox top:
                        // freeY_after_arrow - arrow_line_y
                        //   = (freeY + preferred) - (freeY + textHeight + paddingY)
                        //   = arrowDeltaY + paddingY = 4 + 4 = 8
                        let arrow_advance = rose::ARROW_DELTA_Y + rose::ARROW_PADDING_Y;
                        let computed = msg_y + arrow_advance + NOTE_COMPONENT_PADDING_Y;
                        log::debug!("NoteRight(sprite): msg_y={msg_y}, sprite_extra={last_message_sprite_extra}, computed={computed}");
                        computed.max(MARGIN + max_ph)
                    } else {
                        let back_offset =
                            lp.message_spacing - NOTE_FOLD + last_message_extra_height;
                        log::debug!("NoteRight: msg_y={msg_y}, back_offset={back_offset}, note_height={note_height}, y_cursor={y_cursor}");
                        (msg_y - back_offset).max(MARGIN + max_ph)
                    }
                } else {
                    log::debug!("NoteRight: no last_message_y, using y_cursor={y_cursor}");
                    y_cursor
                };
                // Java NoteBox.getStartingX for RIGHT:
                //   xStart = (int)(segment.getPos2()) + delta
                // For non-reverse self-msgs: delta = arrowPreferredWidth (pushToRight).
                // For reverse self-msgs: delta = 0 (no pushToRight applied in
                //   createNoteBox), but the note sits near the lifeline.
                // For non-self messages, use ACTIVATION_WIDTH (matches Java's
                // segment merge which accounts for nearby activation bars).
                let note_layout_width = note_width + 2.0 * NOTE_COMPONENT_PADDING_X;
                // Java NoteBox.getStartingX for RIGHT: (int)(pos2) + delta
                // polygon_x = startingX + paddingX(5) = (int)(pos2) + delta + paddingX
                //
                // For non-self messages, delta = 0 (NoteBox has no pushToRight
                // applied outside the create-arrow path). xStart = (int)(pos2)
                // where pos2 = posC + rightShift(y). Then AbstractComponent.drawU
                // applies (paddingX, paddingY) translate before drawInternalU,
                // so the polygon's visual x = (int)(posC + rightShift) + paddingX.
                //
                // Java's LifeLine.stairs records activate events at the MESSAGE
                // y (DrawableSetInitializer line 495: pos = message.getPosYstartLevel()),
                // not at the `activate` event y. So a note between a message and
                // a following `activate target` sees level >= 1 at its y,
                // shifting xStart right by `level * 5`.
                let note_x = if last_message_was_self {
                    let base = px as i64 as f64; // (int)(pos2)
                    if !last_self_msg_is_left {
                        // Non-reverse self-msg: delta = arrowPW
                        base + last_self_msg_preferred_w + NOTE_COMPONENT_PADDING_X
                    } else {
                        // Reverse self-msg: delta = 0
                        base + NOTE_COMPONENT_PADDING_X
                    }
                } else {
                    // Detect upcoming activation on the note target: the note
                    // attaches to the last message's TARGET participant, and
                    // Java shifts xStart by activation level at message y.
                    //
                    // Current activation_stack state covers levels already
                    // opened. A look-ahead through events until the next
                    // Message catches `activate target` pending for the
                    // target — Java's LifeLine stairs will have recorded this
                    // activation at the message y (≤ note y).
                    let target_name = participant.as_str();
                    let mut look_ahead_level: usize = activation_stack
                        .get(target_name)
                        .map(|s| s.len())
                        .unwrap_or(0);
                    if last_message_to.as_deref() == Some(target_name) {
                        for look_evt in sd.events[event_idx + 1..].iter() {
                            match look_evt {
                                SeqEvent::Message(_) => break,
                                SeqEvent::Activate(name, _) if name == target_name => {
                                    look_ahead_level += 1;
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                    let right_shift = active_right_shift(look_ahead_level);
                    let base = (px + right_shift) as i64 as f64;
                    base + NOTE_COMPONENT_PADDING_X
                };
                let note_right_idx = notes.len();
                notes.push(NoteLayout {
                    x: note_x,
                    y: note_y,
                    width: note_width,
                    layout_width: note_layout_width,
                    height: note_height,
                    text: text.clone(),
                    is_left: false,
                    is_self_msg_note: last_message_was_self,
                    is_note_on_message: last_message_was_self,
                    assoc_message_idx: last_message_idx,
                    teoz_mode: false,
                    color: None,
                });
                // Record self-msg notes for post-shift x recomputation
                if last_message_was_self {
                    if let Some(pidx) = part_name_to_idx.get(participant.as_str()).copied() {
                        self_msg_note_fixups.push((
                            note_right_idx,
                            pidx,
                            note_layout_width,
                            last_self_msg_preferred_w,
                            last_self_msg_is_left,
                        ));
                    }
                }
                // Notes inside fragments expand the fragment bounds (Java: InGroupable).
                // Java NoteBox preferred width = visual_width + 2*paddingX (Rose.paddingX=5).
                // The InGroupable extent includes this padding beyond the visual edges.
                // Java ArrowAndNoteBox.getPreferredWidth also adds noteRightShift
                // (lifeLine.getRightShift(y) + 5) for RIGHT notes.
                if !fragment_stack.is_empty() {
                    let note_right_shift = NOTE_COMPONENT_PADDING_X; // lifeLine.getRightShift(y)=0 for no activation, +5
                    if last_message_was_self {
                        // Java ArrowAndNoteBox.getMaxX = getStartingX + getPreferredWidth.
                        // For reverse self-msg with RIGHT note: getStartingX = centerX - arrowPW,
                        // getPreferredWidth = arrowPW + notePW + rightShift.
                        // maxX = centerX + notePW + rightShift (untruncated px).
                        // min: arrow starts at centerX - arrowPW (for reverse) or noteStartX
                        let starting_x = note_x - NOTE_COMPONENT_PADDING_X;
                        let frag_min = if last_self_msg_is_left {
                            // Reverse: arrow at centerX - arrowPW
                            (px - last_self_msg_preferred_w).min(starting_x)
                        } else {
                            starting_x
                        };
                        // max uses untruncated px to avoid int truncation error
                        let frag_max = px + note_layout_width + note_right_shift;
                        update_fragment_message_extent(&mut fragment_stack, frag_min, frag_max);
                    } else {
                        update_fragment_message_extent(
                            &mut fragment_stack,
                            note_x - NOTE_COMPONENT_PADDING_X,
                            note_x + note_width + NOTE_COMPONENT_PADDING_X + note_right_shift,
                        );
                    }
                }
                // Java ArrowAndNoteBox: combined tile preferred height is
                // max(arrowPreferredH, notePreferredH), measured from tile start.
                // The tile start (freeY) = note_y (note is placed at the tile start).
                // The arrow's total advancement = y_cursor (= msg_y + message_spacing).
                // The note's advancement = note_y + note_preferred_height.
                // If the note extends beyond y_cursor, advance y_cursor.
                let note_pref_h = estimate_note_preferred_height(text);
                if last_message_was_self {
                    let note_tile_bottom = note_y + note_pref_h;
                    if note_tile_bottom > y_cursor {
                        y_cursor = note_tile_bottom;
                    }
                } else if let Some(_msg_y) = last_message_y {
                    // Sprite-bearing messages render the note as a standalone
                    // NoteBox below (not as ArrowAndNoteBox), so skip the
                    // arrow-centering logic that combines them into one tile.
                    if last_message_sprite_extra > 0.0 {
                        let note_bottom = note_y + note_height;
                        if note_bottom > y_cursor {
                            y_cursor = note_bottom;
                        }
                        // Java standalone NoteBox after sprite arrow: the
                        // lifeline reaches notePolygonTop + notePreferredHeight + 5.
                        lifeline_extend_y = lifeline_extend_y.max(note_y + note_pref_h + 5.0);
                    } else {
                        // For non-self messages: tile start = note_y.
                        // Arrow PH from tile start = y_cursor - note_y.
                        // If note PH > arrow PH, push y_cursor forward by the difference.
                        let arrow_ph = if last_message_extra_height > 0.0 {
                            lp.message_spacing + last_message_extra_height
                        } else {
                            y_cursor - note_y
                        };
                        if note_pref_h > arrow_ph {
                            let note_push = note_pref_h - arrow_ph;
                            y_cursor += note_push;
                            // Java ArrowAndNoteBox: when noteH > arrowH, the arrow is
                            // pushed DOWN by (notePH - arrowPH)/2 to vertically center
                            // it within the combined tile.  The arrow_ph used here is
                            // `lp.message_spacing` (Java's arrow.getPreferredHeight),
                            // not the inflated `y_cursor - note_y` that includes
                            // back_offset double-counting.  When a centering push is
                            // applied, also subtract any `note_extra` baseline offset
                            // (3 px), which is otherwise compensating for the lack of
                            // centering at the basic msg_y baseline.
                            let center_arrow_ph = lp.message_spacing + last_message_extra_height;
                            let mut centered = false;
                            if note_pref_h > center_arrow_ph {
                                let arrow_push = (note_pref_h - center_arrow_ph) / 2.0 - note_extra;
                                if arrow_push > 0.0 {
                                    centered = true;
                                    if let Some(midx) = last_message_idx {
                                        if let Some(m) = messages.get_mut(midx) {
                                            m.y += arrow_push;
                                        }
                                    }
                                    if let Some(y) = last_event_msg_y.as_mut() {
                                        *y += arrow_push;
                                    }
                                }
                            }
                            // Ensure lifeline extends past the note polygon + spacing
                            let note_bottom = note_y + note_height;
                            if centered {
                                // Java: after the centered ArrowAndNoteBox tile, the
                                // lifeline reaches NoteBox.startingY + notePH + 5
                                //   = (note_y - 5) + note_pref_h + 10
                                //   = note_y + note_pref_h + 5
                                lifeline_extend_y =
                                    lifeline_extend_y.max(note_y + note_pref_h + 5.0);
                            } else {
                                lifeline_extend_y =
                                    lifeline_extend_y.max(note_bottom + lp.message_spacing / 2.0);
                            }
                        }
                    }
                } else {
                    // Standalone note (not following a message): advance by note height
                    let note_bottom = note_y + note_height;
                    if note_bottom > y_cursor {
                        y_cursor = note_bottom;
                    }
                }
                if last_message_y.is_some() {
                    pending_note_activate_y = last_message_y;
                }
                last_message_y = None;
            }

            SeqEvent::NoteLeft {
                participant, text, ..
            } => {
                let px = find_participant_x(&participants, participant);
                let part_idx_for_note = part_name_to_idx.get(participant.as_str()).copied();
                let note_height = estimate_note_height(text);
                let note_preferred_h = estimate_note_preferred_height(text);
                let note_width = estimate_note_width(text);
                let note_y = if let Some(msg_y) = last_message_y {
                    if last_message_was_self {
                        // Java ArrowAndNoteBox: note centered within combined tile
                        let combined_h = last_self_msg_preferred_h.max(note_preferred_h);
                        let note_push = (combined_h - note_preferred_h) / 2.0;
                        last_self_msg_starting_y + note_push + NOTE_COMPONENT_PADDING_Y
                    } else if last_message_sprite_extra > 0.0 {
                        // Standalone NoteBox below sprite arrow.
                        // Distance from arrow LINE y to standalone NoteBox top:
                        // freeY_after_arrow - arrow_line_y
                        //   = (freeY + preferred) - (freeY + textHeight + paddingY)
                        //   = arrowDeltaY + paddingY = 4 + 4 = 8
                        let arrow_advance = rose::ARROW_DELTA_Y + rose::ARROW_PADDING_Y;
                        let computed = msg_y + arrow_advance + NOTE_COMPONENT_PADDING_Y;
                        log::debug!("NoteLeft(sprite): msg_y={msg_y}, sprite_extra={last_message_sprite_extra}, computed={computed}");
                        computed.max(MARGIN + max_ph)
                    } else {
                        let back_offset =
                            lp.message_spacing - NOTE_FOLD + last_message_extra_height;
                        log::debug!("NoteLeft: msg_y={msg_y}, back_offset={back_offset}, note_height={note_height}, y_cursor={y_cursor}");
                        (msg_y - back_offset).max(MARGIN + max_ph)
                    }
                } else {
                    log::debug!("NoteLeft: no last_message_y, using y_cursor={y_cursor}");
                    y_cursor
                };
                // Java NoteBox.getStartingX for LEFT:
                //   xStart = (int)(segment.getPos1() - notePreferredWidth) + delta
                // where segment.pos1 = centerX - lifeline.getLeftShift(y)
                // For reverse self-msgs: delta = -arrowPreferredWidth (pushToRight).
                // For forward self-msgs: delta = 0 (no pushToRight).
                // Java truncates (pos1 - notePW) to int before adding delta.
                let note_layout_width = note_width + 2.0 * NOTE_COMPONENT_PADDING_X;
                // Java NoteBox.getStartingX computes the NoteBox position;
                // Java AbstractComponent.drawU adds paddingX(5) before drawing
                // the polygon. We compute the final polygon position (startingX + paddingX).
                let note_x = if last_message_was_self {
                    // Java: startingX = (int)(pos1 - notePW) + delta
                    // polygon_x = startingX + paddingX(5) = startingX + NOTE_COMPONENT_PADDING_X
                    let base = (px - note_layout_width) as i64 as f64;
                    let starting_x = if last_self_msg_is_left {
                        // Reverse self-msg: delta = -arrowPW
                        base - last_self_msg_preferred_w
                    } else {
                        // Forward self-msg: delta = 0
                        base
                    };
                    starting_x + NOTE_COMPONENT_PADDING_X
                } else {
                    // Java: startingX = (int)(pos1 - notePW)
                    let sx = (px - note_layout_width) as i64 as f64;
                    sx + NOTE_COMPONENT_PADDING_X
                };
                let note_idx = notes.len();
                notes.push(NoteLayout {
                    x: note_x,
                    y: note_y,
                    width: note_width,
                    layout_width: note_layout_width,
                    height: note_height,
                    text: text.clone(),
                    is_left: true,
                    is_self_msg_note: last_message_was_self,
                    is_note_on_message: last_message_was_self,
                    assoc_message_idx: last_message_idx,
                    teoz_mode: false,
                    color: None,
                });
                // Record self-msg notes for post-shift x recomputation
                if last_message_was_self {
                    if let Some(pidx) = part_idx_for_note {
                        self_msg_note_fixups.push((
                            note_idx,
                            pidx,
                            note_layout_width,
                            last_self_msg_preferred_w,
                            last_self_msg_is_left,
                        ));
                    }
                }
                // Notes inside fragments expand the fragment bounds (Java: InGroupable).
                // Java ArrowAndNoteBox.getMinX/getMaxX = getStartingX()/getStartingX()+getPW().
                // For self-message notes, note_x already includes the full offset
                // (notePreferredWidth + arrowPW), so we use note_x directly.
                // For standalone LEFT notes, we use note_x - paddingX to match Java NoteBox.getMinX.
                if !fragment_stack.is_empty() {
                    let (frag_min, frag_max) = if last_message_was_self {
                        // Java: ArrowAndNoteBox reports note.getStartingX() as min
                        // and note.getStartingX() + combinedPW as max.
                        // note_x is polygon position (startingX + paddingX); subtract
                        // paddingX to get startingX for fragment bounds.
                        let starting_x = note_x - NOTE_COMPONENT_PADDING_X;
                        (
                            starting_x,
                            starting_x + note_layout_width + last_self_msg_preferred_w,
                        )
                    } else {
                        (
                            note_x - NOTE_COMPONENT_PADDING_X,
                            note_x + note_width + NOTE_COMPONENT_PADDING_X,
                        )
                    };
                    update_fragment_message_extent(&mut fragment_stack, frag_min, frag_max);
                }
                let note_pref_h = estimate_note_preferred_height(text);
                if last_message_was_self {
                    let note_tile_bottom = note_y + note_pref_h;
                    if note_tile_bottom > y_cursor {
                        y_cursor = note_tile_bottom;
                    }
                } else if let Some(_msg_y) = last_message_y {
                    let arrow_ph = if last_message_extra_height > 0.0 {
                        // Multiline: use tile preferred height, not y_cursor - note_y
                        // which is inflated by extra_height in the back_offset.
                        lp.message_spacing + last_message_extra_height
                    } else {
                        // Single-line: original formula works correctly
                        y_cursor - note_y
                    };
                    if note_pref_h > arrow_ph {
                        let note_push = note_pref_h - arrow_ph;
                        y_cursor += note_push;
                        // Java ArrowAndNoteBox arrow centering (mirror NoteRight).
                        let center_arrow_ph = lp.message_spacing + last_message_extra_height;
                        let mut centered = false;
                        if note_pref_h > center_arrow_ph {
                            let arrow_push = (note_pref_h - center_arrow_ph) / 2.0 - note_extra;
                            if arrow_push > 0.0 {
                                centered = true;
                                if let Some(midx) = last_message_idx {
                                    if let Some(m) = messages.get_mut(midx) {
                                        m.y += arrow_push;
                                    }
                                }
                                if let Some(y) = last_event_msg_y.as_mut() {
                                    *y += arrow_push;
                                }
                            }
                        }
                        if centered {
                            lifeline_extend_y = lifeline_extend_y.max(note_y + note_pref_h + 5.0);
                        } else {
                            lifeline_extend_y += note_push / 2.0;
                        }
                    }
                } else {
                    let note_bottom = note_y + note_height;
                    if note_bottom > y_cursor {
                        y_cursor = note_bottom;
                    }
                }
                if last_message_y.is_some() {
                    pending_note_activate_y = last_message_y;
                }
                last_message_y = None;
            }

            SeqEvent::NoteOver {
                participants: parts,
                text,
                ..
            } => {
                // Place note centered over the listed participants
                if let (Some(first), Some(last)) = (parts.first(), parts.last()) {
                    let x1 = find_participant_x(&participants, first);
                    let x2 = find_participant_x(&participants, last);
                    let center = (x1 + x2) / 2.0;
                    let note_height = estimate_note_height(text);
                    let note_preferred_h = estimate_note_preferred_height(text);
                    let note_w = estimate_note_width(text);
                    let width = (x2 - x1).abs().max(note_w);
                    let note_y = if let Some(msg_y) = last_message_y {
                        if last_message_was_self {
                            // Java ArrowAndNoteBox: note centered within combined tile
                            let combined_h = last_self_msg_preferred_h.max(note_preferred_h);
                            let note_push = (combined_h - note_preferred_h) / 2.0;
                            last_self_msg_starting_y + note_push + NOTE_COMPONENT_PADDING_Y
                        } else if last_message_sprite_extra > 0.0 {
                            let arrow_advance = rose::ARROW_DELTA_Y + 2.0 * rose::ARROW_PADDING_Y;
                            (msg_y + arrow_advance + NOTE_COMPONENT_PADDING_Y).max(MARGIN + max_ph)
                        } else {
                            let back_offset =
                                lp.message_spacing - NOTE_FOLD + last_message_extra_height;
                            (msg_y - back_offset).max(MARGIN + max_ph)
                        }
                    } else {
                        y_cursor
                    };
                    let note_layout_width = width + 2.0 * NOTE_COMPONENT_PADDING_X;
                    notes.push(NoteLayout {
                        x: center - width / 2.0,
                        y: note_y,
                        width,
                        layout_width: note_layout_width,
                        height: note_height,
                        text: text.clone(),
                        is_left: false,
                        is_self_msg_note: false,
                        is_note_on_message: false,
                        assoc_message_idx: last_message_idx,
                        teoz_mode: false,
                        color: None,
                    });
                    let note_bottom = note_y + note_height;
                    if note_bottom > y_cursor {
                        y_cursor = note_bottom;
                    }
                    if last_message_y.is_some() {
                        pending_note_activate_y = last_message_y;
                    }
                    last_message_y = None;
                }
            }

            SeqEvent::GroupStart { label } => {
                group_stack.push((y_cursor, label.clone()));
                y_cursor += GROUP_PADDING;
                last_message_y = None;
            }

            SeqEvent::GroupEnd => {
                if let Some((y_start, label)) = group_stack.pop() {
                    // Group spans the full width of participants
                    let leftmost = participants
                        .first()
                        .map_or(MARGIN, |p| p.x - p.box_width / 2.0);
                    let rightmost = participants
                        .last()
                        .map_or(MARGIN, |p| p.x + p.box_width / 2.0);
                    groups.push(GroupLayout {
                        x: leftmost - GROUP_PADDING,
                        y_start,
                        y_end: y_cursor,
                        width: (rightmost - leftmost) + 2.0 * GROUP_PADDING,
                        label,
                    });
                    y_cursor += GROUP_PADDING;
                } else {
                    log::warn!("GroupEnd without matching GroupStart");
                }
            }

            SeqEvent::Divider { text } => {
                // Compute text-dependent height (Java: ComponentRoseDivider margins 4,4,4)
                let div_h = if text.is_some() {
                    let th = font_metrics::line_height(default_font, msg_font_size, false, false);
                    let div_tm = TextMetrics::new(4.0, 4.0, 4.0, 0.0, th);
                    rose::divider_preferred_size(&div_tm).height
                } else {
                    lp.divider_height
                };
                let component_y = y_cursor - lp.arrow_y_point;
                dividers.push(DividerLayout {
                    y: y_cursor,
                    x: body_x,
                    width: body_width,
                    height: div_h,
                    text: text.clone(),
                    component_y,
                });
                y_cursor += div_h;
                last_message_y = None;
            }

            SeqEvent::Delay { text } => {
                // Compute text-dependent height (Java: ComponentRoseDelayText margins 0,0,4)
                // Delay uses font size 11 (from rose.skin delay style), not message font size 13
                let del_h = if text.is_some() {
                    let th = font_metrics::line_height(default_font, DELAY_FONT_SIZE, false, false);
                    let del_tm = TextMetrics::new(0.0, 0.0, 4.0, 0.0, th);
                    rose::delay_text_preferred_size(&del_tm).height
                } else {
                    lp.delay_height
                };
                // Lifeline break position: Java freeY at delay start.
                // In Java's model, freeY = msg_y - arrow_y_point, and after a message
                // freeY += message_spacing. So at this point:
                // freeY = y_cursor - arrow_y_point
                let lifeline_break_y = y_cursor - lp.arrow_y_point;
                delays.push(DelayLayout {
                    y: y_cursor,
                    height: del_h,
                    x: leftmost - FRAGMENT_PADDING,
                    width: full_width,
                    text: text.clone(),
                    lifeline_break_y,
                });
                y_cursor += del_h;
                last_message_y = None;
            }

            SeqEvent::FragmentStart {
                kind, label, color, ..
            } => {
                let frag_y = y_cursor - lp.frag_y_backoff;
                let depth = fragment_stack.len();
                fragment_stack.push(FragmentStackEntry {
                    y_start: frag_y,
                    kind: kind.clone(),
                    label: label.clone(),
                    separators: Vec::new(),
                    min_part_idx: None,
                    max_part_idx: None,
                    color: color.clone(),
                    depth_at_push: depth,
                    msg_min_x: None,
                    msg_max_x: None,
                });
                y_cursor = frag_y + lp.frag_after_header;
                last_message_y = None;
            }

            SeqEvent::FragmentSeparator { label } => {
                if let Some(entry) = fragment_stack.last_mut() {
                    let sep_y = y_cursor - lp.frag_sep_backoff;
                    entry.separators.push((sep_y, label.clone()));
                    y_cursor = sep_y + lp.frag_after_sep;
                } else {
                    log::warn!("FragmentSeparator without matching FragmentStart");
                }
            }

            SeqEvent::FragmentEnd => {
                if let Some(fse) = fragment_stack.pop() {
                    let FragmentStackEntry {
                        y_start,
                        kind,
                        label,
                        separators,
                        min_part_idx: min_idx,
                        max_part_idx: max_idx,
                        depth_at_push,
                        msg_min_x,
                        msg_max_x,
                        color,
                    } = fse;
                    let frag_end_y = y_cursor - lp.frag_end_backoff;
                    let frag_height = frag_end_y - y_start;

                    // Compute fragment x and width based on involved participants
                    // AND message text extents (Java: InGroupableList.getMinX/getMaxX).
                    // Nested fragments get increasing padding: innermost uses
                    // FRAGMENT_PADDING, each outer layer adds another FRAGMENT_PADDING.
                    let (frag_left, frag_right) = if let (Some(lo), Some(hi)) = (min_idx, max_idx) {
                        let p_lo = &participants[lo];
                        let p_hi = &participants[hi];
                        let left_pad =
                            FRAGMENT_PADDING * (max_frag_depth[lo] - depth_at_push) as f64;
                        let right_pad =
                            FRAGMENT_PADDING * (max_frag_depth[hi] - depth_at_push) as f64;
                        let mut fl = p_lo.x - p_lo.box_width / 2.0 - left_pad;
                        let mut fr = p_hi.x + p_hi.box_width / 2.0 + right_pad;
                        // Expand fragment bounds to cover message text areas
                        // (Java: arrows are InGroupable members of the group, so
                        // their getMinX/getMaxX expand the group bounds with MARGIN5=5)
                        if let Some(mx) = msg_min_x {
                            fl = fl.min(mx - MARGIN);
                        }
                        if let Some(mx) = msg_max_x {
                            fr = fr.max(mx + MARGIN);
                        }
                        (fl, fr)
                    } else {
                        // Fallback: span all participants
                        (
                            leftmost - FRAGMENT_PADDING,
                            leftmost - FRAGMENT_PADDING + full_width,
                        )
                    };

                    // Compute min width for label tab + guard text.
                    // For Group, the tab displays the label directly (no keyword).
                    // For others, the tab shows the keyword and the guard text
                    // "[label]" is rendered separately to its right.
                    let label_min_w = if kind == FragmentKind::Group {
                        let tab_text = if label.is_empty() {
                            kind.label().to_string()
                        } else {
                            label.clone()
                        };
                        let tab_text_w = font_metrics::text_width(
                            &tab_text,
                            default_font,
                            msg_font_size,
                            true,
                            false,
                        );
                        tab_text_w + 50.0 // 15(left) + text + 30(right+notch) + 5(margin)
                    } else {
                        let kind_text_w = font_metrics::text_width(
                            kind.label(),
                            default_font,
                            msg_font_size,
                            true,
                            false,
                        );
                        // Tab: 15(left) + kind_text_w + 30(right+notch)
                        let tab_right = kind_text_w + 45.0;
                        if !label.is_empty() {
                            let guard_text = format!("[{label}]");
                            let guard_w = font_metrics::text_width(
                                &guard_text,
                                default_font,
                                FRAG_ELSE_FONT_SIZE,
                                true,
                                false,
                            );
                            tab_right + 15.0 + guard_w + 5.0
                        } else {
                            tab_right + 5.0
                        }
                    };
                    let frag_w = (frag_right - frag_left).max(label_min_w);

                    fragments.push(FragmentLayout {
                        kind,
                        label,
                        x: frag_left,
                        y: y_start,
                        width: frag_w,
                        height: frag_height,
                        separators,
                        first_msg_index: None,
                        color: color.clone(),
                    });
                    lifeline_extend_y = frag_end_y + 17.0;
                    y_cursor = frag_end_y + lp.frag_after_end;
                } else {
                    log::warn!("FragmentEnd without matching FragmentStart");
                }
            }

            SeqEvent::Ref {
                participants: parts,
                label,
            } => {
                if let (Some(first), Some(last)) = (parts.first(), parts.last()) {
                    let ref_y = y_cursor - lp.ref_y_backoff;
                    let first_idx = part_name_to_idx.get(first.as_str()).copied();
                    let last_idx = part_name_to_idx.get(last.as_str()).copied();
                    let (left_x, right_x) = if let (Some(fi), Some(li)) = (first_idx, last_idx) {
                        let lo = fi.min(li);
                        let hi = fi.max(li);
                        let p_lo = &participants[lo];
                        let p_hi = &participants[hi];
                        (
                            p_lo.x - p_lo.box_width / 2.0 - REF_EDGE_PAD,
                            p_hi.x + p_hi.box_width / 2.0 + REF_EDGE_PAD,
                        )
                    } else {
                        let x1 = find_participant_x(&participants, first);
                        let x2 = find_participant_x(&participants, last);
                        (x1.min(x2) - 30.0, x1.max(x2) + 30.0)
                    };
                    refs.push(RefLayout {
                        x: left_x,
                        y: ref_y,
                        width: right_x - left_x,
                        height: lp.ref_height,
                        label: label.clone(),
                    });
                    lifeline_extend_y = ref_y + lp.ref_height + 17.0;
                    y_cursor = ref_y + lp.ref_height + lp.ref_after_end;
                    last_message_y = None;
                }
            }

            SeqEvent::Spacing { pixels } => {
                y_cursor += *pixels as f64;
                last_message_y = None;
            }

            SeqEvent::AutoNumber { start } => {
                autonumber_enabled = true;
                if let Some(n) = start {
                    autonumber_start = *n;
                    autonumber_counter = *n;
                }
            }
        }
    }

    // Close any remaining activations (unmatched).
    // Java clips activation boxes to the body area (newpage2 + 1) which equals
    // freeY2_final + 1. In Rust coordinates, this corresponds to:
    //   y_cursor - (msg_line_height + MARGIN)
    // because y_cursor starts at an offset from Java's freeY2 by exactly
    //   initial_offset - 11 = msg_line_height + 6
    // and the +1 from Java's clip boundary brings it to msg_line_height + 5 = msg_line_height + MARGIN.
    let unclosed_end = y_cursor - lp.msg_line_height - MARGIN;
    // Iterate in participant declaration order for deterministic output.
    for p in &participants {
        let Some(stack) = activation_stack.get(&p.name) else {
            continue;
        };
        for &(y_start, level) in stack {
            let name = &p.name;
            let px = find_participant_x(&participants, name);
            let x = px - ACTIVATION_WIDTH / 2.0 + (level - 1) as f64 * (ACTIVATION_WIDTH / 2.0);
            activations.push(ActivationLayout {
                participant: name.clone(),
                x,
                y_start,
                y_end: unclosed_end,
                level,
                color: None,
            });
            log::debug!(
                "unclosed activation for '{name}' from y={y_start:.1}, closing at y={unclosed_end:.1} level={level}"
            );
        }
    }

    // 3. Finalize
    let max_participant_height = participants
        .iter()
        .map(|pp| pp.box_height)
        .fold(lp.participant_height, f64::max);
    let lifeline_top = MARGIN + max_participant_height + 1.0;
    let lifeline_bottom = lifeline_extend_y;

    // Java DrawableSetInitializer tracks `freeX` directly and then ImageBuilder
    // adds the document right margin once. The classic layout here already
    // carries the left-side `MARGIN`, so only one trailing `MARGIN` belongs in
    // the raw body width.
    let right_margin = MARGIN;
    let mut total_width = participants.last().map_or(2.0 * MARGIN, |p| {
        p.x + effective_widths.last().unwrap_or(&p.box_width) / 2.0 + right_margin
    });

    // Expand total_width if any note extends beyond the participant area.
    // For self-message RIGHT notes, Java ArrowAndNoteBox uses the combined
    // tile width (arrowW + notePW + rightShift), plus the Puma right margin.
    // Java: endX = arrow.startingX + arrowPW + notePW + noteRightShift
    //       freeX = max(freeX, endX) ; SVG = freeX + defaultMargins.right(5)
    // Our initial total_width already includes an extra MARGIN(5) over Java's
    // initial freeX (right_margin=10 vs Java's 2*outMargin=10, but our formula
    // adds MARGIN beyond participant right edge). So the self-msg note endX
    // must also include that extra MARGIN to match Java's SVG output.
    for note in &notes {
        let note_right = if note.is_self_msg_note && !note.is_left {
            // Java ArrowAndNoteBox extent:
            //   startingX = min(arrow.startingX, noteBox.startingX)
            //   preferredWidth = arrowPW + notePW + noteRightShift
            //   endX = startingX + preferredWidth
            // For forward self-msg: arrow.startingX = pos2, endX = pos2 + arrowPW + notePW + noteRightShift
            // For reverse self-msg: arrow.startingX = pos2 - arrowPW, endX = pos2 + notePW + noteRightShift
            // noteRightShift = lifeLine.getRightShift(y) + 5 = 0 + 5 = 5 for no activation.
            // Plus Puma right margin (MARGIN=5) to match getDefaultMargins().
            if let Some(mi) = note.assoc_message_idx {
                let msg = &messages[mi];
                let pos2 = msg.from_x; // un-truncated participant center
                let arrow_pw = {
                    let text_w: f64 = msg
                        .text_lines
                        .iter()
                        .map(|line| message_line_width(line, default_font, msg_font_size))
                        .fold(0.0_f64, f64::max);
                    f64::max(text_w + 14.0, rose::SELF_ARROW_WIDTH + 5.0)
                };
                let note_right_shift = NOTE_COMPONENT_PADDING_X; // getRightShift(y)=0 + 5
                let is_reverse = msg.is_self && msg.is_left;
                if is_reverse {
                    // Reverse: endX = pos2 + notePW + noteRightShift
                    pos2 + note.layout_width + note_right_shift + MARGIN
                } else {
                    // Forward: endX = pos2 + arrowPW + notePW + noteRightShift
                    pos2 + arrow_pw + note.layout_width + note_right_shift + MARGIN
                }
            } else {
                // Fallback if no associated message
                (note.x - NOTE_COMPONENT_PADDING_X)
                    + note.layout_width
                    + NOTE_COMPONENT_PADDING_X
                    + MARGIN
            }
        } else {
            // Java NoteBox.getMaxX = (int)(pos2) + preferredWidth, where the int
            // truncation drops the fractional centerX.  Our note.x preserves the
            // fraction (px + ACTIVATION_WIDTH), so truncate here to match Java's
            // viewport contribution.  Add MARGIN for the document right margin.
            (note.x as i64 as f64) + note.width + MARGIN
        };
        if note_right > total_width {
            log::debug!(
                "note extends beyond participants: note_right={note_right:.4}, expanding total_width from {total_width:.4}"
            );
            total_width = note_right;
        }
    }

    // Expand total_width if any fragment extends beyond participants.
    // Java's final SVG width is the fragment right edge plus the document
    // right margin. The fragment geometry already includes its own 10px
    // in-group padding, so adding FRAGMENT_PADDING here double-counts it and
    // widens fragment-heavy diagrams by ~10px.
    for frag in &fragments {
        // Fragments with `else` separators also draw a dashed line whose maxX
        // reaches the raw frame right edge (not the rectangle's `x+w-1`
        // LimitFinder semantics). Java's final dimension therefore picks up
        // one extra pixel before the trailing document margin for these cases.
        let separator_extra = if frag.separators.is_empty() { 0.0 } else { 1.0 };
        let frag_right = frag.x + frag.width + MARGIN + separator_extra;
        if frag_right > total_width {
            total_width = frag_right;
        }
    }

    // Ref frames contribute their visible right edge plus the same trailing
    // document margin as the rest of the sequence body.
    for r in &refs {
        let ref_right = r.x + r.width + MARGIN;
        if ref_right > total_width {
            total_width = ref_right;
        }
    }

    // Account for self-message loops + text extending to the right.
    // Java: self_msg_preferred_width = max(text_w + marginX1(7) + marginX2(7), arrowWidth(45) + 5)
    // The diagram right edge must encompass from_x + preferred_width.
    let self_msg_right = messages
        .iter()
        .filter(|m| m.is_self && !m.is_left)
        .map(|m| {
            let text_w = m
                .text_lines
                .iter()
                .map(|line| message_line_width(line, default_font, msg_font_size))
                .fold(0.0_f64, f64::max);
            let preferred = f64::max(text_w + 14.0, rose::SELF_ARROW_WIDTH + 5.0);
            m.from_x + preferred
        })
        .fold(0.0_f64, f64::max);
    if self_msg_right > total_width {
        total_width = self_msg_right;
    }
    // Also account for fragment right edges extending beyond total_width
    for frag in &fragments {
        let frag_right = frag.x + frag.width;
        if frag_right > total_width {
            total_width = frag_right;
        }
    }
    // Expand total_width for nested activation bars that shift right
    for act in &activations {
        let act_right = act.x + ACTIVATION_WIDTH + MARGIN;
        if act_right > total_width {
            total_width = act_right;
        }
    }
    // Note: right-side note extension is handled by Java's constraint solver
    // during participant positioning, not by prepareMissingSpace. We don't
    // extend total_width for notes here to avoid overshooting.

    // Java: prepareMissingSpace — if graphical elements extend beyond the left
    // boundary (x < 0), shift ALL elements right. This includes both messages
    // (arrows) and fragments (groups/alt/loop) that may extend left due to
    // left self-messages within them.
    let msg_overflow = messages
        .iter()
        .filter(|m| m.is_self && m.is_left)
        .map(|m| {
            let text_w = m
                .text_lines
                .iter()
                .map(|line| message_line_width(line, default_font, msg_font_size))
                .fold(0.0_f64, f64::max);
            let preferred = f64::max(text_w + 14.0, rose::SELF_ARROW_WIDTH + 5.0);
            // Java prepareMissingSpace computes getMinX() for each tile.
            // For a left self-message, this accounts for the activation bar
            // and margin in addition to the component preferred width.
            // When activated, the left extent includes the full activation
            // width plus an additional margin.
            let has_activation = m.from_x < m.self_center_x;
            let act_extra = if has_activation {
                ACTIVATION_WIDTH + MARGIN
            } else {
                0.0
            };
            let left_edge = m.from_x - preferred - act_extra;
            if left_edge < 0.0 {
                -left_edge
            } else {
                0.0
            }
        })
        .fold(0.0_f64, f64::max);
    // Also check fragments: Java's GroupingGraphicalElement.getStartingX() is
    // inGroupableList.getMinX() - MARGIN10 (10px further left than the actual
    // draw position). prepareMissingSpace ensures getStartingX() >= 0, so the
    // effective minimum fragment x after shifting should be >= MARGIN10 (10).
    let frag_overflow = fragments
        .iter()
        .map(|f| {
            let effective_x = f.x - FRAGMENT_PADDING; // MARGIN10 = 10 = FRAGMENT_PADDING
            if effective_x < 0.0 {
                -effective_x
            } else {
                0.0
            }
        })
        .fold(0.0_f64, f64::max);
    // Also check notes: left notes can extend beyond the left boundary.
    // Java prepareMissingSpace uses ev.getStartingX() which for NoteBox
    // returns the NoteBox position (before paddingX). Our note.x stores
    // the polygon position (startingX + paddingX), so we subtract paddingX
    // to recover the NoteBox startingX for overflow calculation.
    let note_overflow = notes
        .iter()
        .map(|n| {
            // Java: startingX = note.x - paddingX for all note types
            let sx = n.x - NOTE_COMPONENT_PADDING_X;
            if sx < 0.0 {
                -sx
            } else {
                0.0
            }
        })
        .fold(0.0_f64, f64::max);
    let left_overflow = msg_overflow.max(frag_overflow).max(note_overflow);
    if left_overflow > 0.0 {
        // Shift all participant positions and message coordinates right
        for p in &mut participants {
            p.x += left_overflow;
        }
        for m in &mut messages {
            m.from_x += left_overflow;
            m.to_x += left_overflow;
            m.self_return_x += left_overflow;
            m.self_center_x += left_overflow;
        }
        for act in &mut activations {
            act.x += left_overflow;
        }
        for frag in &mut fragments {
            frag.x += left_overflow;
        }
        for n in &mut notes {
            n.x += left_overflow;
        }
        total_width += left_overflow;

        // Java dynamically recomputes note positions at post-shift coordinates.
        // The (int) truncation in NoteBox.getStartingX gives different results
        // at different center positions. Recompute self-msg note x values and
        // update fragment bounds to match Java's post-shift rendering.
        if !self_msg_note_fixups.is_empty() {
            for &(note_idx, pidx, note_lw, arrow_pw, is_reverse) in &self_msg_note_fixups {
                let shifted_px = participants[pidx].x;
                // Recompute Java NoteBox.getStartingX at post-shift position
                let new_starting_x = if notes[note_idx].is_left {
                    let base = (shifted_px - note_lw) as i64 as f64;
                    if is_reverse {
                        base - arrow_pw
                    } else {
                        base
                    }
                } else {
                    // RIGHT note: startingX = (int)(pos2) + delta
                    let base = shifted_px as i64 as f64;
                    if !is_reverse {
                        // Non-reverse: delta = arrowPW
                        base + arrow_pw
                    } else {
                        // Reverse: delta = 0
                        base
                    }
                };
                // note.x stores polygon position = startingX + paddingX
                let new_polygon_x = new_starting_x + NOTE_COMPONENT_PADDING_X;
                let old_polygon_x = notes[note_idx].x;
                if (new_polygon_x - old_polygon_x).abs() > 0.001 {
                    notes[note_idx].x = new_polygon_x;
                    // Update fragment bounds using startingX (not polygon_x)
                    for frag in &mut fragments {
                        if frag.y <= notes[note_idx].y && notes[note_idx].y <= frag.y + frag.height
                        {
                            // Java InGroupableList: min = member.getMinX - MARGIN5
                            // For LEFT notes: ArrowAndNoteBox.min = noteStartX, max = noteStartX + combinedPW
                            //   combinedPW = arrowPW + notePW
                            // For RIGHT notes: ArrowAndNoteBox extent doesn't add arrowPW to the RIGHT
                            //   since the arrow is to the LEFT of the note
                            let (note_frag_min, note_frag_max) = if notes[note_idx].is_left {
                                (
                                    new_starting_x - MARGIN,
                                    new_starting_x + note_lw + arrow_pw + MARGIN,
                                )
                            } else {
                                let right_shift = NOTE_COMPONENT_PADDING_X;
                                (
                                    new_starting_x - MARGIN,
                                    new_starting_x + note_lw + right_shift + MARGIN,
                                )
                            };
                            if note_frag_min < frag.x {
                                let expand = frag.x - note_frag_min;
                                frag.x = note_frag_min;
                                frag.width += expand;
                            }
                            let frag_right = frag.x + frag.width;
                            if note_frag_max > frag_right {
                                frag.width = note_frag_max - frag.x;
                            }
                        }
                    }
                }
            }
        }
    }

    // Java DrawableSetInitializer.getTotalHeight() = freeY + tailHeight.
    // For the stable Puma2 SVG baseline, the trailing tail/margin budget is 5px.
    let total_height = (lifeline_bottom - 1.0) + max_participant_height + 5.0;

    // Close any remaining fragments (unmatched)
    for fse in fragment_stack.drain(..) {
        let FragmentStackEntry {
            y_start,
            kind,
            label,
            separators,
            min_part_idx: min_idx,
            max_part_idx: max_idx,
            depth_at_push,
            msg_min_x,
            msg_max_x,
            color,
        } = fse;
        let (frag_x, frag_w) = if let (Some(lo), Some(hi)) = (min_idx, max_idx) {
            let p_lo = &participants[lo];
            let p_hi = &participants[hi];
            let left_pad = FRAGMENT_PADDING * (max_frag_depth[lo] - depth_at_push) as f64;
            let right_pad = FRAGMENT_PADDING * (max_frag_depth[hi] - depth_at_push) as f64;
            let mut fl = p_lo.x - p_lo.box_width / 2.0 - left_pad;
            let mut fr = p_hi.x + p_hi.box_width / 2.0 + right_pad;
            if let Some(mx) = msg_min_x {
                fl = fl.min(mx - MARGIN);
            }
            if let Some(mx) = msg_max_x {
                fr = fr.max(mx + MARGIN);
            }
            (fl, fr - fl)
        } else {
            (leftmost - FRAGMENT_PADDING, full_width)
        };
        let frag_height = y_cursor - y_start;
        fragments.push(FragmentLayout {
            kind,
            label,
            x: frag_x,
            y: y_start,
            width: frag_w,
            height: frag_height,
            separators,
            first_msg_index: None,
            color: color.clone(),
        });
        log::warn!("unclosed fragment, closing at y={y_cursor:.1}");
    }

    log::debug!(
        "layout_sequence done: {:.0}x{:.0}, {} messages, {} activations, {} fragments",
        total_width,
        total_height,
        messages.len(),
        activations.len(),
        fragments.len()
    );
    log::trace!("classic layout: total_width={total_width:.4} total_height={total_height:.4} left_overflow={left_overflow:.4}");

    let mut layout = SeqLayout {
        participants,
        messages,
        activations,
        destroys,
        notes,
        groups,
        fragments,
        dividers,
        delays,
        refs,
        autonumber_enabled,
        autonumber_start,
        lifeline_top,
        lifeline_bottom,
        total_width,
        total_height,
    };

    if skin.is_handwritten() {
        // Java ImageBuilder warning flow:
        //   dimWarning = textDim.delta(10, 5)
        //   final image dimension = dim.delta(15, dimWarning.height + 20)
        // For the single handwritten warning line, that means shifting the
        // whole diagram down by lineHeight(monospaced-10) + 25.
        let dy = crate::font_metrics::line_height("Monospaced", 10.0, false, false) + 25.0;
        layout.total_height += dy;
        // Banner rect: 60 chars * char_width + 10 (Java TextBlock width + 10).
        let char_w = crate::font_metrics::char_width(' ', "Monospaced", 10.0, false, false);
        let rect_w = 60.0 * char_w + 10.0;
        // Banner drawn at tx=3 with rx=5 (rounded corners), right edge = tx + rect_w + margin.
        let banner_min_w = 3.0 + rect_w + 2.0 * MARGIN + 2.0;
        if layout.total_width < banner_min_w {
            layout.total_width = banner_min_w;
        }
        layout.lifeline_top += dy;
        layout.lifeline_bottom += dy;
        for m in &mut layout.messages {
            m.y += dy;
        }
        for a in &mut layout.activations {
            a.y_start += dy;
            a.y_end += dy;
        }
        for d in &mut layout.destroys {
            d.y += dy;
        }
        for n in &mut layout.notes {
            n.y += dy;
        }
        for g in &mut layout.groups {
            g.y_start += dy;
            g.y_end += dy;
        }
        for f in &mut layout.fragments {
            f.y += dy;
            for (sep_y, _) in &mut f.separators {
                *sep_y += dy;
            }
        }
        for div in &mut layout.dividers {
            div.y += dy;
            div.component_y += dy;
        }
        for delay in &mut layout.delays {
            delay.y += dy;
            delay.lifeline_break_y += dy;
        }
        for r in &mut layout.refs {
            r.y += dy;
        }
    }

    Ok(layout)
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::sequence::{
        FragmentKind, Message, Participant, ParticipantKind, SeqArrowHead, SeqArrowStyle,
        SeqDirection, SeqEvent, SequenceDiagram,
    };

    fn make_participant(name: &str) -> Participant {
        Participant {
            name: name.to_string(),
            display_name: None,
            kind: ParticipantKind::Default,
            color: None,
            source_line: None,
            link_url: None,
        }
    }

    fn make_message(from: &str, to: &str, text: &str) -> Message {
        Message {
            from: from.to_string(),
            to: to.to_string(),
            text: text.to_string(),
            arrow_style: SeqArrowStyle::Solid,
            arrow_head: SeqArrowHead::Filled,
            direction: SeqDirection::LeftToRight,
            color: None,
            source_line: None,
            circle_from: false,
            circle_to: false,
            cross_from: false,
            cross_to: false,
            parallel: false,
            is_reverse_define: false,
            hidden: false,
            bidirectional: false,
            is_short_gate: false,
        }
    }

    #[test]
    fn single_participant_layout_dimensions() {
        let sd = SequenceDiagram {
            participants: vec![make_participant("Alice")],
            events: vec![],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert_eq!(layout.participants.len(), 1);
        let p = &layout.participants[0];
        assert_eq!(p.name, "Alice");
        let lp = LayoutParams::compute("SansSerif", MSG_FONT_SIZE, FONT_SIZE);
        assert_eq!(p.box_height, lp.participant_height);

        let expected_bw = rose::participant_preferred_width(
            &ParticipantKind::Default,
            crate::font_metrics::text_width("Alice", "SansSerif", FONT_SIZE, false, false),
            1.5,
        );
        assert!(
            (p.box_width - expected_bw).abs() < 0.01,
            "box_width {}, expected {}",
            p.box_width,
            expected_bw
        );

        // center x = MARGIN + box_width / 2
        let expected_x = MARGIN + expected_bw / 2.0;
        assert!(
            (p.x - expected_x).abs() < 0.01,
            "x {}, expected {}",
            p.x,
            expected_x
        );

        // total width = center + box_width/2 + MARGIN
        assert!(layout.total_width > 0.0);
        assert!(layout.total_height > 0.0);
    }

    #[test]
    fn two_participants_one_message() {
        let sd = SequenceDiagram {
            participants: vec![make_participant("Alice"), make_participant("Bob")],
            events: vec![SeqEvent::Message(make_message("Alice", "Bob", "hello"))],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert_eq!(layout.participants.len(), 2);
        assert_eq!(layout.messages.len(), 1);

        let alice_x = layout.participants[0].x;
        let bob_x = layout.participants[1].x;
        assert!(
            bob_x > alice_x,
            "Bob center {bob_x} should be right of Alice center {alice_x}"
        );

        let msg = &layout.messages[0];
        assert!(!msg.is_self);
        assert!((msg.from_x - alice_x).abs() < 0.01);
        assert!((msg.to_x - bob_x).abs() < 0.01);
        assert_eq!(msg.text, "hello");
        assert!(!msg.is_dashed);

        // Value invariant: first message y must be within the lifeline span
        // and positioned at a predictable offset from lifeline_top
        assert!(
            msg.y > layout.lifeline_top,
            "msg.y ({:.1}) should be below lifeline_top ({:.1})",
            msg.y,
            layout.lifeline_top
        );
        assert!(
            msg.y < layout.lifeline_bottom,
            "msg.y ({:.1}) should be above lifeline_bottom ({:.1})",
            msg.y,
            layout.lifeline_bottom
        );
        // First message offset from lifeline_top should be ~31-33px (initial_offset)
        let offset = msg.y - layout.lifeline_top;
        assert!(
            (30.0..=34.0).contains(&offset),
            "first msg offset from lifeline_top ({offset:.2}) should be ~31-33"
        );
    }

    #[test]
    fn self_message_layout() {
        let sd_self = SequenceDiagram {
            participants: vec![make_participant("A")],
            events: vec![SeqEvent::Message(make_message("A", "A", "self"))],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };

        let layout_self = layout_sequence(&sd_self, &crate::style::SkinParams::default()).unwrap();

        let msg = &layout_self.messages[0];
        assert!(msg.is_self);
        // Self-message to_x should be offset by SELF_MSG_WIDTH from from_x
        assert!(
            (msg.to_x - msg.from_x - SELF_MSG_WIDTH).abs() < 0.01,
            "self-msg width {} should be SELF_MSG_WIDTH={}",
            msg.to_x - msg.from_x,
            SELF_MSG_WIDTH
        );
        assert!(layout_self.lifeline_bottom > layout_self.lifeline_top);
    }

    #[test]
    fn activation_bar_tracking() {
        let sd = SequenceDiagram {
            participants: vec![make_participant("A"), make_participant("B")],
            events: vec![
                SeqEvent::Message(make_message("A", "B", "req")),
                SeqEvent::Activate("B".to_string(), None),
                SeqEvent::Message(make_message("B", "A", "resp")),
                SeqEvent::Deactivate("B".to_string()),
            ],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert_eq!(layout.activations.len(), 1);
        let act = &layout.activations[0];

        let bob_x = layout.participants[1].x;
        assert!(
            (act.x - (bob_x - ACTIVATION_WIDTH / 2.0)).abs() < 0.01,
            "activation x should be centered on participant"
        );

        // Invariant: activation starts at the triggering message y
        let msg_req = &layout.messages[0];
        assert!(
            (act.y_start - msg_req.y).abs() < 0.01,
            "activation y_start ({}) should equal triggering message y ({})",
            act.y_start,
            msg_req.y,
        );

        // Invariant: activation ends at the deactivating message y
        let msg_resp = &layout.messages[1];
        let lp = LayoutParams::compute("SansSerif", MSG_FONT_SIZE, FONT_SIZE);
        assert!(
            (act.y_end - msg_resp.y).abs() < 0.01,
            "activation y_end ({}) should equal deactivating message y ({})",
            act.y_end,
            msg_resp.y,
        );

        // Invariant: activation height = exactly one message_spacing
        let expected_height = lp.message_spacing;
        let actual_height = act.y_end - act.y_start;
        assert!(
            (actual_height - expected_height).abs() < 0.01,
            "activation height ({actual_height:.2}) should equal message_spacing ({expected_height:.2})"
        );

        // Java: at return message y, activation bar has ended (getLevel(y)=0).
        // The sender is considered NOT active, so from_x = lifeline center (bob_x).
        assert!(
            (msg_resp.from_x - bob_x).abs() < 0.01,
            "resp.from_x ({:.2}) should be at lifeline center ({:.2})",
            msg_resp.from_x,
            bob_x,
        );

        // req message: B will be activated right after (look-ahead),
        // so to_x should be at activation left edge (bob_x - ACTIVATION_WIDTH/2)
        assert!(
            (msg_req.to_x - (bob_x - ACTIVATION_WIDTH / 2.0)).abs() < 0.01,
            "req.to_x ({:.2}) should be at activation left edge ({:.2}) via look-ahead",
            msg_req.to_x,
            bob_x - ACTIVATION_WIDTH / 2.0
        );
    }

    #[test]
    fn empty_diagram_produces_valid_layout() {
        let sd = SequenceDiagram {
            participants: vec![],
            events: vec![],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert!(layout.participants.is_empty());
        assert!(layout.messages.is_empty());
        assert!(layout.activations.is_empty());
        assert!(layout.total_width > 0.0);
        assert!(layout.total_height > 0.0);
        assert!(layout.lifeline_bottom > layout.lifeline_top);
    }

    #[test]
    fn note_right_advances_cursor() {
        let sd = SequenceDiagram {
            participants: vec![make_participant("A")],
            events: vec![
                SeqEvent::NoteRight {
                    participant: "A".to_string(),
                    text: "a note".to_string(),
                    parallel: false,
                    color: None,
                },
                SeqEvent::Message(make_message("A", "A", "after note")),
            ],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert_eq!(layout.notes.len(), 1);
        let note = &layout.notes[0];
        assert!(!note.is_left);
        // Message should be positioned below the note
        assert!(layout.messages[0].y > note.y);
        // Note bottom should not exceed message y (note fits before message)
        let note_bottom = note.y + note.height;
        assert!(
            note_bottom <= layout.messages[0].y + 0.01,
            "note bottom ({note_bottom:.1}) should not exceed message y ({:.1})",
            layout.messages[0].y
        );
        // Cross-element: note.x must be to the right of participant center
        let part_x = layout.participants[0].x;
        assert!(
            note.x > part_x,
            "right note x ({:.1}) should be right of participant center ({:.1})",
            note.x,
            part_x
        );
    }

    #[test]
    fn group_creates_frame() {
        let sd = SequenceDiagram {
            participants: vec![make_participant("A"), make_participant("B")],
            events: vec![
                SeqEvent::GroupStart {
                    label: Some("loop".to_string()),
                },
                SeqEvent::Message(make_message("A", "B", "ping")),
                SeqEvent::GroupEnd,
            ],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert_eq!(layout.groups.len(), 1);
        let grp = &layout.groups[0];
        assert_eq!(grp.label.as_deref(), Some("loop"));
        assert!(grp.y_end > grp.y_start);
        assert!(grp.width > 0.0);
        // Invariant: group frame must enclose the message
        let msg = &layout.messages[0];
        assert!(
            grp.y_start < msg.y,
            "group y_start ({:.1}) should be above message y ({:.1})",
            grp.y_start,
            msg.y
        );
        assert!(
            grp.y_end > msg.y,
            "group y_end ({:.1}) should be below message y ({:.1})",
            grp.y_end,
            msg.y
        );
        // Cross-element: group x-span must cover both participants
        let alice_x = layout.participants[0].x;
        let bob_x = layout.participants[1].x;
        let alice_left = alice_x - layout.participants[0].box_width / 2.0;
        let bob_right = bob_x + layout.participants[1].box_width / 2.0;
        assert!(
            grp.x <= alice_left + 0.01,
            "group x ({:.1}) should be at or left of Alice left edge ({:.1})",
            grp.x,
            alice_left
        );
        assert!(
            grp.x + grp.width >= bob_right - 0.01,
            "group right ({:.1}) should be at or right of Bob right edge ({:.1})",
            grp.x + grp.width,
            bob_right
        );
    }

    #[test]
    fn dashed_arrow_and_open_head() {
        let sd = SequenceDiagram {
            participants: vec![make_participant("A"), make_participant("B")],
            events: vec![SeqEvent::Message(Message {
                from: "A".to_string(),
                to: "B".to_string(),
                text: "reply".to_string(),
                arrow_style: SeqArrowStyle::Dashed,
                arrow_head: SeqArrowHead::Open,
                direction: SeqDirection::LeftToRight,
                color: None,
                source_line: None,
                circle_from: false,
                circle_to: false,
                cross_from: false,
                cross_to: false,
                parallel: false,
                is_reverse_define: false,
                hidden: false,
                bidirectional: false,
                is_short_gate: false,
            })],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        let msg = &layout.messages[0];
        assert!(msg.is_dashed);
        assert!(msg.has_open_head);
    }

    #[test]
    fn destroy_advances_cursor() {
        let sd = SequenceDiagram {
            participants: vec![make_participant("A"), make_participant("B")],
            events: vec![
                SeqEvent::Message(make_message("A", "B", "kill")),
                SeqEvent::Destroy("B".to_string()),
            ],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert_eq!(layout.destroys.len(), 1);
        let d = &layout.destroys[0];
        let bob_x = layout.participants[1].x;
        assert!((d.x - bob_x).abs() < 0.01);
        // Invariant: destroy y = message y + message_spacing
        let lp = LayoutParams::compute("SansSerif", MSG_FONT_SIZE, FONT_SIZE);
        let expected_y = layout.messages[0].y + lp.message_spacing;
        assert!(
            (d.y - expected_y).abs() < 0.01,
            "destroy y ({:.2}) should equal msg.y + spacing ({:.2})",
            d.y,
            expected_y
        );
    }

    #[test]
    fn fragment_creates_layout() {
        let sd = SequenceDiagram {
            participants: vec![make_participant("A"), make_participant("B")],
            events: vec![
                SeqEvent::FragmentStart {
                    kind: FragmentKind::Alt,
                    label: "success".to_string(),
                    parallel: false,
                    color: None,
                },
                SeqEvent::Message(make_message("A", "B", "ok")),
                SeqEvent::FragmentSeparator {
                    label: "failure".to_string(),
                },
                SeqEvent::Message(make_message("A", "B", "err")),
                SeqEvent::FragmentEnd,
            ],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert_eq!(layout.fragments.len(), 1);
        let frag = &layout.fragments[0];
        assert_eq!(frag.kind, FragmentKind::Alt);
        assert_eq!(frag.label, "success");
        assert!(frag.height > 0.0);
        assert!(frag.width > 0.0);
        assert_eq!(frag.separators.len(), 1);
        assert_eq!(frag.separators[0].1, "failure");
        // Invariant: fragment encloses both messages
        let msg_ok = &layout.messages[0];
        let msg_err = &layout.messages[1];
        assert!(
            frag.y < msg_ok.y,
            "fragment y ({:.1}) should be above first message ({:.1})",
            frag.y,
            msg_ok.y
        );
        assert!(
            frag.y + frag.height > msg_err.y,
            "fragment bottom ({:.1}) should be below second message ({:.1})",
            frag.y + frag.height,
            msg_err.y
        );
        // Invariant: separator y is between the two messages
        let sep_y = frag.separators[0].0;
        assert!(
            sep_y > msg_ok.y && sep_y < msg_err.y,
            "separator y ({sep_y:.1}) should be between messages ({:.1}, {:.1})",
            msg_ok.y,
            msg_err.y
        );
        // Cross-element: fragment x-span must cover both participants
        let alice_x = layout.participants[0].x;
        let bob_x = layout.participants[1].x;
        let alice_left = alice_x - layout.participants[0].box_width / 2.0;
        let bob_right = bob_x + layout.participants[1].box_width / 2.0;
        assert!(
            frag.x <= alice_left + 0.01,
            "fragment x ({:.1}) should cover Alice left ({:.1})",
            frag.x,
            alice_left
        );
        assert!(
            frag.x + frag.width >= bob_right - 0.01,
            "fragment right ({:.1}) should cover Bob right ({:.1})",
            frag.x + frag.width,
            bob_right
        );
    }

    #[test]
    fn divider_creates_layout() {
        let sd = SequenceDiagram {
            participants: vec![make_participant("A")],
            events: vec![SeqEvent::Divider {
                text: Some("Phase 1".to_string()),
            }],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert_eq!(layout.dividers.len(), 1);
        assert_eq!(layout.dividers[0].text.as_deref(), Some("Phase 1"));
    }

    #[test]
    fn delay_creates_layout() {
        let sd = SequenceDiagram {
            participants: vec![make_participant("A")],
            events: vec![SeqEvent::Delay {
                text: Some("waiting".to_string()),
            }],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert_eq!(layout.delays.len(), 1);
        assert_eq!(layout.delays[0].text.as_deref(), Some("waiting"));
    }

    #[test]
    fn ref_creates_layout() {
        let sd = SequenceDiagram {
            participants: vec![make_participant("A"), make_participant("B")],
            events: vec![SeqEvent::Ref {
                participants: vec!["A".to_string(), "B".to_string()],
                label: "init phase".to_string(),
            }],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert_eq!(layout.refs.len(), 1);
        let r = &layout.refs[0];
        assert_eq!(r.label, "init phase");
        assert!(r.width > 0.0);
        assert!(r.height > 0.0);
        // Cross-element: ref must be within lifeline span
        assert!(
            r.y >= layout.lifeline_top,
            "ref y ({:.1}) should be at or below lifeline_top ({:.1})",
            r.y,
            layout.lifeline_top
        );
        // Cross-element: ref x-span covers both participants
        let alice_x = layout.participants[0].x;
        let bob_x = layout.participants[1].x;
        assert!(
            r.x < alice_x,
            "ref x ({:.1}) should be left of Alice ({:.1})",
            r.x,
            alice_x
        );
        assert!(
            r.x + r.width > bob_x,
            "ref right ({:.1}) should be right of Bob ({:.1})",
            r.x + r.width,
            bob_x
        );
    }

    #[test]
    fn spacing_advances_cursor() {
        let sd = SequenceDiagram {
            participants: vec![make_participant("A"), make_participant("B")],
            events: vec![
                SeqEvent::Message(make_message("A", "B", "before")),
                SeqEvent::Spacing { pixels: 50 },
                SeqEvent::Message(make_message("A", "B", "after")),
            ],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert_eq!(layout.messages.len(), 2);
        let lp = LayoutParams::compute("SansSerif", MSG_FONT_SIZE, FONT_SIZE);
        let gap = layout.messages[1].y - layout.messages[0].y;
        // Invariant: gap = message_spacing + spacing_pixels exactly
        let expected_gap = lp.message_spacing + 50.0;
        assert!(
            (gap - expected_gap).abs() < 0.01,
            "gap ({gap:.2}) should equal message_spacing + 50 ({expected_gap:.2})"
        );
    }

    #[test]
    fn note_right_expands_total_width() {
        // A single participant with a right note: the note should expand total_width
        let sd = SequenceDiagram {
            participants: vec![make_participant("A")],
            events: vec![SeqEvent::NoteRight {
                participant: "A".to_string(),
                text: "a note".to_string(),
                parallel: false,
                color: None,
            }],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        let note = &layout.notes[0];
        // Java truncates note.x via (int) before computing viewport contribution
        let note_right_truncated = (note.x as i64 as f64) + note.width + MARGIN;
        // total_width must be at least as large as the truncated note_right
        assert!(
            layout.total_width >= note_right_truncated - 0.01,
            "total_width {:.1} should be >= note_right {:.1}",
            layout.total_width,
            note_right_truncated
        );

        // Also verify it's wider than participant-only width
        let participant_only_width =
            layout.participants[0].x + layout.participants[0].box_width / 2.0 + 2.0 * MARGIN;
        assert!(
            layout.total_width > participant_only_width,
            "total_width {:.1} should exceed participant-only {:.1} due to note",
            layout.total_width,
            participant_only_width
        );
    }

    #[test]
    fn note_width_matches_text() {
        // Verify note width is computed based on text, not a fixed constant
        let short_text = "Hi";
        let long_text = "the location of the Comment is correct";
        let w_short = estimate_note_width(short_text);
        let w_long = estimate_note_width(long_text);
        assert!(
            w_long > w_short,
            "long note ({w_long:.1}) should be wider than short note ({w_short:.1})"
        );
        // minimum note width should be at least 30
        assert!(
            w_short >= 30.0,
            "short note width {w_short:.1} should be >= 30"
        );
    }

    // ── Combination / integration invariants ─────────────────────

    #[test]
    fn activation_with_note_height_matches_message_span() {
        // Reproduces SequenceLayout_0006: msg + note + activate + msg + deactivate
        let sd = SequenceDiagram {
            participants: vec![make_participant("A"), make_participant("B")],
            events: vec![
                SeqEvent::Message(make_message("A", "B", "a")),
                SeqEvent::NoteRight {
                    participant: "B".to_string(),
                    text: "Note".to_string(),
                    parallel: false,
                    color: None,
                },
                SeqEvent::Activate("B".to_string(), None),
                SeqEvent::Message(Message {
                    from: "B".to_string(),
                    to: "A".to_string(),
                    text: "b".to_string(),
                    arrow_style: SeqArrowStyle::Dashed,
                    arrow_head: SeqArrowHead::Filled,
                    direction: SeqDirection::RightToLeft,
                    color: None,
                    source_line: None,
                    circle_from: false,
                    circle_to: false,
                    cross_from: false,
                    cross_to: false,
                    parallel: false,
                    is_reverse_define: true,
                    hidden: false,
                    bidirectional: false,
                    is_short_gate: false,
                }),
                SeqEvent::Deactivate("B".to_string()),
            ],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert_eq!(layout.activations.len(), 1);
        let act = &layout.activations[0];
        let msg_a = &layout.messages[0];
        let msg_b = &layout.messages[1];

        // Invariant: activation starts at triggering message
        assert!(
            (act.y_start - msg_a.y).abs() < 0.01,
            "act.y_start ({:.2}) should equal msg_a.y ({:.2})",
            act.y_start,
            msg_a.y
        );

        // Invariant: activation ends at deactivating message, NOT at y_cursor
        assert!(
            (act.y_end - msg_b.y).abs() < 0.01,
            "act.y_end ({:.2}) should equal msg_b.y ({:.2}), not y_cursor",
            act.y_end,
            msg_b.y
        );

        // Invariant: height = message span only
        let lp = LayoutParams::compute("SansSerif", MSG_FONT_SIZE, FONT_SIZE);
        let height = act.y_end - act.y_start;
        assert!(
            height < 2.0 * lp.message_spacing,
            "activation height ({height:.2}) should be less than 2 * msg_spacing ({:.2})",
            2.0 * lp.message_spacing
        );

        // Cross-element: msg_a to_x adjusted for upcoming activation (look-ahead)
        let bob_x = layout.participants[1].x;
        assert!(
            (msg_a.to_x - (bob_x - ACTIVATION_WIDTH / 2.0)).abs() < 0.01,
            "msg_a.to_x ({:.2}) should be at activation left edge ({:.2})",
            msg_a.to_x,
            bob_x - ACTIVATION_WIDTH / 2.0
        );

        // Java: at return message y, activation ends → sender at lifeline center
        assert!(
            (msg_b.from_x - bob_x).abs() < 0.01,
            "msg_b.from_x ({:.2}) should be at lifeline center ({:.2})",
            msg_b.from_x,
            bob_x,
        );

        // Cross-element: note is to the right of participant B
        assert_eq!(layout.notes.len(), 1);
        assert!(
            layout.notes[0].x > bob_x,
            "note x ({:.1}) should be right of B center ({:.1})",
            layout.notes[0].x,
            bob_x
        );
    }

    #[test]
    fn consecutive_messages_have_exact_spacing() {
        // Verify message y-gap is exactly message_spacing
        let sd = SequenceDiagram {
            participants: vec![make_participant("A"), make_participant("B")],
            events: vec![
                SeqEvent::Message(make_message("A", "B", "m1")),
                SeqEvent::Message(make_message("B", "A", "m2")),
                SeqEvent::Message(make_message("A", "B", "m3")),
            ],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        let lp = LayoutParams::compute("SansSerif", MSG_FONT_SIZE, FONT_SIZE);
        for i in 0..layout.messages.len() - 1 {
            let gap = layout.messages[i + 1].y - layout.messages[i].y;
            assert!(
                (gap - lp.message_spacing).abs() < 0.01,
                "gap between msg[{i}] and msg[{}] = {gap:.2}, expected {:.2}",
                i + 1,
                lp.message_spacing
            );
        }
    }

    #[test]
    fn multiple_activations_each_match_message_span() {
        // Two independent activate/deactivate cycles
        let sd = SequenceDiagram {
            participants: vec![make_participant("A"), make_participant("B")],
            events: vec![
                SeqEvent::Message(make_message("A", "B", "req1")),
                SeqEvent::Activate("B".to_string(), None),
                SeqEvent::Message(make_message("B", "A", "resp1")),
                SeqEvent::Deactivate("B".to_string()),
                SeqEvent::Message(make_message("A", "B", "req2")),
                SeqEvent::Activate("B".to_string(), None),
                SeqEvent::Message(make_message("B", "A", "resp2")),
                SeqEvent::Deactivate("B".to_string()),
            ],
            teoz_mode: false,
            hide_footbox: false,
            delta_shadow: 0.0,
            inline_life_events: vec![],
            source_seed: 0,
        };
        let layout = layout_sequence(&sd, &crate::style::SkinParams::default()).unwrap();

        assert_eq!(layout.activations.len(), 2);
        let lp = LayoutParams::compute("SansSerif", MSG_FONT_SIZE, FONT_SIZE);
        // Each activation should span exactly one message_spacing
        for (i, act) in layout.activations.iter().enumerate() {
            let height = act.y_end - act.y_start;
            assert!(
                (height - lp.message_spacing).abs() < 0.01,
                "activation[{i}] height ({height:.2}) should equal message_spacing ({:.2})",
                lp.message_spacing
            );
        }
    }
}
