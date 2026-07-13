// layout::sequence_teoz::builder - TileBuilder + PlayingSpace orchestration
//
// Port of Java PlantUML's TileBuilder, PlayingSpace, and
// SequenceDiagramFileMakerTeoz into a single build_teoz_layout() function.
//
// Pipeline:
//   1. Create RealLine (constraint arena)
//   2. Create LivingSpaces for each participant (with Real positions)
//   3. Build Tiles from events (TileBuilder logic)
//   4. Add constraints from tiles
//   5. Compile constraints (solve)
//   6. Assign Y positions (fillPositionelTiles)
//   7. Extract SeqLayout from positioned tiles

use std::collections::HashMap;

use crate::font_metrics;
use crate::model::sequence::{
    FragmentKind, ParticipantKind, SeqArrowHead, SeqArrowStyle, SeqDirection, SeqEvent,
    SequenceDiagram,
};
use crate::skin::rose::{self, TextMetrics};
use crate::style::SkinParams;
use crate::Result;

use crate::layout::sequence::{
    ActivationLayout, DelayLayout, DestroyLayout, DividerLayout, FragmentLayout, GroupLayout,
    MessageLayout, NoteLayout, ParticipantLayout, RefLayout, SeqLayout,
};

use super::living::LivingSpace;
use super::real::{RealId, RealLine};

// ── Constants ────────────────────────────────────────────────────────────────

const FONT_SIZE: f64 = 14.0;
const MSG_FONT_SIZE: f64 = 13.0;
const NOTE_FONT_SIZE: f64 = 13.0;
const ACTIVATION_WIDTH: f64 = 10.0;
const SELF_MSG_WIDTH: f64 = 42.0;
const NOTE_PADDING: f64 = rose::NOTE_PADDING;
const NOTE_FOLD: f64 = rose::SEQ_NOTE_FOLD;
/// Java Rose.paddingX = 5; ComponentRoseNote.getPreferredWidth includes 2*paddingX = 10
/// beyond the drawn polygon width (getTextWidth). The extent calculations must use
/// the full preferred width, not just the drawn width.
const NOTE_EXTENT_PADDING: f64 = 10.0;
/// Java teoz body coordinates are shifted only by the document's top margin.
/// The `PlayingSpace.startingY = 8` offset is internal to tile packing; the
/// emitted SVG head/lifeline positions line up with a 5px top document margin.
const STARTING_Y: f64 = 5.0;
/// Minimum gap between adjacent participant right-edge and next left-edge.
#[allow(dead_code)] // Java-ported teoz constant
const PARTICIPANT_GAP: f64 = 5.0;
/// Java teoz applies `dx(-min1)` inside `SequenceDiagramFileMakerTeoz`, then
/// the SVG exporter adds the normal 5px document margin. The body coordinates
/// therefore start 5px from the left edge, not 10px.
const DOC_MARGIN_X: f64 = 5.0;
/// Java: GroupingTile.MARGINX = 16 (internal padding between frame and content)
const GROUP_MARGINX: f64 = 16.0;
/// Java: GroupingTile.EXTERNAL_MARGINX1 = 3 (left frame margin)
const GROUP_EXTERNAL_MARGINX1: f64 = 3.0;
/// Java: GroupingTile.EXTERNAL_MARGINX2 = 9 (right frame margin)
const GROUP_EXTERNAL_MARGINX2: f64 = 9.0;

/// Compute the header preferred width for a fragment/group.
/// Java GroupingTile: for "group" kind, display = comment only;
/// for other kinds (alt, loop, …), display = kind + comment.
fn fragment_header_width(kind: &FragmentKind, label: &str, font: &str, font_size: f64) -> f64 {
    if *kind == FragmentKind::Group {
        // Java: display = Display.create(start.getComment())
        // Header shows only the label text (or "group" if no label).
        let display_text = if label.is_empty() { "group" } else { label };
        let text_w = crate::font_metrics::text_width(display_text, font, font_size, true, false);
        // marginX1(15) + marginX2(30) = 45
        text_w + 45.0
    } else {
        let kind_text_w =
            crate::font_metrics::text_width(kind.label(), font, font_size, true, false);
        if label.is_empty() {
            kind_text_w + 45.0
        } else {
            let bracket_label = format!("[{}]", label);
            let comment_w =
                crate::font_metrics::text_width(&bracket_label, font, 11.0, true, false);
            kind_text_w + 45.0 + 15.0 + comment_w
        }
    }
}
/// Java: PlayingSpace.startingY = 8. Tiles start at this offset within the PlayingSpace.
const PLAYINGSPACE_STARTING_Y: f64 = 8.0;

// ── Tile types (inline, simplified) ──────────────────────────────────────────

/// Simplified tile kind for the builder pipeline.
/// Each variant carries the data needed for constraint generation and
/// layout extraction. This will later be replaced by the full tile module.
#[derive(Debug)]
#[allow(dead_code)]
enum TeozTile {
    /// Normal message between two different participants
    Communication {
        from_name: String,
        to_name: String,
        from_idx: usize,
        to_idx: usize,
        text: String,
        text_lines: Vec<String>,
        is_dashed: bool,
        has_open_head: bool,
        arrow_head: SeqArrowHead,
        /// Minimum pixel width needed by the message text
        text_width: f64,
        /// Preferred height of this tile
        height: f64,
        /// Y position (assigned in step 6)
        y: Option<f64>,
        /// Autonumber label if any
        autonumber: Option<String>,
        /// RealId of the source participant center
        from_center: RealId,
        /// RealId of the target participant center
        to_center: RealId,
        /// Circle decoration on from end
        circle_from: bool,
        /// Circle decoration on to end
        circle_to: bool,
        /// Cross (X) decoration on from end
        cross_from: bool,
        /// Cross (X) decoration on to end
        cross_to: bool,
        /// Teoz parallel: shares y with previous tile
        is_parallel: bool,
        /// Activation level of the sender at this message
        from_level: usize,
        /// Activation level of the receiver at this message
        /// (IGNORE_FUTURE_DEACTIVATE: includes activations from this message)
        to_level: usize,
        /// Hidden arrow: occupies space but is not drawn
        hidden: bool,
        /// Bidirectional arrow: arrowheads at both ends
        bidirectional: bool,
        /// Short gate arrow (?->) vs full boundary ([->)
        is_short_gate: bool,
        /// For short gates from left (from=[): true if Java FROM_RIGHT
        /// (reversed direction, no positioning constraint).
        gate_right_border: bool,
        /// Per-message arrow color override
        color: Option<String>,
    },
    /// Self-message (from == to)
    SelfMessage {
        participant_idx: usize,
        text: String,
        text_lines: Vec<String>,
        is_dashed: bool,
        has_open_head: bool,
        arrow_head: SeqArrowHead,
        text_width: f64,
        height: f64,
        y: Option<f64>,
        autonumber: Option<String>,
        center: RealId,
        direction: SeqDirection,
        is_reverse_define: bool,
        /// Activation level at the time of this self-message (levelIgnore)
        active_level: usize,
        /// Java: area.deltaX1 = (levelIgnore - levelConsidere) * LIVE_DELTA_SIZE.
        /// Affects drawLeftSide/drawRightSide x1/x2 line endpoint adjustments.
        delta_x1: f64,
        /// Circle decoration on from end
        circle_from: bool,
        /// Circle decoration on to end
        circle_to: bool,
        /// Cross (X) decoration on from end
        cross_from: bool,
        /// Cross (X) decoration on to end
        cross_to: bool,
        /// Teoz parallel: shares y with previous tile
        is_parallel: bool,
        /// Hidden arrow: occupies space but is not drawn
        hidden: bool,
        /// Bidirectional arrow: arrowheads at both ends
        bidirectional: bool,
        /// Per-message arrow color override
        color: Option<String>,
    },
    /// Activate / Deactivate / Destroy life event
    LifeEvent {
        height: f64,
        y: Option<f64>,
        /// Participant index for this life event
        participant_idx: usize,
        /// RealId of the participant center (pos_c)
        center: RealId,
        /// Activation level of this participant AFTER the event
        level: usize,
    },
    /// Note on a participant
    Note {
        participant_idx: usize,
        text: String,
        is_left: bool,
        width: f64,
        height: f64,
        y: Option<f64>,
        center: RealId,
        /// True if this note follows a self-message (shares Y, no height contribution).
        is_note_on_message: bool,
        /// Activation level of the participant at this note (for x offset).
        active_level: usize,
        /// True when the note uses `& note` parallel syntax (TileParallel in Java)
        is_parallel: bool,
        /// Optional background color override
        color: Option<String>,
    },
    /// Note spanning two participants
    NoteOver {
        participants: Vec<String>,
        text: String,
        width: f64,
        height: f64,
        y: Option<f64>,
    },
    /// Divider line
    Divider {
        text: Option<String>,
        height: f64,
        y: Option<f64>,
    },
    /// Delay section
    Delay {
        text: Option<String>,
        height: f64,
        y: Option<f64>,
    },
    /// Reference over participants
    Ref {
        participants: Vec<String>,
        label: String,
        height: f64,
        y: Option<f64>,
    },
    /// Fragment (alt/loop/opt/etc.) start
    FragmentStart {
        kind: FragmentKind,
        label: String,
        height: f64,
        y: Option<f64>,
        /// Teoz parallel: shares y with previous tile block
        is_parallel: bool,
        /// Background color from `#color` prefix
        color: Option<String>,
    },
    /// Fragment separator (else)
    FragmentSeparator {
        label: String,
        height: f64,
        y: Option<f64>,
    },
    /// Fragment end
    FragmentEnd { height: f64, y: Option<f64> },
    /// Spacing
    Spacing { pixels: f64, y: Option<f64> },
    /// Group start (legacy)
    GroupStart {
        _label: Option<String>,
        height: f64,
        y: Option<f64>,
    },
    /// Group end (legacy)
    GroupEnd { height: f64, y: Option<f64> },
}

impl TeozTile {
    fn preferred_height(&self) -> f64 {
        match self {
            Self::Communication { height, .. } => *height,
            Self::SelfMessage { height, .. } => *height,
            Self::LifeEvent { height, .. } => *height,
            Self::Note { height, .. } => *height,
            Self::NoteOver { height, .. } => *height,
            Self::Divider { height, .. } => *height,
            Self::Delay { height, .. } => *height,
            Self::Ref { height, .. } => *height,
            Self::FragmentStart { height, .. } => *height,
            Self::FragmentSeparator { height, .. } => *height,
            Self::FragmentEnd { height, .. } => *height,
            Self::Spacing { pixels, .. } => *pixels,
            Self::GroupStart { height, .. } => *height,
            Self::GroupEnd { height, .. } => *height,
        }
    }

    fn set_y(&mut self, val: f64) {
        match self {
            Self::Communication { y, .. } => *y = Some(val),
            Self::SelfMessage { y, .. } => *y = Some(val),
            Self::LifeEvent { y, .. } => *y = Some(val),
            Self::Note { y, .. } => *y = Some(val),
            Self::NoteOver { y, .. } => *y = Some(val),
            Self::Divider { y, .. } => *y = Some(val),
            Self::Delay { y, .. } => *y = Some(val),
            Self::Ref { y, .. } => *y = Some(val),
            Self::FragmentStart { y, .. } => *y = Some(val),
            Self::FragmentSeparator { y, .. } => *y = Some(val),
            Self::FragmentEnd { y, .. } => *y = Some(val),
            Self::Spacing { y, .. } => *y = Some(val),
            Self::GroupStart { y, .. } => *y = Some(val),
            Self::GroupEnd { y, .. } => *y = Some(val),
        }
    }

    fn get_y(&self) -> Option<f64> {
        match self {
            Self::Communication { y, .. } => *y,
            Self::SelfMessage { y, .. } => *y,
            Self::LifeEvent { y, .. } => *y,
            Self::Note { y, .. } => *y,
            Self::NoteOver { y, .. } => *y,
            Self::Divider { y, .. } => *y,
            Self::Delay { y, .. } => *y,
            Self::Ref { y, .. } => *y,
            Self::FragmentStart { y, .. } => *y,
            Self::FragmentSeparator { y, .. } => *y,
            Self::FragmentEnd { y, .. } => *y,
            Self::Spacing { y, .. } => *y,
            Self::GroupStart { y, .. } => *y,
            Self::GroupEnd { y, .. } => *y,
        }
    }

    /// Java TileParallel contact-point alignment.
    /// Returns the distance from the tile top to the arrow "contact" point.
    /// For Communication tiles: `text_height + ARROW_PADDING_Y` = `height - 8`.
    /// For SelfMessage tiles: `text_height + 11.5` = `height - 13.5`.
    /// For non-message tiles: 0 (top-aligned).
    fn contact_point_relative(&self) -> f64 {
        match self {
            Self::Communication { height, .. } => {
                // height = tm.text_height() + ARROW_DELTA_Y + 2*ARROW_PADDING_Y
                // contact = tm.text_height() + ARROW_PADDING_Y
                height - (rose::ARROW_DELTA_Y + rose::ARROW_PADDING_Y)
            }
            Self::SelfMessage { height, .. } => {
                // height = tm.text_height() + ARROW_DELTA_Y + SELF_ARROW_ONLY_HEIGHT + 2*ARROW_PADDING_Y
                // Java: contact = getYPoint = (text_h + text_h + arrowOnly) / 2 + getPaddingX()
                // getPaddingX() = 0 for ComponentRoseSelfArrow (not ARROW_PADDING_X)
                let tm_text_h = height
                    - rose::ARROW_DELTA_Y
                    - rose::SELF_ARROW_ONLY_HEIGHT
                    - 2.0 * rose::ARROW_PADDING_Y;
                tm_text_h + rose::SELF_ARROW_ONLY_HEIGHT / 2.0
            }
            _ => 0.0,
        }
    }

    /// Distance from contact point to tile bottom (Java `getZZZ()`).
    fn zzz(&self) -> f64 {
        self.preferred_height() - self.contact_point_relative()
    }
}

/// Apply Java TileParallel contact-point alignment to a block of parallel tiles.
///
/// Each tile in a parallel block is shifted down by `(maxContact - itsContact)`
/// so that all arrows align at the same Y coordinate. This matches Java's
/// `TileParallel.drawU()` which translates each sub-tile by that delta.
fn apply_contact_point_alignment(tiles: &mut [TeozTile], indices: &[usize]) {
    if indices.len() <= 1 {
        return; // no alignment needed for single tiles
    }
    let max_contact = indices
        .iter()
        .map(|&i| tiles[i].contact_point_relative())
        .fold(0.0_f64, f64::max);
    for &i in indices {
        let contact = tiles[i].contact_point_relative();
        let shift = max_contact - contact;
        if shift > 0.0 {
            if let Some(old_y) = tiles[i].get_y() {
                tiles[i].set_y(old_y + shift);
            }
        }
    }
}

// ── Layout parameters ────────────────────────────────────────────────────────

#[allow(dead_code)]
struct TeozParams {
    message_spacing: f64,
    self_msg_height: f64,
    participant_height: f64,
    msg_line_height: f64,
    frag_header_height: f64,
    /// Java teoz ElseTile: ComponentRoseGroupingElse.getPreferredHeight() = textHeight + 16
    /// textHeight = textBlock.height + 2*marginY(1) = h11 + 2  (11pt style font)
    /// So frag_separator_height_teoz = h11 + 18
    frag_separator_height_teoz: f64,
    divider_height: f64,
    delay_height: f64,
    ref_height: f64,
}

impl TeozParams {
    fn compute(font_family: &str, msg_font_size: f64, part_font_size: f64) -> Self {
        let h13 = font_metrics::line_height(font_family, msg_font_size, false, false);
        let h14 = font_metrics::line_height(font_family, part_font_size, false, false);

        let arrow_tm = TextMetrics::new(7.0, 7.0, 1.0, 0.0, h13);
        let message_spacing = rose::arrow_preferred_size(&arrow_tm, 0.0, 0.0).height;

        let self_msg_height = rose::SELF_ARROW_ONLY_HEIGHT;

        // Java: ComponentRoseParticipant(style, stereo, NONE, 7, 7, 7, skinParam, display, false)
        // marginX1=7, marginX2=7, marginY=7
        // preferred_height = getTextHeight() + 1 = (lineHeight + 2*7) + 1 = 31.2969
        // But the DRAWN rect height = getTextHeight() = 30.2969 (no +1).
        // We use text_height (30.2969) as box_height for rendering consistency with puma.
        let part_tm = TextMetrics::new(7.0, 7.0, 7.0, 0.0, h14);
        let participant_preferred_h =
            rose::participant_preferred_size(&part_tm, 0.0, false, 0.0, 0.0).height;
        let participant_height = participant_preferred_h - 1.0; // text_height only (drawn rect)

        let frag_header_height = h13 + 2.0;
        // Java teoz: ElseTile preferred height = getTextHeight + 16
        // Java ElseTile uses ComponentRoseGroupingElse with style font (11pt), not 13pt.
        // getTextHeight = textBlock.height + 2*marginY(1) = h11 + 2
        let h11 = font_metrics::line_height(font_family, 11.0, false, false);
        let frag_separator_height_teoz = h11 + 18.0;

        // Java ComponentRoseDivider: marginX1=4, marginX2=4, marginY=4
        let divider_tm = TextMetrics::new(4.0, 4.0, 4.0, 0.0, 0.0);
        let divider_height = rose::divider_preferred_size(&divider_tm).height;

        let delay_tm = TextMetrics::new(0.0, 0.0, 5.0, 0.0, 0.0);
        let delay_height = rose::delay_text_preferred_size(&delay_tm).height;

        let ref_height = h13 + h14 + rose::REF_HEIGHT_FOOTER + 2.0 + 0.671875;

        Self {
            message_spacing,
            self_msg_height,
            participant_height,
            msg_line_height: h13,
            frag_header_height,
            frag_separator_height_teoz,
            divider_height,
            delay_height,
            ref_height,
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

#[allow(dead_code)] // Java-ported teoz helper
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

/// Unescape PlantUML text escape sequences after \\n splitting.
/// Java: Display.create() processes \\-prefixed escapes in legacy mode:
///   `\\\\` -> `\`, `\\t` -> tab. Other `\\X` pass through.
fn unescape_backslash(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\' && i + 1 < chars.len() {
            match chars[i + 1] {
                '\\' => {
                    result.push('\\');
                    i += 2;
                }
                't' => {
                    result.push('\t');
                    i += 2;
                }
                _ => {
                    result.push(chars[i]);
                    result.push(chars[i + 1]);
                    i += 2;
                }
            }
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }
    result
}

#[allow(dead_code)] // Java-ported teoz helper
fn live_thickness_width(level: usize) -> f64 {
    active_left_shift(level) + active_right_shift(level)
}

/// Unified extent calculation for a self-message tile, matching Java's
/// CommunicationTileSelf.getMinX() / getMaxX().
///
/// Returns `(min_x, max_x)` in Real coordinate space (before x_offset).
///
/// Java logic:
///   Forward (L→R):  minX = posC,  maxX = posC2 + compWidth
///   Reverse (R→L):  minX = posC - compWidth - liveDeltaAdj,  maxX = posC2
///   where posC2 = posC + active_right_shift(level)
///         liveDeltaAdj = if level > 0 { LIVE_DELTA_SIZE } else { 0 }
///         LIVE_DELTA_SIZE = 5.0 (CommunicationTile.LIVE_DELTA_SIZE)
fn self_message_extent(
    center_x: f64,
    comp_width: f64,
    active_level: usize,
    direction: &SeqDirection,
) -> (f64, f64) {
    const LIVE_DELTA_SIZE: f64 = 5.0;
    let pos_c2 = center_x + active_right_shift(active_level);
    match direction {
        SeqDirection::LeftToRight => (center_x, pos_c2 + comp_width),
        SeqDirection::RightToLeft => {
            let live_delta_adj = if active_level > 0 {
                LIVE_DELTA_SIZE
            } else {
                0.0
            };
            (center_x - comp_width - live_delta_adj, pos_c2)
        }
    }
}

/// Compute the contact point for a self-message (or normal message).
/// Java: CommunicationTileSelf.getContactPointRelative()
///   = component.getYPoint() = (textHeight + textAndArrowHeight) / 2
/// For normal messages: ContactPointRelative = arrowY = textHeight + paddingY
fn compute_selfmsg_contact(tile: &TeozTile, msg_line_height: f64) -> f64 {
    match tile {
        TeozTile::SelfMessage { .. } => {
            // Java: (textHeight + textAndArrowHeight) / 2 + paddingX(=0)
            // textHeight = lineHeight + 2*marginY(1) = h13 + 2
            // textAndArrowHeight = textHeight + arrowOnlyHeight(13)
            let text_height = msg_line_height + 2.0;
            let text_and_arrow_h = text_height + rose::SELF_ARROW_ONLY_HEIGHT;
            (text_height + text_and_arrow_h) / 2.0
        }
        TeozTile::Communication { .. } => {
            // Java: ComponentRoseArrow.getYPoint = textHeight + paddingY(4)
            let text_height = msg_line_height + 2.0;
            text_height + rose::ARROW_PADDING_Y
        }
        _ => 0.0,
    }
}

/// Compute the component width for a self-message tile given its text_width
/// and message line height.
fn self_message_comp_width(text_width: f64, msg_line_height: f64) -> f64 {
    let tm = TextMetrics::new(7.0, 7.0, 1.0, text_width, msg_line_height);
    rose::self_arrow_preferred_size(&tm).width
}

/// Find the most recent SelfMessage tile before `tile_index` (skipping LifeEvent tiles)
/// and return its (participant_idx, text_width, direction, active_level).
fn find_preceding_self_message(
    tiles: &[TeozTile],
    tile_index: usize,
) -> Option<(usize, f64, SeqDirection, usize)> {
    for i in (0..tile_index).rev() {
        match &tiles[i] {
            TeozTile::SelfMessage {
                participant_idx,
                text_width,
                direction,
                active_level,
                ..
            } => {
                return Some((
                    *participant_idx,
                    *text_width,
                    direction.clone(),
                    *active_level,
                ));
            }
            TeozTile::LifeEvent { .. } => continue,
            _ => return None,
        }
    }
    None
}

/// Drawn polygon height for the note (SVG rendering).
/// Java: `(int) getTextHeight()` where `getTextHeight = textBlock.h + 2*marginY(5)`.
///
/// Uses the proper BodyEnhanced2 model: `----`/`====` are block separators
/// (not content lines), tables include AtomWithMargin padding, etc.
fn estimate_note_height(text: &str) -> f64 {
    let text_block_h =
        crate::render::svg_richtext::compute_creole_note_text_height(text, NOTE_FONT_SIZE);
    let h = text_block_h + 10.0; // marginY1(5) + marginY2(5)
    h.trunc().max(25.0)
}

/// Preferred height for note tile spacing (Y advancement).
/// Java: `ComponentRoseNote.getPreferredHeight()`
///   = `getTextHeight() + 2*paddingY + deltaShadow`
///   = `(textBlock.h + 2*marginY(5)) + 2*paddingY(5) + 0`
///   = `textBlock.h + 20`
/// This is larger than the drawn polygon height by 2*paddingY(=10).
fn note_preferred_height(text: &str, delta_shadow: f64) -> f64 {
    let text_block_h =
        crate::render::svg_richtext::compute_creole_note_text_height(text, NOTE_FONT_SIZE);
    text_block_h + 20.0 + delta_shadow
}

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
            continue;
        }
        if trimmed.starts_with('|') && trimmed.ends_with('|') && trimmed.len() > 2 {
            let cells: Vec<&str> = trimmed[1..trimmed.len() - 1].split('|').collect();
            let mut row_w = 0.0_f64;
            for cell in &cells {
                let cell_text = cell.trim().trim_start_matches('=').trim();
                let bold = cell.trim().starts_with('=');
                let cw =
                    font_metrics::text_width(cell_text, "SansSerif", NOTE_FONT_SIZE, bold, false);
                row_w += cw + 10.0;
            }
            row_w += (cells.len() as f64 + 1.0) * 1.0;
            max_line_w = max_line_w.max(row_w);
        } else if trimmed.starts_with("* ") || trimmed.starts_with("# ") {
            let text_part = &trimmed[2..];
            let w = font_metrics::text_width(text_part, "SansSerif", NOTE_FONT_SIZE, false, false);
            max_line_w = max_line_w.max(w + 12.0);
        } else {
            let plain = crate::render::svg_richtext::creole_plain_text(trimmed);
            let w = font_metrics::text_width(&plain, "SansSerif", NOTE_FONT_SIZE, false, false);
            max_line_w = max_line_w.max(w);
        }
    }
    let w = max_line_w + NOTE_PADDING + NOTE_PADDING / 2.0 + NOTE_FOLD + 2.0;
    w.max(30.0)
}

/// Compute per-fragment (min_x, max_x) extent from child tiles within the
/// range [start_idx..end_idx) in raw coordinate space.
/// This matches Java GroupingTile which computes its own min/max from children,
/// recursively including nested fragment extents.
fn compute_fragment_extent(
    tiles: &[TeozTile],
    start_idx: usize,
    end_idx: usize,
    livings: &[LivingSpace],
    rl: &RealLine,
    tp: &TeozParams,
    delta_shadow: f64,
) -> (f64, f64) {
    let mut fmin = f64::MAX;
    let mut fmax = f64::MIN;
    let mut i = start_idx;

    while i < end_idx {
        let tile = &tiles[i];
        match tile {
            TeozTile::FragmentStart { .. } | TeozTile::GroupStart { .. } => {
                // Recursively compute nested fragment extent.
                // Find matching end by counting depth.
                let nested_start = i + 1;
                let mut depth = 1usize;
                let mut nested_end = i + 1;
                while nested_end < end_idx && depth > 0 {
                    match &tiles[nested_end] {
                        TeozTile::FragmentStart { .. } | TeozTile::GroupStart { .. } => {
                            depth += 1;
                        }
                        TeozTile::FragmentEnd { .. } | TeozTile::GroupEnd { .. } => {
                            depth -= 1;
                        }
                        _ => {}
                    }
                    nested_end += 1;
                }
                // nested_end is now past the matching end tile
                let (child_min, child_max) = compute_fragment_extent(
                    tiles,
                    nested_start,
                    nested_end - 1,
                    livings,
                    rl,
                    tp,
                    delta_shadow,
                );
                // Java: parent sees nested fragment as tile.getMinX() and tile.getMaxX()
                // getMinX = this.min - EXTERNAL_MARGINX1, getMaxX = this.max + EXTERNAL_MARGINX2
                // Then parent applies tile.getMinX() - MARGINX and tile.getMaxX() + MARGINX
                // BUT: the bottom fmin -= GROUP_MARGINX applies the parent MARGINX uniformly.
                // So here we only need EXTERNAL margins. The bottom MARGINX handles the rest.
                let child_with_margin_min = child_min - GROUP_EXTERNAL_MARGINX1;
                let child_with_margin_max = child_max + GROUP_EXTERNAL_MARGINX2;
                if child_with_margin_min < fmin {
                    fmin = child_with_margin_min;
                }
                if child_with_margin_max > fmax {
                    fmax = child_with_margin_max;
                }
                // Also include the nested fragment's header label width
                // Java: max candidate = min + dim1.getWidth() + 16
                if let TeozTile::FragmentStart { label, kind, .. } = tile {
                    let header_width = fragment_header_width(kind, label, "sans-serif", 13.0);
                    let header_right = child_min + header_width + 16.0;
                    if header_right > fmax {
                        fmax = header_right;
                    }
                }
                i = nested_end;
                continue;
            }
            TeozTile::FragmentEnd { .. } | TeozTile::GroupEnd { .. } => {
                i += 1;
                continue;
            }
            _ => {}
        }
        match tile {
            TeozTile::Communication {
                from_idx, to_idx, ..
            } => {
                let from_x = rl.get_value(livings[*from_idx].pos_c);
                let to_x = rl.get_value(livings[*to_idx].pos_c);
                let t_min = f64::min(from_x, to_x);
                let t_max = f64::max(from_x, to_x);
                if t_min < fmin {
                    fmin = t_min;
                }
                if t_max > fmax {
                    fmax = t_max;
                }
            }
            TeozTile::SelfMessage {
                participant_idx,
                text_width,
                direction,
                active_level,
                ..
            } => {
                let cx = rl.get_value(livings[*participant_idx].pos_c);
                let comp_w = self_message_comp_width(*text_width, tp.msg_line_height);
                let (t_min, t_max) = self_message_extent(cx, comp_w, *active_level, direction);
                if t_min < fmin {
                    fmin = t_min;
                }
                if t_max > fmax {
                    fmax = t_max;
                }
            }
            TeozTile::Note {
                participant_idx,
                is_left,
                width,
                is_note_on_message,
                ..
            } => {
                let cx = rl.get_value(livings[*participant_idx].pos_c);
                // Java ComponentRoseNote.getPreferredWidth includes deltaShadow
                let extent_w = *width + NOTE_EXTENT_PADDING + delta_shadow;
                if *is_note_on_message {
                    // Note on self-message: use self-message extent as base
                    if let Some((sm_pidx, sm_tw, sm_dir, sm_al)) =
                        find_preceding_self_message(tiles, i)
                    {
                        let sm_cx = rl.get_value(livings[sm_pidx].pos_c);
                        let sm_comp_w = self_message_comp_width(sm_tw, tp.msg_line_height);
                        let (sm_min, sm_max) =
                            self_message_extent(sm_cx, sm_comp_w, sm_al, &sm_dir);
                        let (t_min, t_max) = if *is_left {
                            (sm_min - extent_w, sm_max)
                        } else {
                            (sm_min, sm_max + extent_w)
                        };
                        if t_min < fmin {
                            fmin = t_min;
                        }
                        if t_max > fmax {
                            fmax = t_max;
                        }
                    } else {
                        // Fallback to cx-based
                        if *is_left {
                            let left = cx - extent_w - 5.0;
                            if left < fmin {
                                fmin = left;
                            }
                            if cx > fmax {
                                fmax = cx;
                            }
                        } else {
                            let right = cx + extent_w;
                            if right > fmax {
                                fmax = right;
                            }
                            if cx < fmin {
                                fmin = cx;
                            }
                        }
                    }
                } else if *is_left {
                    let left = cx - extent_w - 5.0;
                    if left < fmin {
                        fmin = left;
                    }
                    if cx > fmax {
                        fmax = cx;
                    }
                } else {
                    let right = cx + extent_w;
                    if right > fmax {
                        fmax = right;
                    }
                    if cx < fmin {
                        fmin = cx;
                    }
                }
            }
            TeozTile::LifeEvent { center, level, .. } => {
                // Java LifeEventTile.getMinX/getMaxX: adjust extent based on
                // activation level (LIVE_DELTA_SIZE = 5).
                const LIVE_DELTA_SIZE: f64 = 5.0;
                let cx = rl.get_value(*center);
                let min_adj = if *level > 0 { LIVE_DELTA_SIZE } else { 0.0 };
                let max_adj = if *level > 0 {
                    *level as f64 * LIVE_DELTA_SIZE
                } else {
                    0.0
                };
                let t_min = cx - min_adj;
                let t_max = cx + max_adj;
                if t_min < fmin {
                    fmin = t_min;
                }
                if t_max > fmax {
                    fmax = t_max;
                }
            }
            _ => {}
        }
        i += 1;
    }

    // Collect fragment separator (else) labels for width contribution.
    // Java: ElseTile.getMaxX() = parent.getMinX() + elseComponentWidth
    // where elseComponentWidth = pureTextWidth + marginX1(5) + marginX2(5)
    let mut else_labels: Vec<String> = Vec::new();
    {
        let mut sep_depth: usize = 0;
        for tile in &tiles[start_idx..end_idx] {
            match tile {
                TeozTile::FragmentStart { .. } | TeozTile::GroupStart { .. } => {
                    sep_depth += 1;
                }
                TeozTile::FragmentEnd { .. } | TeozTile::GroupEnd { .. } => {
                    sep_depth = sep_depth.saturating_sub(1);
                }
                TeozTile::FragmentSeparator { label, .. } if sep_depth == 0 => {
                    else_labels.push(label.clone());
                }
                _ => {}
            }
        }
    }

    // Fallback if no children found
    if fmin == f64::MAX {
        fmin = 0.0;
    }
    if fmax == f64::MIN {
        fmax = 0.0;
    }

    // Apply GroupingTile MARGINX (internal padding between frame and content)
    fmin -= GROUP_MARGINX;
    fmax += GROUP_MARGINX;

    // Add else separator width contributions.
    // Java: ElseTile.getMaxX() = parent.getMinX() + elseComponentWidth
    // parent.getMinX() = this.min = fmin (after MARGINX)
    // Java ComponentRoseGroupingElse wraps label in brackets: "[label]"
    // and uses marginX1=5, marginX2=5, 11pt bold font.
    for label in &else_labels {
        let bracket_label = format!("[{}]", label);
        let pure_text_w =
            crate::font_metrics::text_width(&bracket_label, "sans-serif", 11.0, true, false);
        // Java ComponentRoseGroupingElse: marginX1=5, marginX2=5
        let else_width = pure_text_w + 10.0;
        let else_max = fmin + else_width;
        if else_max > fmax {
            fmax = else_max;
        }
    }
    (fmin, fmax)
}

#[allow(dead_code)]
fn message_text_width(text: &str, font_family: &str, font_size: f64) -> f64 {
    text.split("\\n")
        .flat_map(|s| s.split(crate::NEWLINE_CHAR))
        .map(|line| font_metrics::text_width(line, font_family, font_size, false, false))
        .fold(0.0_f64, f64::max)
}

// ── Note-on-message helper ───────────────────────────────────────────────────

/// Check if the last non-LifeEvent tile in the list is a SelfMessage.
#[allow(dead_code)] // reserved for teoz self-message detection
fn is_last_tile_self_message(tiles: &[TeozTile]) -> bool {
    for tile in tiles.iter().rev() {
        match tile {
            TeozTile::SelfMessage { .. } => return true,
            TeozTile::LifeEvent { .. } => continue,
            _ => return false,
        }
    }
    false
}

/// Check if the last non-LifeEvent tile is any message (Communication or SelfMessage).
/// Used for note-on-message binding.
fn is_last_tile_any_message(tiles: &[TeozTile]) -> bool {
    for tile in tiles.iter().rev() {
        match tile {
            TeozTile::Communication { .. } | TeozTile::SelfMessage { .. } => return true,
            TeozTile::LifeEvent { .. } => continue,
            _ => return false,
        }
    }
    false
}

// ── Main build function ──────────────────────────────────────────────────────

/// Build the complete Teoz layout from a parsed sequence diagram.
///
/// This is the main orchestrator matching Java's
/// SequenceDiagramFileMakerTeoz + PlayingSpace + TileBuilder.
pub fn build_teoz_layout(sd: &SequenceDiagram, skin: &SkinParams) -> Result<SeqLayout> {
    log::debug!(
        "build_teoz_layout: {} participants, {} events",
        sd.participants.len(),
        sd.events.len(),
    );

    // ── Resolve font/skin params ─────────────────────────────────────────
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
    let max_message_size: Option<f64> = skin
        .get("maxmessagesize")
        .and_then(|s| s.parse::<f64>().ok());

    let tp = TeozParams::compute(default_font, msg_font_size, participant_font_size);

    // ── Step 1: Create RealLine ──────────────────────────────────────────
    let mut rl = RealLine::new();
    let xorigin = rl.create_origin();

    // ── Step 2: Create LivingSpaces ──────────────────────────────────────
    // For each participant, compute box width/height and create Real
    // constraint variables for posB (left), posC (center), posD (right).
    let n_parts = sd.participants.len();
    let mut livings: Vec<LivingSpace> = Vec::with_capacity(n_parts);
    let mut part_layouts: Vec<ParticipantLayout> = Vec::with_capacity(n_parts);
    let mut box_widths: Vec<f64> = Vec::with_capacity(n_parts);
    let mut box_heights: Vec<f64> = Vec::with_capacity(n_parts);
    let mut name_to_idx: HashMap<String, usize> = HashMap::new();

    let mut xcurrent = rl.add_at_least(xorigin, 0.0);

    for (i, p) in sd.participants.iter().enumerate() {
        let display = p.display_name.as_deref().unwrap_or(&p.name);
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
        // Java: LivingSpace positions use getPreferredWidth() which includes
        // deltaShadow. The drawn rect uses getTextWidth() (no shadow).
        // bw is the drawn width; bw_pos includes shadow for constraint positioning.
        let bw_pos = bw + sd.delta_shadow;
        let participant_line_height =
            font_metrics::line_height(default_font, participant_font_size, false, false);
        let multiline_extra = if num_lines > 1 {
            participant_line_height * (num_lines - 1) as f64
        } else {
            0.0
        };
        let base_participant_height = tp.participant_height;
        let bh = match p.kind {
            ParticipantKind::Actor => base_participant_height + 45.0 + multiline_extra,
            ParticipantKind::Boundary
            | ParticipantKind::Control
            | ParticipantKind::Entity
            | ParticipantKind::Database
            | ParticipantKind::Collections
            | ParticipantKind::Queue => base_participant_height + 20.0 + multiline_extra,
            ParticipantKind::Default => base_participant_height + multiline_extra,
        };

        // Create Real variables: posB = xcurrent, posC = posB + w/2, posD = posB + w
        // Use bw_pos (with shadow) for positioning, bw (without) for drawing.
        let pos_b = xcurrent;
        let half_w = bw_pos / 2.0;
        let pos_c = rl.add_fixed(pos_b, half_w);
        let pos_d = rl.add_fixed(pos_b, bw_pos);

        livings.push(LivingSpace::new(p.name.clone(), pos_b, pos_c, pos_d));
        box_widths.push(bw);
        box_heights.push(bh);
        name_to_idx.insert(p.name.clone(), i);

        // Next participant starts after posD.
        // Java teoz: xcurrent = livingSpace.getPosD().addAtLeast(0);
        xcurrent = rl.add_at_least(pos_d, 0.0);
    }

    // ── Step 2b: Add inter-participant constraints ───────────────────────
    // Java: LivingSpaces.addConstraints() ensures posA_next >= posE_prev + 10
    // where posA = posB - marginBefore, posE = posD + marginAfter.
    // With default margins of 0, this adds 10px gap between adjacent boxes.
    for i in 1..livings.len() {
        let prev_pos_d = livings[i - 1].pos_d;
        let curr_pos_b = livings[i].pos_b;
        rl.ensure_bigger_than_with_margin(curr_pos_b, prev_pos_d, 10.0);
    }

    // ── Step 2c: Pre-compute per-participant max activation levels ──────
    // Java: LivingSpace.getPosC2() uses liveboxes.getMaxPosition() which
    // depends on the GLOBAL max activation level, not a time-specific one.
    // We need this for self-message constraints (reverse case uses
    // previous participant's posC2 which includes its max activation delta).
    let mut max_activation_levels: HashMap<String, usize> = HashMap::new();
    {
        let mut levels: HashMap<String, usize> = HashMap::new();
        for event in &sd.events {
            match event {
                SeqEvent::Activate(name, _) => {
                    let level = levels.entry(name.clone()).or_insert(0);
                    *level += 1;
                    let max = max_activation_levels.entry(name.clone()).or_insert(0);
                    if *level > *max {
                        *max = *level;
                    }
                }
                SeqEvent::Deactivate(name) => {
                    let level = levels.entry(name.clone()).or_insert(0);
                    if *level > 0 {
                        *level -= 1;
                    }
                }
                _ => {}
            }
        }
    }

    // ── Step 3: Build tiles from events ──────────────────────────────────
    let mut tiles: Vec<TeozTile> = Vec::new();
    let mut autonumber_enabled = false;
    let mut autonumber_counter: u32 = 1;
    let mut autonumber_start: u32 = 1;
    let mut active_levels: HashMap<String, usize> = HashMap::new();

    for (event_idx, event) in sd.events.iter().enumerate() {
        match event {
            SeqEvent::AutoNumber { start } => {
                autonumber_enabled = true;
                if let Some(n) = start {
                    autonumber_counter = *n;
                    autonumber_start = *n;
                }
            }
            SeqEvent::Message(msg) => {
                let autonumber = if autonumber_enabled {
                    let label = format!("{autonumber_counter}");
                    autonumber_counter += 1;
                    Some(label)
                } else {
                    None
                };

                let autonumber_extra_w = autonumber.as_ref().map_or(0.0, |num| {
                    font_metrics::text_width(num, default_font, msg_font_size, true, false) + 4.0
                });

                let mut text_lines: Vec<String> = msg
                    .text
                    .split("\\n")
                    .flat_map(|s| s.split(crate::NEWLINE_CHAR))
                    .map(unescape_backslash)
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
                    .map(|line| {
                        crate::render::svg_richtext::creole_text_width(
                            line,
                            default_font,
                            msg_font_size,
                            false,
                            false,
                        )
                    })
                    .fold(0.0_f64, f64::max)
                    + autonumber_extra_w;

                // Java: when display has a single empty string, AbstractTextualComponent
                // creates a TextBlockEmpty with height 0.  Only non-empty text contributes.
                let is_text_empty = text_lines.len() == 1 && text_lines[0].is_empty();
                let text_h = if is_text_empty {
                    0.0
                } else {
                    tp.msg_line_height * text_lines.len().max(1) as f64
                };
                let is_dashed = msg.arrow_style == SeqArrowStyle::Dashed;
                let has_open_head = matches!(
                    msg.arrow_head,
                    SeqArrowHead::Open | SeqArrowHead::HalfTop | SeqArrowHead::HalfBottom
                );

                // Skip boundary/gate messages: "[" and "]" are not real participants.
                // They are drawn at the diagram edges and should not create constraints.
                let is_boundary_from = msg.from == "[";
                let is_boundary_to = msg.to == "]";
                if is_boundary_from || is_boundary_to {
                    // Boundary messages: create a Communication tile from/to the
                    // nearest edge participant, but don't add participant constraints.
                    let real_from = if is_boundary_from {
                        // [-> goes to the target; the "from" is the left edge
                        0 // first participant
                    } else {
                        name_to_idx.get(&msg.from).copied().unwrap_or(0)
                    };
                    let real_to = if is_boundary_to {
                        // ->] goes from the source; the "to" is the right edge
                        livings.len().saturating_sub(1)
                    } else {
                        name_to_idx.get(&msg.to).copied().unwrap_or(0)
                    };
                    let from_center = livings[real_from].pos_c;
                    let to_center = livings[real_to].pos_c;
                    let tm = TextMetrics::new(7.0, 7.0, 1.0, text_w, text_h);
                    let height = rose::arrow_preferred_size(&tm, 0.0, 0.0).height;
                    // Boundary arrows need the activation level of the real participant
                    // for position adjustments (Java: CommunicationExoTile.drawU).
                    let fl = if is_boundary_from {
                        0
                    } else {
                        active_levels.get(&msg.from).copied().unwrap_or(0)
                    };
                    let mut tl = if is_boundary_to {
                        0
                    } else {
                        active_levels.get(&msg.to).copied().unwrap_or(0)
                    };
                    // Java CommunicationExoTile.getLevelAt(IGNORE_FUTURE_DEACTIVATE)
                    // includes the inline activation from the message's own `++`.
                    // Look ahead for inline Activate on the same participant.
                    let real_participant = if is_boundary_from { &msg.to } else { &msg.from };
                    if event_idx + 1 < sd.events.len()
                        && sd.inline_life_events.contains(&(event_idx + 1))
                    {
                        if let SeqEvent::Activate(name, _) = &sd.events[event_idx + 1] {
                            if name == real_participant {
                                tl += 1;
                            }
                        }
                    }
                    tiles.push(TeozTile::Communication {
                        from_name: msg.from.clone(),
                        to_name: msg.to.clone(),
                        from_idx: real_from,
                        to_idx: real_to,
                        text: msg.text.clone(),
                        text_lines,
                        is_dashed,
                        has_open_head,
                        arrow_head: msg.arrow_head.clone(),
                        text_width: text_w,
                        height,
                        y: None,
                        autonumber,
                        from_center,
                        to_center,
                        circle_from: msg.circle_from,
                        circle_to: msg.circle_to,
                        cross_from: msg.cross_from,
                        cross_to: msg.cross_to,
                        is_parallel: msg.parallel,
                        from_level: fl,
                        to_level: tl,
                        hidden: msg.hidden,
                        bidirectional: msg.bidirectional,
                        is_short_gate: msg.is_short_gate,
                        // Java FROM_RIGHT for short gate: when from=[ and
                        // the original direction was RTL (arrow points left).
                        gate_right_border: is_boundary_from
                            && msg.is_short_gate
                            && msg.direction == SeqDirection::RightToLeft,
                        color: msg.color.clone(),
                    });
                    continue;
                }

                if msg.from == msg.to {
                    // Self-message
                    let idx = name_to_idx.get(&msg.from).copied().unwrap_or(0);
                    let center = livings[idx].pos_c;
                    let tm = TextMetrics::new(7.0, 7.0, 1.0, text_w, text_h);
                    let height = rose::self_arrow_preferred_size(&tm).height;

                    // Java: levelIgnore = getLevelAt(IGNORE_FUTURE_ACTIVATE) = current level
                    // without counting future linked activations.
                    let level = active_levels.get(&msg.from).copied().unwrap_or(0);
                    // Java: levelConsidere = getLevelAt(CONSIDERE_FUTURE_DEACTIVATE) =
                    // current level with ALL linked events (activations + deactivations)
                    // applied. We peek ahead at inline events for this message.
                    let mut level_considere = level as i32;
                    for peek in &sd.events[(event_idx + 1)..] {
                        match peek {
                            SeqEvent::Activate(name, _) if name == &msg.from => {
                                level_considere += 1;
                            }
                            SeqEvent::Deactivate(name) if name == &msg.from => {
                                level_considere = (level_considere - 1).max(0);
                            }
                            // Skip notes
                            SeqEvent::NoteRight { .. }
                            | SeqEvent::NoteLeft { .. }
                            | SeqEvent::NoteOver { .. } => {}
                            // Stop at next non-parallel message
                            SeqEvent::Message(m) if !m.parallel => break,
                            SeqEvent::Message(_) => {}
                            _ => break,
                        }
                    }
                    let delta_x1 = (level as f64 - level_considere as f64) * 5.0;
                    tiles.push(TeozTile::SelfMessage {
                        participant_idx: idx,
                        text: msg.text.clone(),
                        text_lines,
                        is_dashed,
                        has_open_head,
                        arrow_head: msg.arrow_head.clone(),
                        text_width: text_w,
                        height,
                        y: None,
                        autonumber,
                        center,
                        direction: msg.direction.clone(),
                        is_reverse_define: msg.is_reverse_define,
                        active_level: level,
                        delta_x1,
                        circle_from: msg.circle_from,
                        circle_to: msg.circle_to,
                        cross_from: msg.cross_from,
                        cross_to: msg.cross_to,
                        is_parallel: msg.parallel,
                        hidden: msg.hidden,
                        bidirectional: msg.bidirectional,
                        color: msg.color.clone(),
                    });
                } else {
                    // Normal message
                    let fi = name_to_idx.get(&msg.from).copied().unwrap_or(0);
                    let ti = name_to_idx.get(&msg.to).copied().unwrap_or(0);
                    let from_center = livings[fi].pos_c;
                    let to_center = livings[ti].pos_c;

                    let tm = TextMetrics::new(7.0, 7.0, 1.0, text_w, text_h);
                    let height = rose::arrow_preferred_size(&tm, 0.0, 0.0).height;

                    // Java IGNORE_FUTURE_DEACTIVATE: peek ahead for activations
                    // linked to this message. In Java, all LifeEvents between two
                    // messages are linked to the preceding message via setMessage().
                    // So we scan ahead until the next non-parallel Message, counting
                    // activations but ignoring deactivations and notes.
                    let mut fl = active_levels.get(&msg.from).copied().unwrap_or(0);
                    let mut tl = active_levels.get(&msg.to).copied().unwrap_or(0);
                    for peek in &sd.events[(event_idx + 1)..] {
                        match peek {
                            SeqEvent::Activate(name, _) => {
                                if name == &msg.from {
                                    fl += 1;
                                }
                                if name == &msg.to {
                                    tl += 1;
                                }
                            }
                            // Ignore future deactivations (IGNORE_FUTURE_DEACTIVATE mode)
                            SeqEvent::Deactivate(_) => {}
                            // Skip notes — Java's nextButSkippingNotes skips these
                            SeqEvent::NoteRight { .. }
                            | SeqEvent::NoteLeft { .. }
                            | SeqEvent::NoteOver { .. } => {}
                            // Stop at the next non-parallel message (end of this
                            // message's linked LifeEvent chain in Java).
                            SeqEvent::Message(m) if !m.parallel => break,
                            // Continue past parallel messages (they share the link)
                            SeqEvent::Message(_) => {}
                            _ => break,
                        }
                    }

                    tiles.push(TeozTile::Communication {
                        from_name: msg.from.clone(),
                        to_name: msg.to.clone(),
                        from_idx: fi,
                        to_idx: ti,
                        text: msg.text.clone(),
                        text_lines,
                        is_dashed,
                        has_open_head,
                        arrow_head: msg.arrow_head.clone(),
                        text_width: text_w,
                        height,
                        y: None,
                        autonumber,
                        from_center,
                        to_center,
                        circle_from: msg.circle_from,
                        circle_to: msg.circle_to,
                        cross_from: msg.cross_from,
                        cross_to: msg.cross_to,
                        is_parallel: msg.parallel,
                        from_level: fl,
                        to_level: tl,
                        hidden: msg.hidden,
                        bidirectional: msg.bidirectional,
                        is_short_gate: msg.is_short_gate,
                        gate_right_border: false,
                        color: msg.color.clone(),
                    });
                }
            }
            SeqEvent::Activate(name, _act_color) => {
                let level = active_levels.entry(name.clone()).or_insert(0);
                *level += 1;
                let pidx = name_to_idx.get(name).copied().unwrap_or(0);
                tiles.push(TeozTile::LifeEvent {
                    height: 0.0,
                    y: None,
                    participant_idx: pidx,
                    center: livings[pidx].pos_c,
                    level: *level,
                });
            }
            SeqEvent::Deactivate(name) => {
                let level = active_levels.entry(name.clone()).or_insert(0);
                if *level > 0 {
                    *level -= 1;
                }
                let pidx = name_to_idx.get(name).copied().unwrap_or(0);
                tiles.push(TeozTile::LifeEvent {
                    height: 0.0,
                    y: None,
                    participant_idx: pidx,
                    center: livings[pidx].pos_c,
                    level: *level,
                });
            }
            SeqEvent::Destroy(_name) => {
                // Java: Destroy is isDeactivateOrDestroy(), so level is decremented
                let level = active_levels.entry(_name.clone()).or_insert(0);
                if *level > 0 {
                    *level -= 1;
                }
                let pidx = name_to_idx.get(_name).copied().unwrap_or(0);
                tiles.push(TeozTile::LifeEvent {
                    height: 0.0,
                    y: None,
                    participant_idx: pidx,
                    center: livings[pidx].pos_c,
                    level: *level,
                });
            }
            SeqEvent::Create(_name) => {
                // Teoz create handling is not yet implemented; the create
                // directive is a no-op here (Puma2 path handles it). Avoid
                // panicking so teoz diagrams with `create` still render.
            }
            SeqEvent::NoteRight {
                participant,
                text,
                parallel,
                color,
                ..
            } => {
                let idx = name_to_idx.get(participant).copied().unwrap_or(0);
                let center = livings[idx].pos_c;
                let w = estimate_note_width(text);
                let h = note_preferred_height(text, sd.delta_shadow);
                let is_smn = is_last_tile_any_message(&tiles);
                tiles.push(TeozTile::Note {
                    participant_idx: idx,
                    text: text.clone(),
                    is_left: false,
                    width: w,
                    height: h,
                    y: None,
                    center,
                    is_note_on_message: is_smn,
                    active_level: active_levels.get(participant).copied().unwrap_or(0),
                    is_parallel: *parallel,
                    color: color.clone(),
                });
            }
            SeqEvent::NoteLeft {
                participant,
                text,
                parallel,
                color,
                ..
            } => {
                let idx = name_to_idx.get(participant).copied().unwrap_or(0);
                let center = livings[idx].pos_c;
                let w = estimate_note_width(text);
                let h = note_preferred_height(text, sd.delta_shadow);
                let is_smn = is_last_tile_any_message(&tiles);
                tiles.push(TeozTile::Note {
                    participant_idx: idx,
                    text: text.clone(),
                    is_left: true,
                    width: w,
                    height: h,
                    y: None,
                    center,
                    is_note_on_message: is_smn,
                    active_level: active_levels.get(participant).copied().unwrap_or(0),
                    is_parallel: *parallel,
                    color: color.clone(),
                });
            }
            SeqEvent::NoteOver {
                participants, text, ..
            } => {
                let w = estimate_note_width(text);
                let h = note_preferred_height(text, sd.delta_shadow);
                tiles.push(TeozTile::NoteOver {
                    participants: participants.clone(),
                    text: text.clone(),
                    width: w,
                    height: h,
                    y: None,
                });
            }
            SeqEvent::Divider { text } => {
                tiles.push(TeozTile::Divider {
                    text: text.clone(),
                    height: tp.divider_height,
                    y: None,
                });
            }
            SeqEvent::Delay { text } => {
                tiles.push(TeozTile::Delay {
                    text: text.clone(),
                    height: tp.delay_height,
                    y: None,
                });
            }
            SeqEvent::Ref {
                participants,
                label,
            } => {
                tiles.push(TeozTile::Ref {
                    participants: participants.clone(),
                    label: label.clone(),
                    height: tp.ref_height,
                    y: None,
                });
            }
            SeqEvent::FragmentStart {
                kind,
                label,
                parallel,
                color,
            } => {
                // Java GroupingTile header: dim1.height + MARGINY_MAGIC/2
                // dim1.height = frag_header_height, MARGINY_MAGIC/2 = 10
                tiles.push(TeozTile::FragmentStart {
                    kind: kind.clone(),
                    label: label.clone(),
                    height: tp.frag_header_height + 10.0,
                    y: None,
                    is_parallel: *parallel,
                    color: color.clone(),
                });
            }
            SeqEvent::FragmentSeparator { label } => {
                // Java teoz: ElseTile preferred height = textHeight + 16
                // textHeight = textBlock.height + 2*marginY(1) = h13 + 2
                tiles.push(TeozTile::FragmentSeparator {
                    label: label.clone(),
                    height: tp.frag_separator_height_teoz,
                    y: None,
                });
            }
            SeqEvent::FragmentEnd => {
                tiles.push(TeozTile::FragmentEnd {
                    height: 4.0,
                    y: None,
                });
            }
            SeqEvent::Spacing { pixels } => {
                tiles.push(TeozTile::Spacing {
                    pixels: *pixels as f64,
                    y: None,
                });
            }
            SeqEvent::GroupStart { label } => {
                tiles.push(TeozTile::GroupStart {
                    _label: label.clone(),
                    height: tp.frag_header_height + 10.0,
                    y: None,
                });
            }
            SeqEvent::GroupEnd => {
                tiles.push(TeozTile::GroupEnd {
                    height: 4.0,
                    y: None,
                });
            }
        }
    }

    // ── Step 4: Add constraints from tiles ───────────────────────────────
    // Communication tiles constrain participant spacing.
    // Java: CommunicationTile.addConstraints() does
    //   target_center >= source_center + arrow_preferred_width
    for tile in &tiles {
        match tile {
            TeozTile::Communication {
                from_idx,
                to_idx,
                from_name,
                to_name,
                text_width,
                from_center,
                to_center,
                from_level,
                to_level,
                gate_right_border,
                ..
            } => {
                if from_name == "[" && !*gate_right_border {
                    // Left-border messages: Java CommunicationExoTile.addConstraints()
                    // posC >= xOrigin + arrowWidth.
                    // Except for short gate FROM_RIGHT (gate_right_border=true)
                    // where isRightBorder()=true and no constraint is added.
                    let arrow_tm = TextMetrics::new(7.0, 7.0, 1.0, *text_width, tp.msg_line_height);
                    let arrow_w = rose::arrow_preferred_size(&arrow_tm, 0.0, 0.0).width;
                    rl.ensure_bigger_than_with_margin(*to_center, xorigin, arrow_w);
                } else if to_name == "]" || *gate_right_border {
                    // Right-border messages (incl. short gate FROM_RIGHT): no constraint
                } else {
                    let fi = *from_idx;
                    let ti = *to_idx;
                    let arrow_tm = TextMetrics::new(7.0, 7.0, 1.0, *text_width, tp.msg_line_height);
                    let arrow_w = rose::arrow_preferred_size(&arrow_tm, 0.0, 0.0).width;

                    // Java CommunicationTile.addConstraints():
                    // Uses per-tile activation levels (IGNORE_FUTURE_DEACTIVATE),
                    // stored on the tile during construction.
                    const LIVE_DELTA_SIZE: f64 = 5.0;

                    if fi < ti {
                        let ti_adj = if *to_level > 0 { LIVE_DELTA_SIZE } else { 0.0 };
                        let needed = arrow_w + ti_adj;
                        rl.ensure_bigger_than_with_margin(*to_center, *from_center, needed);
                    } else {
                        let fi_adj = if *from_level > 0 {
                            LIVE_DELTA_SIZE
                        } else {
                            0.0
                        };
                        let ti_adj = *to_level as f64 * LIVE_DELTA_SIZE;
                        let needed = arrow_w + fi_adj + ti_adj;
                        rl.ensure_bigger_than_with_margin(*from_center, *to_center, needed);
                    }
                }
            }
            TeozTile::SelfMessage {
                participant_idx,
                text_width,
                center,
                is_reverse_define,
                ..
            } => {
                let idx = *participant_idx;
                let tm = TextMetrics::new(7.0, 7.0, 1.0, *text_width, tp.msg_line_height);
                let comp_w = rose::self_arrow_preferred_size(&tm).width;

                // Java CommunicationTileSelf uses isReverseDefine() (not direction)
                // Java forward: next.posC >= self.posC2 + compWidth
                //   posC2 = posC + maxActivationDelta (global max level)
                // Java reverse: self.posC >= prev.posC2 + compWidth
                //   posC2_prev uses the PREVIOUS participant's global max activation
                if *is_reverse_define {
                    if idx > 0 {
                        let prev_name = &sd.participants[idx - 1].name;
                        let prev_max_level =
                            max_activation_levels.get(prev_name).copied().unwrap_or(0);
                        let prev_delta = active_right_shift(prev_max_level);
                        let needed = prev_delta + comp_w;
                        let prev_center = livings[idx - 1].pos_c;
                        rl.ensure_bigger_than_with_margin(*center, prev_center, needed);
                    }
                } else if idx + 1 < n_parts {
                    let self_name = &sd.participants[idx].name;
                    let self_max_level = max_activation_levels.get(self_name).copied().unwrap_or(0);
                    let self_delta = active_right_shift(self_max_level);
                    let needed = self_delta + comp_w;
                    let next_center = livings[idx + 1].pos_c;
                    rl.ensure_bigger_than_with_margin(next_center, *center, needed);
                }
            }
            TeozTile::Note { .. } => {
                // Java NoteTile.addConstraints() and CommunicationTileNoteRight
                // .addConstraints() are empty — notes do NOT push adjacent
                // participants apart.  The note width only extends the diagram's
                // raw_max/raw_min through the extent computation in Step 6.
            }
            _ => {}
        }
    }

    // ── Step 4b: LivingSpaces.addConstraints() ──────────────────────────
    // Java: current.posB >= previous.posD + 10 (ensure 10px gap between
    // adjacent participants even when no messages span between them).
    for i in 1..livings.len() {
        let prev_d = livings[i - 1].pos_d;
        let curr_b = livings[i].pos_b;
        rl.ensure_bigger_than_with_margin(curr_b, prev_d, 10.0);
    }

    // ── Step 5: Compile constraints ──────────────────────────────────────
    rl.compile();

    // ── Step 6: Assign Y positions (fillPositionelTiles) ─────────────────
    // Java PlayingSpace positions tiles starting at startingY = 8 within the
    // playing space. The playing space origin = STARTING_Y + max_preferred_height
    // (below participant heads). So tile top y = lifeline_top + 8.
    //
    // In our model, tile y represents the tile TOP (like Java), not the arrow y.
    // For Communication tiles, the arrow y = tile_y + arrowY.
    let max_box_height = box_heights.iter().copied().fold(0.0_f64, f64::max);
    // Java layout uses preferred height (= drawn + deltaShadow + 1) for lifeline start.
    // The deltaShadow contribution to total_height is handled separately via
    // shadow_expansion in the final height formula, so we include it in
    // max_preferred_height for positioning but it flows through consistently.
    let max_preferred_height = max_box_height + 1.0 + sd.delta_shadow;
    let mut y = STARTING_Y + max_preferred_height + PLAYINGSPACE_STARTING_Y;
    // Track the previous message for note-on-message binding.
    // In Java, notes immediately following messages form a combined tile:
    //   combined height = max(message_h, note_h)
    // instead of message_h + note_h (separate tiles).
    let mut prev_msg_height: Option<f64> = None;
    let mut prev_msg_y: Option<f64> = None;
    // Java GroupingTile: MARGINY_MAGIC = 20, but getPreferredHeight uses full 20
    // while fillPositionelTiles uses header + MARGINY_MAGIC/2 = header + 10.
    // The effective bottom padding is MARGINY_MAGIC - MARGINY_MAGIC/2 = 10.
    const FRAG_BOTTOM_PADDING: f64 = 10.0;
    // Java EmptyTile(4): spacer before and after a GroupingTile.
    const EMPTY_TILE_SPACING: f64 = 4.0;

    // Track the y position where the current "block" (non-parallel group) started.
    // Parallel messages rewind y to this block start.
    let mut block_start_y: Option<f64> = None;
    let mut block_max_height: f64 = 0.0;

    // Track fragment nesting for parallel message support.
    // Java mergeParallel + TileParallel: when a parallel message follows a
    // GroupingTile, both share the same y start and the GroupingTile is offset
    // down by the message's contactPointRelative.
    let mut frag_depth: i32 = 0;
    // y before the EmptyTile(4) spacer of the outermost fragment
    let mut frag_block_y_before: Option<f64> = None;
    // Tile index range of the outermost fragment block
    let mut frag_block_start_idx: Option<usize> = None;

    // Track parallel message tile indices for contact-point alignment.
    // Java TileParallel aligns parallel tiles so their contact points (arrow y)
    // match the maximum contact point among all parallel tiles.
    // Each entry is tile_index for message tiles in the current parallel block.
    let mut parallel_block_tile_indices: Vec<usize> = Vec::new();

    // Track parallel fragment blocks.
    // When a FragmentStart has is_parallel=true, we rewind y to the start
    // of the previous block and lay out the fragment in parallel.
    // After the matching FragmentEnd, y = block_start + max(prev_height, this_height).
    let mut parallel_frag_base_y: Option<f64> = None;
    let mut parallel_frag_prev_height: f64 = 0.0;
    let mut parallel_frag_depth: i32 = 0; // nesting depth within the parallel fragment

    let tile_count = tiles.len();
    let mut tile_idx = 0;
    while tile_idx < tile_count {
        // Check if this tile is a parallel message
        let is_parallel_msg = matches!(
            tiles[tile_idx],
            TeozTile::Communication {
                is_parallel: true,
                ..
            } | TeozTile::SelfMessage {
                is_parallel: true,
                ..
            }
        );
        // Check if this tile is a parallel fragment start
        let is_parallel_frag = matches!(
            tiles[tile_idx],
            TeozTile::FragmentStart {
                is_parallel: true,
                ..
            }
        );
        let is_parallel = is_parallel_msg;

        // Check if this Note follows a message (note-on-message binding).
        let is_note_on_msg = matches!(
            tiles[tile_idx],
            TeozTile::Note {
                is_note_on_message: true,
                ..
            }
        ) && prev_msg_height.is_some();

        if is_parallel_frag {
            // Parallel fragment: rewind y to the start of the previous block.
            // Java mergeParallel creates a TileParallel where both fragments
            // share the same y start, and total height = max(frag1_h, frag2_h).
            if let Some(bs_y) = block_start_y {
                // Java removeEmptyCloseToParallel: the trailing EmptyTile(4) and
                // FRAG_BOTTOM_PADDING(10) from the previous fragment are removed.
                // Compute effective previous height without trailing padding.
                let trailing_padding = FRAG_BOTTOM_PADDING + EMPTY_TILE_SPACING; // 10 + 4 = 14
                let prev_effective = block_max_height - trailing_padding;
                // Java TileParallel contact-point alignment: when a fragment
                // (contactPointRelative = 0) is parallel with message tiles
                // (contactPointRelative = height - 8), the fragment is shifted
                // down by the max message contact point so their baselines align.
                let max_msg_contact: f64 = parallel_block_tile_indices
                    .iter()
                    .map(|&i| tiles[i].contact_point_relative())
                    .fold(0.0_f64, f64::max);
                parallel_frag_base_y = Some(bs_y);
                parallel_frag_prev_height = prev_effective;
                parallel_frag_depth = 1; // this fragment's own depth
                                         // Rewind to block start + contact shift.
                                         // No EmptyTile(4) before parallel fragment
                                         // (Java removeEmptyCloseToParallel removes it).
                y = bs_y + max_msg_contact;
                frag_depth += 1;
                tiles[tile_idx].set_y(y);
                let tile_h = tiles[tile_idx].preferred_height();
                y += tile_h;
            } else {
                // No block to parallel with — treat as normal fragment
                frag_depth += 1;
                y += EMPTY_TILE_SPACING;
                tiles[tile_idx].set_y(y);
                y += tiles[tile_idx].preferred_height();
            }
            prev_msg_height = None;
            prev_msg_y = None;
        } else if is_note_on_msg {
            let msg_h = prev_msg_height.unwrap();
            let msg_y = prev_msg_y.unwrap();
            let note_h = tiles[tile_idx].preferred_height();
            // Find the preceding message tile (skipping LifeEvents).
            let preceding_msg_idx = {
                let mut idx = tile_idx - 1;
                while idx > 0 && matches!(tiles[idx], TeozTile::LifeEvent { .. }) {
                    idx -= 1;
                }
                idx
            };
            let preceding_is_non_parallel = match &tiles[preceding_msg_idx] {
                TeozTile::Communication { is_parallel, .. }
                | TeozTile::SelfMessage { is_parallel, .. } => !*is_parallel,
                _ => false,
            };
            // Java TileParallel contact-point alignment: when a `& note` (parallel)
            // follows a non-parallel message, Java's mergeParallel wraps them in a
            // TileParallel. Within TileParallel.drawU(), each sub-tile is shifted
            // down by (maxContact - itsContact). For non-parallel notes (wrapper
            // CommunicationTileNoteRight), there's no TileParallel — the note
            // draws at the same Y as the message, so no contact-point shift.
            let note_contact = note_h / 2.0;
            let note_is_parallel_tile = matches!(
                tiles[tile_idx],
                TeozTile::Note {
                    is_parallel: true,
                    ..
                }
            );
            let contact_delta = if preceding_is_non_parallel && note_is_parallel_tile {
                let msg_contact = tiles[preceding_msg_idx].contact_point_relative();
                let max_contact = msg_contact.max(note_contact);
                max_contact - note_contact
            } else {
                0.0
            };
            tiles[tile_idx].set_y(msg_y + contact_delta);
            // Java TileParallel: when a `& note` follows a non-parallel message,
            // Java mergeParallel creates TileParallel(message, note) whose height
            // = max(contacts) + max(zzz_values). This is larger than max(msg_h, note_h)
            // because message has high contact + low zzz, note has low contact + high zzz.
            // However, standalone notes after parallel messages should use plain max.
            let combined_h = if preceding_is_non_parallel && note_is_parallel_tile {
                // TileParallel formula: max(contacts) + max(zzz_values)
                let msg_contact = tiles[preceding_msg_idx].contact_point_relative();
                let msg_zzz = tiles[preceding_msg_idx].zzz();
                let note_zzz = note_h - note_contact;
                msg_contact.max(note_contact) + msg_zzz.max(note_zzz)
            } else {
                msg_h.max(note_h)
            };
            // Java: note wraps message inside TileParallel, so LifeEvent
            // tiles AFTER the TileParallel see the combined height. In Rust,
            // the note is a separate tile, so LifeEvent tiles between the
            // message and the note were placed using only the message height.
            // Retroactively adjust those LifeEvent tiles to use combined_h.
            if combined_h > msg_h {
                let new_y_after = msg_y + combined_h;
                for tile in &mut tiles[(preceding_msg_idx + 1)..tile_idx] {
                    if matches!(tile, TeozTile::LifeEvent { .. }) {
                        tile.set_y(new_y_after);
                    }
                }
            }
            y = msg_y + combined_h;
            prev_msg_height = None;
            prev_msg_y = None;
        } else if is_parallel {
            // Parallel message: rewind to block start, use max height.
            // Java: mergeParallel pulls the previous non-LifeEvent tile into
            // a TileParallel with the parallel message. Contact points align
            // the tiles vertically.
            if let Some(bs_y) = block_start_y {
                // Check if the block is a fragment block. If so, apply the
                // Java TileParallel contact-point offset: shift all fragment
                // tiles down by the message's contact point, and place the
                // message at the block start.
                if let Some(frag_start_idx) = frag_block_start_idx.take() {
                    let selfmsg_contact =
                        compute_selfmsg_contact(&tiles[tile_idx], tp.msg_line_height);
                    // Shift all fragment tiles down by selfmsg_contact
                    for tile in &mut tiles[frag_start_idx..tile_idx] {
                        if let Some(old_y) = tile.get_y() {
                            tile.set_y(old_y + selfmsg_contact);
                        }
                    }
                    // Place parallel message at original block start
                    tiles[tile_idx].set_y(bs_y);
                    // Java removeEmptyCloseToParallel: the trailing EmptyTile(4)
                    // after the GroupingTile is removed when a parallel message
                    // follows. Our FragEnd.height(4) is the equivalent trailing
                    // spacer, so subtract it from block_max_height.
                    let trailing = EMPTY_TILE_SPACING; // 4.0
                    let effective_block = block_max_height - trailing;
                    y = bs_y + selfmsg_contact + effective_block;
                } else {
                    tiles[tile_idx].set_y(bs_y);
                    let tile_h = tiles[tile_idx].preferred_height();
                    if tile_h > block_max_height {
                        block_max_height = tile_h;
                    }
                    y = bs_y + block_max_height;
                }
            } else {
                // No block to parallel with — treat as normal
                tiles[tile_idx].set_y(y);
                y += tiles[tile_idx].preferred_height();
            }
            parallel_block_tile_indices.push(tile_idx);
            prev_msg_height = Some(tiles[tile_idx].preferred_height());
            prev_msg_y = Some(tiles[tile_idx].get_y().unwrap_or(y));
        } else {
            // Track fragment nesting depth
            let is_frag_start = matches!(
                tiles[tile_idx],
                TeozTile::FragmentStart { .. } | TeozTile::GroupStart { .. }
            );
            let is_frag_end = matches!(
                tiles[tile_idx],
                TeozTile::FragmentEnd { .. } | TeozTile::GroupEnd { .. }
            );

            if is_frag_start {
                frag_depth += 1;
                // Track parallel fragment nesting
                if parallel_frag_base_y.is_some() {
                    parallel_frag_depth += 1;
                }
            }
            if is_frag_end {
                frag_depth -= 1;
                // Track parallel fragment nesting
                if parallel_frag_base_y.is_some() {
                    parallel_frag_depth -= 1;
                }
            }

            // Java inserts EmptyTile(4) spacer before GroupingTile
            if is_frag_start {
                y += EMPTY_TILE_SPACING;
            }
            // Java GroupingTile bottom padding = MARGINY_MAGIC/2 = 10
            if is_frag_end {
                y += FRAG_BOTTOM_PADDING;
            }

            // Check if this FragmentEnd closes the parallel fragment
            if is_frag_end && parallel_frag_depth == 0 {
                if let Some(base_y) = parallel_frag_base_y.take() {
                    // Current fragment height from base, excluding trailing padding.
                    // y already includes FRAG_BOTTOM_PADDING(10) added above;
                    // exclude it along with this tile's height (EmptyTile equivalent).
                    let _trailing_padding =
                        FRAG_BOTTOM_PADDING + tiles[tile_idx].preferred_height();
                    let this_frag_height = y - base_y; // y includes the 10px padding
                    let this_effective = this_frag_height - FRAG_BOTTOM_PADDING;
                    // Use max of previous block height and this parallel fragment height
                    let max_height = parallel_frag_prev_height.max(this_effective);
                    // After the parallel block, add back the trailing padding so
                    // subsequent normal tiles have correct spacing.
                    y = base_y + max_height + FRAG_BOTTOM_PADDING;
                    // Set block tracking for potential subsequent parallel blocks.
                    // Java removeEmptyCloseToParallel strips the trailing
                    // EmptyTile(4) when a subsequent parallel tile follows, so
                    // block_max_height should NOT include EMPTY_TILE_SPACING.
                    block_start_y = Some(base_y);
                    block_max_height = max_height + FRAG_BOTTOM_PADDING;
                    frag_block_y_before = Some(base_y);
                    // Place the FragEnd tile at the appropriate position
                    tiles[tile_idx].set_y(y);
                    y += tiles[tile_idx].preferred_height();
                    prev_msg_height = None;
                    prev_msg_y = None;
                    tile_idx += 1;
                    continue;
                }
            }

            // Record the outermost fragment start AFTER EmptyTile spacing.
            // Java's TileParallel aligns the GroupingTile (which starts
            // after the leading EmptyTile) with the parallel message.
            if is_frag_start && frag_depth == 1 {
                frag_block_y_before = Some(y);
                frag_block_start_idx = Some(tile_idx);
            }

            tiles[tile_idx].set_y(y);

            let tile_h = tiles[tile_idx].preferred_height();
            match &tiles[tile_idx] {
                TeozTile::Communication { .. } | TeozTile::SelfMessage { .. } => {
                    prev_msg_height = Some(tile_h);
                    prev_msg_y = Some(y);
                    // Start a new parallel block (only at depth 0)
                    if frag_depth == 0 {
                        // Apply contact-point alignment for the previous block
                        apply_contact_point_alignment(&mut tiles, &parallel_block_tile_indices);
                        parallel_block_tile_indices.clear();
                        // Record this tile as the first in a new parallel block
                        parallel_block_tile_indices.push(tile_idx);
                        block_start_y = Some(y);
                        block_max_height = tile_h;
                    }
                }
                TeozTile::LifeEvent { .. } => {
                    // LifeEvent tiles don't break the message-note chain
                }
                TeozTile::FragmentEnd { .. } | TeozTile::GroupEnd { .. } if frag_depth == 0 => {
                    // Outermost fragment just closed. Set block_start_y to
                    // the FragmentStart y (after EmptyTile spacing) so that
                    // a subsequent parallel message can parallel with the
                    // entire GroupingTile equivalent.
                    if let Some(fby) = frag_block_y_before {
                        block_start_y = Some(fby);
                        block_max_height = y + tile_h - fby;
                    }
                    prev_msg_height = None;
                    prev_msg_y = None;
                }
                _ => {
                    prev_msg_height = None;
                    prev_msg_y = None;
                    if frag_depth == 0 {
                        apply_contact_point_alignment(&mut tiles, &parallel_block_tile_indices);
                        parallel_block_tile_indices.clear();
                        block_start_y = None;
                        block_max_height = 0.0;
                        frag_block_y_before = None;
                        frag_block_start_idx = None;
                    }
                }
            }
            y += tile_h;
        }
        tile_idx += 1;
    }
    // Apply contact-point alignment for the last parallel block
    apply_contact_point_alignment(&mut tiles, &parallel_block_tile_indices);
    let tiles_bottom = y;
    // Java: lifeline height = getPreferredHeight = finalY + 10 (bottom padding)
    // where finalY = startingY(8) + sum_tile_heights.
    // lifeline_bottom = lifeline_top + lifeline_height = lifeline_top + sum + 18
    // tiles_bottom = lifeline_top + 8 + sum, so lifeline_bottom = tiles_bottom + 10
    let mut lifeline_bottom = tiles_bottom + 10.0;

    // ── Step 7: Extract SeqLayout ────────────────────────────────────────
    // Java: SequenceDiagramFileMakerTeoz applies UTranslate(5,5) + dx(-min1).
    // min1 = PlayingSpace.getMinX() which includes all tile minX, group
    // margins, participant positions, and the origin.
    // SVG viewport width = (maxX - minX) + 10.
    //
    // Compute raw_min/raw_max in Real coordinate space, then derive x_offset.
    let origin_val = rl.get_value(xorigin);
    let mut raw_min = origin_val;
    let mut raw_max = origin_val;
    // Include participant posB, posD, and posC2 (posC + activation delta)
    for living in &livings {
        let b = rl.get_value(living.pos_b);
        let d = rl.get_value(living.pos_d);
        let c = rl.get_value(living.pos_c);
        if b < raw_min {
            raw_min = b;
        }
        if d > raw_max {
            raw_max = d;
        }
        // Java: PlayingSpace includes posC2 = posC + activation delta.
        // For now, posC is sufficient since we track activation in extents below.
        if c > raw_max {
            raw_max = c;
        }
    }
    // Include self-message and note extents in raw space.
    // Only include tiles OUTSIDE groups/fragments — tiles inside groups
    // contribute through the group expansion below.
    //
    // Uses the unified self_message_extent() helper for consistent geometry.
    {
        let mut outer_depth: usize = 0;
        for tile_i in 0..tiles.len() {
            let tile = &tiles[tile_i];
            match tile {
                TeozTile::GroupStart { .. } | TeozTile::FragmentStart { .. } => {
                    outer_depth += 1;
                }
                TeozTile::GroupEnd { .. } | TeozTile::FragmentEnd { .. } => {
                    outer_depth = outer_depth.saturating_sub(1);
                }
                _ if outer_depth > 0 => {
                    // Skip: will be handled by group expansion below
                }
                TeozTile::SelfMessage {
                    participant_idx,
                    text_width,
                    direction,
                    active_level,
                    ..
                } => {
                    let cx = rl.get_value(livings[*participant_idx].pos_c);
                    let comp_w = self_message_comp_width(*text_width, tp.msg_line_height);
                    let (sm_min, sm_max) =
                        self_message_extent(cx, comp_w, *active_level, direction);
                    if sm_min < raw_min {
                        raw_min = sm_min;
                    }
                    if sm_max > raw_max {
                        raw_max = sm_max;
                    }
                }
                TeozTile::Note {
                    participant_idx,
                    is_left,
                    width,
                    is_note_on_message,
                    active_level,
                    ..
                } => {
                    let cx = rl.get_value(livings[*participant_idx].pos_c);
                    // Java uses ComponentRoseNote.getPreferredWidth for extent,
                    // which includes 2*paddingX + deltaShadow beyond the drawn polygon width.
                    let extent_w = *width + NOTE_EXTENT_PADDING + sd.delta_shadow;
                    let level_offset = *active_level as f64 * 5.0;
                    if *is_note_on_message {
                        // Note attached to a self-message: use Java's
                        // CommunicationTileSelfNoteLeft/Right extent model.
                        // minX/maxX are derived from the self-message's extent.
                        if let Some((sm_pidx, sm_tw, sm_dir, sm_al)) =
                            find_preceding_self_message(&tiles, tile_i)
                        {
                            let sm_cx = rl.get_value(livings[sm_pidx].pos_c);
                            let sm_comp_w = self_message_comp_width(sm_tw, tp.msg_line_height);
                            let (sm_min, sm_max) =
                                self_message_extent(sm_cx, sm_comp_w, sm_al, &sm_dir);
                            if *is_left {
                                // Java CommunicationTileSelfNoteLeft.getMinX():
                                //   tile.getMinX() - notePreferredWidth
                                let left = sm_min - extent_w;
                                if left < raw_min {
                                    raw_min = left;
                                }
                                // maxX comes from the self-message
                                if sm_max > raw_max {
                                    raw_max = sm_max;
                                }
                            } else {
                                // Java CommunicationTileSelfNoteRight.getMaxX():
                                //   tile.getMaxX() + notePreferredWidth
                                let right = sm_max + extent_w;
                                if right > raw_max {
                                    raw_max = right;
                                }
                                // minX comes from the self-message
                                if sm_min < raw_min {
                                    raw_min = sm_min;
                                }
                            }
                        } else {
                            // Fallback: note on regular message, use cx + level_offset
                            if *is_left {
                                let left = cx - level_offset - extent_w;
                                if left < raw_min {
                                    raw_min = left;
                                }
                            } else {
                                let right = cx + level_offset + extent_w;
                                if right > raw_max {
                                    raw_max = right;
                                }
                            }
                        }
                    } else {
                        // Standalone note: cx + level_offset based extent
                        if *is_left {
                            let left = cx - level_offset - extent_w;
                            if left < raw_min {
                                raw_min = left;
                            }
                        } else {
                            let right = cx + level_offset + extent_w;
                            if right > raw_max {
                                raw_max = right;
                            }
                        }
                    }
                }
                TeozTile::NoteOver {
                    participants,
                    width,
                    ..
                } => {
                    // Java NoteTile.getMinX/getMaxX for OVER and OVER_SEVERAL
                    // positions contribute to PlayingSpace extent.
                    let preferred_w = *width + NOTE_EXTENT_PADDING + sd.delta_shadow;
                    if participants.len() >= 2 {
                        // OVER_SEVERAL: usedWidth = max(preferred, posD[last] - posB[first])
                        let idx0 = name_to_idx.get(&participants[0]).copied().unwrap_or(0);
                        let idx1 = name_to_idx
                            .get(participants.last().unwrap())
                            .copied()
                            .unwrap_or(0);
                        let pos_b_first = rl.get_value(livings[idx0].pos_b);
                        let pos_d_last = rl.get_value(livings[idx1].pos_d);
                        let span = pos_d_last - pos_b_first;
                        let used_w = preferred_w.max(span);
                        let cx1 = rl.get_value(livings[idx0].pos_c);
                        let cx2 = rl.get_value(livings[idx1].pos_c);
                        let mid = (cx1 + cx2) / 2.0;
                        let note_x = mid - used_w / 2.0;
                        let note_min = note_x.min(pos_b_first);
                        let note_max = (note_x + used_w).max(pos_d_last);
                        if note_min < raw_min {
                            raw_min = note_min;
                        }
                        if note_max > raw_max {
                            raw_max = note_max;
                        }
                    } else if participants.len() == 1 {
                        // OVER (single participant): centered on posC
                        let idx0 = name_to_idx.get(&participants[0]).copied().unwrap_or(0);
                        let cx = rl.get_value(livings[idx0].pos_c);
                        let note_min = cx - preferred_w / 2.0;
                        let note_max = cx + preferred_w / 2.0;
                        if note_min < raw_min {
                            raw_min = note_min;
                        }
                        if note_max > raw_max {
                            raw_max = note_max;
                        }
                    }
                }
                TeozTile::Communication {
                    is_short_gate: true,
                    from_name,
                    to_name,
                    from_idx,
                    to_idx,
                    text_width: tw,
                    ..
                } => {
                    // Short gate tiles contribute to extent via getMinX/getMaxX.
                    // Java: short gate from left (from=[) → FROM_RIGHT
                    //   minX = posC, maxX = posC + preferredWidth
                    // Java: short gate to right (to=]) → FROM_LEFT
                    //   minX = posC - preferredWidth, maxX = posC
                    let arrow_span = *tw + 24.0;
                    if from_name == "[" {
                        let cx = rl.get_value(livings[*to_idx].pos_c);
                        // FROM_RIGHT: extends to the right
                        let right = cx + arrow_span;
                        if right > raw_max {
                            raw_max = right;
                        }
                    } else if to_name == "]" {
                        let cx = rl.get_value(livings[*from_idx].pos_c);
                        // FROM_LEFT: extends to the left
                        let left = cx - arrow_span;
                        if left < raw_min {
                            raw_min = left;
                        }
                    }
                }
                _ => {}
            }
        }
    }
    // Apply group/fragment margin expansion using a recursive approach
    // matching Java's GroupingTile hierarchy.  Each group computes its own
    // internal min/max from children, adds MARGINX, then reports
    // getMinX = min - EXTERNAL_MARGINX1, getMaxX = max + EXTERNAL_MARGINX2.
    {
        /// Compute the (getMinX, getMaxX) of a group starting at `start` in
        /// the tile list, returning the index past the matching GroupEnd.
        fn compute_group_extent(
            tiles: &[TeozTile],
            start: usize,
            livings: &[LivingSpace],
            rl: &RealLine,
            tp: &TeozParams,
            delta_shadow: f64,
        ) -> (f64, f64, usize) {
            let mut group_min = f64::MAX;
            let mut group_max = f64::MIN;
            let mut else_labels: Vec<String> = Vec::new();
            let mut i = start;
            while i < tiles.len() {
                match &tiles[i] {
                    TeozTile::GroupStart { .. } | TeozTile::FragmentStart { .. } => {
                        // Recurse into nested group
                        let (child_min, child_max, next_i) =
                            compute_group_extent(tiles, i + 1, livings, rl, tp, delta_shadow);
                        // Child reports getMinX/getMaxX; add MARGINX for this level
                        let child_with_margin_min = child_min - GROUP_MARGINX;
                        let child_with_margin_max = child_max + GROUP_MARGINX;
                        if child_with_margin_min < group_min {
                            group_min = child_with_margin_min;
                        }
                        if child_with_margin_max > group_max {
                            group_max = child_with_margin_max;
                        }
                        i = next_i;
                        continue; // Skip i += 1 at the bottom of the loop
                    }
                    TeozTile::GroupEnd { .. } | TeozTile::FragmentEnd { .. } => {
                        // End of this group — return with external margins
                        if group_min == f64::MAX {
                            group_min = 0.0;
                        }
                        if group_max == f64::MIN {
                            group_max = 0.0;
                        }
                        // Java: else tiles contribute to maxX via
                        // ElseTile.getMaxX() = parent.getMinX() + elseWidth
                        // parent.getMinX() = group_min - EXTERNAL_MARGINX1
                        for label in &else_labels {
                            let bracket_label = format!("[{}]", label);
                            let pure_text_w = crate::font_metrics::text_width(
                                &bracket_label,
                                "sans-serif",
                                11.0,
                                true,
                                false,
                            );
                            let else_width = pure_text_w + 10.0; // marginX1(5) + marginX2(5)
                            let else_max = (group_min - GROUP_EXTERNAL_MARGINX1) + else_width;
                            if else_max > group_max {
                                group_max = else_max;
                            }
                        }
                        // Java: max2.add(this.min.addFixed(width + 16))
                        // where width = ComponentRoseGroupingHeader.getPreferredWidth()
                        // The parent FragmentStart/GroupStart is at start-1
                        if start > 0 {
                            let header_w_opt = match &tiles[start - 1] {
                                TeozTile::FragmentStart { kind, label, .. } => {
                                    Some(fragment_header_width(kind, label, "sans-serif", 13.0))
                                }
                                TeozTile::GroupStart { _label, .. } => _label.as_ref().map(|lbl| {
                                    fragment_header_width(
                                        &FragmentKind::Group,
                                        lbl,
                                        "sans-serif",
                                        13.0,
                                    )
                                }),
                                _ => None,
                            };
                            if let Some(header_w) = header_w_opt {
                                let header_max = group_min + header_w + 16.0;
                                if header_max > group_max {
                                    group_max = header_max;
                                }
                            }
                        }
                        return (
                            group_min - GROUP_EXTERNAL_MARGINX1,
                            group_max + GROUP_EXTERNAL_MARGINX2,
                            i + 1,
                        );
                    }
                    TeozTile::SelfMessage {
                        participant_idx,
                        text_width,
                        direction,
                        active_level,
                        ..
                    } => {
                        let cx = rl.get_value(livings[*participant_idx].pos_c);
                        let comp_w = self_message_comp_width(*text_width, tp.msg_line_height);
                        let (t_min, t_max) =
                            self_message_extent(cx, comp_w, *active_level, direction);
                        // Add MARGINX for this tile within the group
                        let child_min = t_min - GROUP_MARGINX;
                        let child_max = t_max + GROUP_MARGINX;
                        if child_min < group_min {
                            group_min = child_min;
                        }
                        if child_max > group_max {
                            group_max = child_max;
                        }
                    }
                    TeozTile::Communication {
                        from_idx, to_idx, ..
                    } => {
                        let from_x = rl.get_value(livings[*from_idx].pos_c);
                        let to_x = rl.get_value(livings[*to_idx].pos_c);
                        let child_min = f64::min(from_x, to_x) - GROUP_MARGINX;
                        let child_max = f64::max(from_x, to_x) + GROUP_MARGINX;
                        if child_min < group_min {
                            group_min = child_min;
                        }
                        if child_max > group_max {
                            group_max = child_max;
                        }
                    }
                    TeozTile::Note {
                        participant_idx,
                        is_left,
                        width,
                        is_note_on_message,
                        ..
                    } => {
                        let cx = rl.get_value(livings[*participant_idx].pos_c);
                        let extent_w = *width + NOTE_EXTENT_PADDING + delta_shadow;
                        let (t_min, t_max) = if *is_note_on_message {
                            // Note on self-message: use self-message extent
                            if let Some((sm_pidx, sm_tw, sm_dir, sm_al)) =
                                find_preceding_self_message(tiles, i)
                            {
                                let sm_cx = rl.get_value(livings[sm_pidx].pos_c);
                                let sm_comp_w = self_message_comp_width(sm_tw, tp.msg_line_height);
                                let (sm_min, sm_max) =
                                    self_message_extent(sm_cx, sm_comp_w, sm_al, &sm_dir);
                                if *is_left {
                                    (sm_min - extent_w, sm_max)
                                } else {
                                    (sm_min, sm_max + extent_w)
                                }
                            } else {
                                // Fallback
                                if *is_left {
                                    (cx - extent_w - 5.0, cx)
                                } else {
                                    (cx, cx + extent_w)
                                }
                            }
                        } else if *is_left {
                            (cx - extent_w - 5.0, cx)
                        } else {
                            (cx, cx + extent_w)
                        };
                        let child_min = t_min - GROUP_MARGINX;
                        let child_max = t_max + GROUP_MARGINX;
                        if child_min < group_min {
                            group_min = child_min;
                        }
                        if child_max > group_max {
                            group_max = child_max;
                        }
                    }

                    TeozTile::FragmentSeparator { label, .. } => {
                        // Java: else tiles contribute only to maxX, not to minX
                        // Collected and processed at the GroupEnd/FragmentEnd
                        else_labels.push(label.clone());
                    }
                    _ => {}
                }
                i += 1;
            }
            // Reached end without GroupEnd (malformed)
            if group_min == f64::MAX {
                group_min = 0.0;
            }
            if group_max == f64::MIN {
                group_max = 0.0;
            }
            (
                group_min - GROUP_EXTERNAL_MARGINX1,
                group_max + GROUP_EXTERNAL_MARGINX2,
                i,
            )
        }

        let mut i = 0;
        while i < tiles.len() {
            match &tiles[i] {
                TeozTile::GroupStart { .. } | TeozTile::FragmentStart { .. } => {
                    let (g_min, g_max, next_i) =
                        compute_group_extent(&tiles, i + 1, &livings, &rl, &tp, sd.delta_shadow);
                    if g_min < raw_min {
                        raw_min = g_min;
                    }
                    if g_max > raw_max {
                        raw_max = g_max;
                    }
                    i = next_i;
                }
                _ => {
                    i += 1;
                }
            }
        }
    }
    // Also ensure group/fragment header label width is accounted for.
    // Java GroupingTile:
    //   this.min = RealUtils.min(child.getMinX() - MARGINX)
    //   max2.add(this.min.addFixed(headerWidth + 16))
    //   getMaxX = this.max.addFixed(EXTERNAL_MARGINX2)
    // headerWidth = ComponentRoseGroupingHeader.getPreferredWidth
    //             = pureTextWidth + marginX1(15) + marginX2(30) = pureTextWidth + 45
    // Combined: getMaxX contribution = (this.min + pureTextWidth + 45 + 16) + 9
    //         = this.min + pureTextWidth + 70
    // Since raw_min = this.min - EXTERNAL_MARGINX1 = this.min - 3
    //   → this.min = raw_min + 3
    //   → contribution = raw_min + 3 + pureTextWidth + 70 = raw_min + pureTextWidth + 73
    {
        let mut group_depth: usize = 0;
        // Store (kind_label, condition_label) pairs for header width computation
        let mut header_entries: Vec<(&str, String)> = Vec::new();
        for tile in &tiles {
            match tile {
                TeozTile::GroupStart { _label, .. } => {
                    group_depth += 1;
                    if let Some(l) = _label {
                        header_entries.push(("group", l.clone()));
                    }
                }
                TeozTile::FragmentStart { kind, label, .. } => {
                    group_depth += 1;
                    header_entries.push((kind.label(), label.clone()));
                }
                TeozTile::GroupEnd { .. } | TeozTile::FragmentEnd { .. } => {
                    if group_depth == 1 {
                        for (kind_lbl, condition) in &header_entries {
                            let is_group = *kind_lbl == "group";
                            let header_width = if is_group {
                                // Group: display text is the condition, or "group" if empty
                                let display_text = if condition.is_empty() {
                                    "group"
                                } else {
                                    condition.as_str()
                                };
                                let text_w = font_metrics::text_width(
                                    display_text,
                                    default_font,
                                    msg_font_size,
                                    true,
                                    false,
                                );
                                text_w + 45.0
                            } else {
                                let kind_text_w = font_metrics::text_width(
                                    kind_lbl,
                                    default_font,
                                    msg_font_size,
                                    true,
                                    false,
                                );
                                if condition.is_empty() {
                                    kind_text_w + 45.0
                                } else {
                                    let bracket_label = format!("[{}]", condition);
                                    let comment_w = font_metrics::text_width(
                                        &bracket_label,
                                        default_font,
                                        11.0,
                                        true,
                                        false,
                                    );
                                    kind_text_w + 45.0 + 15.0 + comment_w
                                }
                            };
                            // Java: this.min + headerWidth + 16 + EXTERNAL_MARGINX2(9)
                            // this.min = raw_min + EXTERNAL_MARGINX1(3)
                            let header_max = raw_min
                                + GROUP_EXTERNAL_MARGINX1
                                + header_width
                                + 16.0
                                + GROUP_EXTERNAL_MARGINX2;
                            if header_max > raw_max {
                                raw_max = header_max;
                            }
                        }
                        header_entries.clear();
                    }
                    group_depth = group_depth.saturating_sub(1);
                }
                _ => {}
            }
        }
    }
    // Java: posC2 = posC + getMaxPosition() uses the GLOBAL max activation level,
    // not the per-message level. Our per-tile self_message_extent uses per-message
    // level which works for non-shadowed cases (comp_width dominates). When shadow
    // is active, the posC2 gap matters because (a) reverse self-messages have
    // maxX = posC2 without comp_width, and (b) notes extend from posC2.
    // Apply per-participant posC2 expansion to raw_max when shadow is present.
    if sd.delta_shadow > 0.0 {
        for living in &livings {
            let c = rl.get_value(living.pos_c);
            let gml = max_activation_levels
                .get(&living.name)
                .copied()
                .unwrap_or(0);
            let global_pos_c2 = c + active_right_shift(gml);
            // Direct posC2 contribution (Java: PlayingSpace adds posC2 to max2)
            if global_pos_c2 > raw_max {
                raw_max = global_pos_c2;
            }
        }
        // Also expand note-on-self-message extents that use posC2 as base.
        // The per-tile posC2 may be smaller than the global posC2.
        let mut outer_depth: usize = 0;
        for tile_i in 0..tiles.len() {
            match &tiles[tile_i] {
                TeozTile::GroupStart { .. } | TeozTile::FragmentStart { .. } => {
                    outer_depth += 1;
                }
                TeozTile::GroupEnd { .. } | TeozTile::FragmentEnd { .. } => {
                    outer_depth = outer_depth.saturating_sub(1);
                }
                _ if outer_depth > 0 => {}
                TeozTile::Note {
                    participant_idx: _,
                    is_left,
                    width,
                    is_note_on_message,
                    ..
                } if *is_note_on_message && !*is_left => {
                    // Right note on self-message: maxX = posC2_global + compWidth + noteWidth
                    if let Some((sm_pidx, sm_tw, sm_dir, _sm_al)) =
                        find_preceding_self_message(&tiles, tile_i)
                    {
                        let sm_cx = rl.get_value(livings[sm_pidx].pos_c);
                        let sm_comp_w = self_message_comp_width(sm_tw, tp.msg_line_height);
                        let gml = max_activation_levels
                            .get(&livings[sm_pidx].name)
                            .copied()
                            .unwrap_or(0);
                        // Recompute with global max level
                        let pos_c2_global = sm_cx + active_right_shift(gml);
                        let sm_max_global = match sm_dir {
                            SeqDirection::LeftToRight => pos_c2_global + sm_comp_w,
                            SeqDirection::RightToLeft => pos_c2_global,
                        };
                        let extent_w = *width + NOTE_EXTENT_PADDING + sd.delta_shadow;
                        let right = sm_max_global + extent_w;
                        if right > raw_max {
                            raw_max = right;
                        }
                    }
                }
                _ => {}
            }
        }
    }
    let min1 = raw_min;
    let x_offset = DOC_MARGIN_X - min1;
    log::debug!("teoz width: raw_min={raw_min:.4} raw_max={raw_max:.4} x_offset={x_offset:.4} diagram_w={:.4}", raw_max - raw_min);
    // Helper: get Real x value with document margin applied.
    let get_x = |id: RealId| -> f64 { rl.get_value(id) + x_offset };

    // Build ParticipantLayout from Real-resolved positions
    for (i, p) in sd.participants.iter().enumerate() {
        let center_x = get_x(livings[i].pos_c);
        part_layouts.push(ParticipantLayout {
            name: p.name.clone(),
            x: center_x,
            box_width: box_widths[i],
            box_height: box_heights[i],
            kind: p.kind.clone(),
            color: p.color.clone(),
            created: false,
            create_head_y: 0.0,
            lifeline_start_y: 0.0,
        });
    }

    // Extract messages, notes, etc. from tiles
    let mut messages: Vec<MessageLayout> = Vec::new();
    let mut activations: Vec<ActivationLayout> = Vec::new();
    let mut destroys: Vec<DestroyLayout> = Vec::new();
    let mut notes: Vec<NoteLayout> = Vec::new();
    let mut dividers: Vec<DividerLayout> = Vec::new();
    let mut delays: Vec<DelayLayout> = Vec::new();
    let mut refs: Vec<RefLayout> = Vec::new();
    let mut fragments: Vec<FragmentLayout> = Vec::new();
    // (y, kind, label, dividers, start_tile_idx, color)
    type FragmentStackEntry = (
        f64,
        FragmentKind,
        String,
        Vec<(f64, String)>,
        usize,
        Option<String>,
    );
    let mut fragment_stack: Vec<FragmentStackEntry> = Vec::new();
    let mut groups: Vec<GroupLayout> = Vec::new();
    let mut group_stack: Vec<(f64, Option<String>)> = Vec::new();

    // Diagram width is raw_max - raw_min (computed above with group expansion).
    // Rendered positions use get_x which adds x_offset, so differences are preserved.
    let diagram_width = raw_max - raw_min;
    let total_min_x = raw_min + x_offset; // = DOC_MARGIN_X = 5
    let total_max_x = raw_max + x_offset;
    log::debug!("teoz extents: raw_min={raw_min:.2} raw_max={raw_max:.2} diagram_width={diagram_width:.2} total_min_x={total_min_x:.2} total_max_x={total_max_x:.2}");

    // Java CommunicationExoTile border positions: boundary arrows extend from
    // the left/right diagram edges (border1/border2).
    // border1 = min(leftmost participant posB, all left-boundary arrow extents, xOrigin)
    // border2 = max(rightmost participant posD, all right-boundary arrow extents)
    let mut border1 = get_x(livings[0].pos_b);
    let mut border2 = get_x(livings[livings.len() - 1].pos_d);
    // Pre-scan boundary arrows to find min/max extents
    for tile in &tiles {
        if let TeozTile::Communication {
            from_name,
            to_name,
            to_idx,
            from_idx,
            text_width,
            is_short_gate,
            ..
        } = tile
        {
            if *is_short_gate {
                continue;
            }
            let arrow_span = text_width + 24.0;
            if from_name == "[" {
                // Left boundary: from_x = target_posC - arrow_span
                let target_x = get_x(livings[*to_idx].pos_c);
                let fx = target_x - arrow_span;
                if fx < border1 {
                    border1 = fx;
                }
            }
            if to_name == "]" {
                // Right boundary: to_x = source_posC + arrow_span
                let source_x = get_x(livings[*from_idx].pos_c);
                let tx = source_x + arrow_span;
                if tx > border2 {
                    border2 = tx;
                }
            }
        }
    }
    log::debug!("teoz borders: border1={border1:.4} border2={border2:.4}");

    // Track activation state for ActivationLayout generation
    // Track the most recent message index for note-on-message association.
    let mut last_msg_idx: Option<usize> = None;

    for tile_i in 0..tiles.len() {
        let tile = &tiles[tile_i];
        match tile {
            TeozTile::Communication {
                from_name,
                to_name,
                from_idx,
                to_idx,
                text,
                text_lines,
                is_dashed,
                has_open_head,
                arrow_head,
                text_width,
                y,
                height,
                autonumber,
                circle_from,
                circle_to,
                cross_from,
                cross_to,
                from_level,
                to_level,
                hidden,
                bidirectional,
                is_short_gate,
                gate_right_border,
                color,
                ..
            } => {
                if *hidden {
                    continue;
                }
                let ty = y.unwrap_or(0.0);
                // Java: tile y = tile top. Arrow y = tile_top + arrowY.
                // arrowY = textHeight + paddingY = (height - ARROW_DELTA_Y - ARROW_PADDING_Y)
                let arrow_y = ty + (height - rose::ARROW_DELTA_Y - rose::ARROW_PADDING_Y);
                let raw_from_x = get_x(livings[*from_idx].pos_c);
                let raw_to_x = get_x(livings[*to_idx].pos_c);

                // Gate/lost/found messages: virtual endpoint is near the
                // real participant, computed from arrow preferred width.
                // Java: CommunicationTile uses getPreferredWidth() which is
                // text_width + ARROW_DELTA_X(10) + 2*paddingY(7) + inset(2).
                let is_gate_from = from_name == "[";
                let is_gate_to = to_name == "]";

                let (from_x, to_x, is_left, text_delta_x) =
                    if (is_gate_from || is_gate_to) && !*is_short_gate {
                        // Full boundary arrows ([->  ->]) extend to diagram edges.
                        // Java CommunicationExoTile with !isShortArrow():
                        // border1 = leftmost participant posB (head box left edge)
                        // border2 = rightmost participant posD (head box right edge)
                        //
                        // For left boundary [->:
                        //   from_x = border1, to_x = participant center
                        //   text is positioned relative to the computed arrow span,
                        //   not from border1, so text_delta_x adjusts it.
                        //
                        // For right boundary ->]:
                        //   from_x = participant center, to_x = border2
                        //   text is relative to from_x (unchanged), no delta needed.
                        //
                        // Java CommunicationExoTile also adjusts x1/x2 for circle
                        // decorations at boundary edges (diamCircle/2 + 2 = 6).
                        const CIRCLE_BOUNDARY_SHIFT: f64 = 6.0; // diamCircle/2 + thinCircle + 0.5

                        if is_gate_to {
                            // Right boundary (->]): arrow extends to the right diagram edge
                            // Java: x1 += LIVE_DELTA_SIZE * level
                            let mut fx = raw_from_x;
                            fx += 5.0 * (*from_level as f64);
                            let mut tx = border2;
                            // Java: decoration2==CIRCLE && TO_RIGHT → x2 -= 6
                            if *circle_to {
                                tx -= CIRCLE_BOUNDARY_SHIFT;
                            }
                            (fx, tx, false, 0.0)
                        } else {
                            // Left boundary ([->): arrow extends from the left diagram edge
                            // Java: x2 += LIVE_DELTA_SIZE * (level - 2)
                            let mut tx = raw_to_x;
                            if *to_level > 0 {
                                tx += 5.0 * (*to_level as f64 - 2.0);
                            }
                            // Java CommunicationExoTile: textDeltaX is computed BEFORE
                            // circle adjustment, then x1 is shifted for circle.
                            let arrow_span = text_width + 24.0;
                            let computed_fx = tx - arrow_span;
                            let delta = computed_fx - border1;
                            let mut fx = border1;
                            // Java: decoration1==CIRCLE && FROM_LEFT → x1 += 6
                            if *circle_from {
                                fx += CIRCLE_BOUNDARY_SHIFT;
                            }
                            (fx, tx, false, delta)
                        }
                    } else if (is_gate_from || is_gate_to) && *is_short_gate {
                        // Short gate arrows (?-> ->?) use text-width-based span,
                        // NOT extending to diagram edges.
                        let arrow_span = text_width + 24.0;
                        if *gate_right_border {
                            // Java FROM_RIGHT: gate extends to the RIGHT of participant.
                            // The real participant is "to" (after parser swap).
                            // Java CommunicationExoTile drawU():
                            //   x1 = posC + LIVE_DELTA_SIZE * level
                            //   x2 = posC + preferredWidth
                            //   if decoration1==CIRCLE && FROM_RIGHT: x2 -= diamCircle/2 + 2
                            const LIVE_DELTA: f64 = 5.0;
                            let tx = raw_to_x + LIVE_DELTA * (*to_level as f64);
                            let circle_adj = if *circle_from { 6.0 } else { 0.0 };
                            let fx = raw_to_x + arrow_span - circle_adj;
                            (fx, tx, true, 0.0)
                        } else if is_gate_to {
                            let fx = raw_from_x;
                            let tx = fx + arrow_span;
                            (fx, tx, false, 0.0)
                        } else {
                            let tx = raw_to_x;
                            let fx = tx - arrow_span;
                            (fx, tx, false, 0.0)
                        }
                    } else {
                        let is_left = raw_to_x < raw_from_x;
                        // Java CommunicationTile.drawU(): adjust x positions
                        // based on activation levels (LIVE_DELTA_SIZE = 5).
                        const LIVE_DELTA: f64 = 5.0;
                        if is_left {
                            // Reverse direction (right-to-left)
                            let mut x1 = raw_from_x;
                            let level1 = *from_level;
                            if level1 == 1 {
                                x1 -= LIVE_DELTA;
                            } else if level1 > 2 {
                                x1 += LIVE_DELTA * (level1 as f64 - 2.0);
                            }
                            let x2 = raw_to_x + LIVE_DELTA * (*to_level as f64);
                            (x1, x2, true, 0.0)
                        } else {
                            // Normal direction (left-to-right)
                            let x1 = raw_from_x + LIVE_DELTA * (*from_level as f64);
                            let mut adjusted_tl = *to_level as i64;
                            if adjusted_tl > 0 {
                                adjusted_tl -= 2;
                            }
                            let x2 = raw_to_x + LIVE_DELTA * (adjusted_tl as f64);
                            (x1, x2, false, 0.0)
                        }
                    };
                messages.push(MessageLayout {
                    from_x,
                    to_x,
                    y: arrow_y,
                    text: text.clone(),
                    text_lines: text_lines.clone(),
                    is_self: false,
                    is_dashed: *is_dashed,
                    is_left,
                    has_open_head: *has_open_head,
                    arrow_head: arrow_head.clone(),
                    autonumber: autonumber.clone(),
                    source_line: None, // TODO: propagate from parser
                    self_return_x: from_x,
                    self_center_x: from_x,
                    color: color.clone(),
                    circle_from: *circle_from,
                    circle_to: *circle_to,
                    cross_from: *cross_from,
                    cross_to: *cross_to,
                    bidirectional: *bidirectional,
                    is_create: false,
                    text_delta_x,
                    active_level: 0,
                    delta_x1: 0.0,
                });
                last_msg_idx = Some(messages.len() - 1);
            }
            TeozTile::SelfMessage {
                participant_idx,
                text,
                text_lines,
                text_width,
                is_dashed,
                has_open_head,
                arrow_head,
                y,
                autonumber,
                direction,
                active_level,
                delta_x1,
                circle_from,
                circle_to,
                cross_from,
                cross_to,
                hidden,
                bidirectional,
                color,
                ..
            } => {
                if *hidden {
                    continue;
                }
                let ty = y.unwrap_or(0.0);
                let cx = get_x(livings[*participant_idx].pos_c);
                let is_left = !*bidirectional && *direction == SeqDirection::RightToLeft;
                let has_bar = *active_level > 0;

                // Java: CommunicationTileSelf.drawU() uses
                //   getStartingY() + comp.getYPoint(stringBounder)
                // where getYPoint = self_arrow_start_point().y = text_h + ARROW_PADDING_Y
                let self_text_h = tp.msg_line_height * text_lines.len().max(1) as f64;
                let self_tm = TextMetrics::new(7.0, 7.0, 1.0, *text_width, self_text_h);
                let self_y_offset = rose::self_arrow_start_point(&self_tm).y;

                // Compute self-message from_x/to_x/return_x accounting for
                // activation bar, matching Java's CommunicationTileSelf.drawU().
                //
                // Right side: Java shifts origin by level * LIVE_DELTA_SIZE.
                // Left side: leftShift is always ACTIVATION_WIDTH/2 (5) when active;
                //   level-based adjustments for lines/decorations are applied in the renderer.
                let al = *active_level;
                let (self_from_x, self_return_x, self_to_x) = if is_left {
                    let act_left = if has_bar {
                        cx - ACTIVATION_WIDTH / 2.0
                    } else {
                        cx
                    };
                    let outgoing_x = if has_bar { act_left } else { cx };
                    let ret_x = act_left - 1.0;
                    let to = act_left - SELF_MSG_WIDTH;
                    (outgoing_x, ret_x, to)
                } else {
                    // Java: x1 = posC + LIVE_DELTA_SIZE * level
                    let act_right = if has_bar {
                        cx + active_right_shift(al)
                    } else {
                        cx
                    };
                    let outgoing_x = if has_bar { act_right } else { cx };
                    let ret_x = act_right + 1.0;
                    let to = act_right + SELF_MSG_WIDTH;
                    (outgoing_x, ret_x, to)
                };

                messages.push(MessageLayout {
                    from_x: self_from_x,
                    to_x: self_to_x,
                    y: ty + self_y_offset,
                    text: text.clone(),
                    text_lines: text_lines.clone(),
                    is_self: true,
                    is_dashed: *is_dashed,
                    is_left,
                    has_open_head: *has_open_head,
                    arrow_head: arrow_head.clone(),
                    autonumber: autonumber.clone(),
                    source_line: None, // TODO: propagate from parser
                    self_return_x,
                    self_center_x: cx,
                    color: color.clone(),
                    circle_from: *circle_from,
                    circle_to: *circle_to,
                    cross_from: *cross_from,
                    cross_to: *cross_to,
                    bidirectional: *bidirectional,
                    is_create: false,
                    text_delta_x: 0.0,
                    active_level: *active_level,
                    delta_x1: *delta_x1,
                });
                last_msg_idx = Some(messages.len() - 1);
            }
            TeozTile::Note {
                participant_idx,
                text,
                is_left,
                width,
                height: _,
                y,
                is_note_on_message,
                active_level,
                color,
                ..
            } => {
                // Java AbstractComponent.drawU applies UTranslate(paddingX, paddingY)
                // before rendering the note polygon. For notes, Rose.paddingY = 5.
                // The tile y is the tile top; the polygon starts paddingY below it.
                let ty = y.unwrap_or(0.0) + 5.0;
                let cx = get_x(livings[*participant_idx].pos_c);
                // Java CommunicationTileNoteRight.getNotePosition:
                //   posC + level * LIVE_DELTA_SIZE (= 5)
                let level_offset = *active_level as f64 * 5.0;
                let nx = if *is_note_on_message {
                    // Note on self-message: match Java CommunicationTileSelfNote{Left,Right}.
                    //
                    // Java note position formula (after AbstractComponent.drawU adds paddingX=5):
                    //   Left:  tile.getMinX() - notePreferredWidth + paddingX(5)
                    //   Right: tile.getMaxX() + paddingX(5)
                    //
                    // tile.getMinX/getMaxX depend on isReverseDefine (arrow direction):
                    //   RightToLeft (reverseDefine=true):
                    //     minX = posC - compWidth - liveDeltaAdj
                    //     maxX = posC2_global  (posC + 5*globalMaxLevel)
                    //   LeftToRight (reverseDefine=false):
                    //     minX = posC
                    //     maxX = posC2_global + compWidth
                    //
                    // notePreferredWidth = textWidth + 2*paddingX(5) + deltaShadow
                    //                    = note_width + 10 + deltaShadow
                    if let Some((sm_pidx, sm_tw, sm_dir, sm_al)) =
                        find_preceding_self_message(&tiles, tile_i)
                    {
                        let sm_comp_w = self_message_comp_width(sm_tw, tp.msg_line_height);
                        let sm_cx = get_x(livings[sm_pidx].pos_c);
                        let gml = max_activation_levels
                            .get(&livings[sm_pidx].name)
                            .copied()
                            .unwrap_or(0);
                        let pos_c2_global = sm_cx + active_right_shift(gml);
                        let live_delta_adj = if sm_al > 0 { 5.0 } else { 0.0 };
                        let note_preferred_w = *width + 10.0 + sd.delta_shadow;
                        let padding_x = 5.0;

                        match (&sm_dir, is_left) {
                            (SeqDirection::RightToLeft, true) => {
                                // tile.getMinX() = posC - compWidth - liveDeltaAdj
                                let tile_min_x = sm_cx - sm_comp_w - live_delta_adj;
                                tile_min_x - note_preferred_w + padding_x
                            }
                            (SeqDirection::RightToLeft, false) => {
                                // tile.getMaxX() = posC2_global
                                pos_c2_global + padding_x
                            }
                            (SeqDirection::LeftToRight, true) => {
                                // tile.getMinX() = posC
                                sm_cx - note_preferred_w + padding_x
                            }
                            (SeqDirection::LeftToRight, false) => {
                                // tile.getMaxX() = posC2_global + compWidth
                                pos_c2_global + sm_comp_w + padding_x
                            }
                        }
                    } else {
                        // Note on regular message: shift by activation level
                        if *is_left {
                            cx - level_offset - *width - 5.0
                        } else {
                            cx + level_offset + 5.0
                        }
                    }
                } else if *is_left {
                    cx - level_offset - *width - 5.0
                } else {
                    cx + level_offset + 5.0
                };
                // Use drawn polygon height for SVG rendering, not the
                // preferred tile height which includes 2*paddingY extra.
                let drawn_h = estimate_note_height(text);
                notes.push(NoteLayout {
                    x: nx,
                    y: ty,
                    width: *width,
                    layout_width: *width + 10.0,
                    height: drawn_h,
                    text: text.clone(),
                    is_left: *is_left,
                    is_self_msg_note: *is_note_on_message,
                    is_note_on_message: *is_note_on_message,
                    assoc_message_idx: if *is_note_on_message {
                        last_msg_idx
                    } else {
                        None
                    },
                    teoz_mode: true,
                    color: color.clone(),
                });
            }
            TeozTile::NoteOver {
                participants,
                text,
                width,
                height: _,
                y,
            } => {
                // Same paddingY offset as Note (see above).
                let ty = y.unwrap_or(0.0) + 5.0;
                // Center the note between the first and last referenced participant
                let (left_x, right_x) = if participants.len() >= 2 {
                    let idx0 = name_to_idx.get(&participants[0]).copied().unwrap_or(0);
                    let idx1 = name_to_idx
                        .get(participants.last().unwrap())
                        .copied()
                        .unwrap_or(0);
                    (get_x(livings[idx0].pos_c), get_x(livings[idx1].pos_c))
                } else if participants.len() == 1 {
                    let idx0 = name_to_idx.get(&participants[0]).copied().unwrap_or(0);
                    let cx = get_x(livings[idx0].pos_c);
                    (cx - *width / 2.0, cx + *width / 2.0)
                } else {
                    (total_min_x, total_max_x)
                };
                let center = (left_x + right_x) / 2.0;
                let drawn_h = estimate_note_height(text);
                notes.push(NoteLayout {
                    x: center - *width / 2.0,
                    y: ty,
                    width: *width,
                    layout_width: *width + 10.0,
                    height: drawn_h,
                    text: text.clone(),
                    is_left: false,
                    is_self_msg_note: false,
                    is_note_on_message: false,
                    assoc_message_idx: None,
                    teoz_mode: true,
                    color: None,
                });
            }
            TeozTile::Divider { text, height, y } => {
                let ty = y.unwrap_or(0.0);
                dividers.push(DividerLayout {
                    y: ty,
                    x: total_min_x,
                    width: diagram_width,
                    text: text.clone(),
                    height: *height,
                    component_y: ty,
                });
            }
            TeozTile::Delay { text, height, y } => {
                let ty = y.unwrap_or(0.0);
                delays.push(DelayLayout {
                    y: ty,
                    height: *height,
                    x: total_min_x,
                    width: diagram_width,
                    text: text.clone(),
                    lifeline_break_y: ty,
                });
            }
            TeozTile::Ref {
                participants,
                label,
                height,
                y,
            } => {
                let ty = y.unwrap_or(0.0);
                let (rx, rw) = if participants.is_empty() {
                    (total_min_x, diagram_width)
                } else {
                    let idxs: Vec<usize> = participants
                        .iter()
                        .filter_map(|p| name_to_idx.get(p).copied())
                        .collect();
                    if idxs.is_empty() {
                        (total_min_x, diagram_width)
                    } else {
                        let min_idx = *idxs.iter().min().unwrap();
                        let max_idx = *idxs.iter().max().unwrap();
                        let lx = get_x(livings[min_idx].pos_b);
                        let rx = get_x(livings[max_idx].pos_d);
                        (lx, rx - lx)
                    }
                };
                refs.push(RefLayout {
                    x: rx,
                    y: ty,
                    width: rw,
                    height: *height,
                    label: label.clone(),
                });
            }
            TeozTile::FragmentStart {
                kind,
                label,
                y,
                color,
                ..
            } => {
                let ty = y.unwrap_or(0.0);
                fragment_stack.push((
                    ty,
                    kind.clone(),
                    label.clone(),
                    Vec::new(),
                    tile_i + 1,
                    color.clone(),
                ));
            }
            TeozTile::FragmentSeparator { label, y, .. } => {
                let ty = y.unwrap_or(0.0);
                if let Some(entry) = fragment_stack.last_mut() {
                    entry.3.push((ty, label.clone()));
                }
            }
            TeozTile::FragmentEnd { y, .. } => {
                let ty = y.unwrap_or(0.0);
                if let Some((y_start, kind, label, separators, child_start, frag_color)) =
                    fragment_stack.pop()
                {
                    let _depth = fragment_stack.len(); // 0 for outermost
                                                       // Compute per-fragment width from child tiles.
                                                       // Java GroupingTile computes its own min/max from children.
                    let (frag_min, frag_max) = compute_fragment_extent(
                        &tiles,
                        child_start,
                        tile_i,
                        &livings,
                        &rl,
                        &tp,
                        sd.delta_shadow,
                    );
                    // Java: ComponentRoseGroupingHeader.getPreferredWidth():
                    //   getTextWidth() = pureTextW(kindLabel) + marginX1(15) + marginX2(30)
                    //   if condition label present:
                    //     sup = marginX1(15) + commentMargin(0) + commentTextWidth
                    //     commentText = "[condition]" at 11pt bold
                    //   else: sup = 0
                    //   width = getTextWidth() + sup
                    // Java GroupingTile: max candidate = this.min + width + 16
                    let header_width =
                        fragment_header_width(&kind, &label, default_font, msg_font_size);
                    let header_right = frag_min + header_width + 16.0;
                    let effective_max = frag_max.max(header_right);
                    // Convert to document coordinates
                    let frag_x = frag_min + x_offset;
                    let frag_width = effective_max - frag_min;
                    // The tile y includes FRAG_BOTTOM_PADDING (10px) which is
                    // spacing below the frame rect, not part of the frame itself.
                    let frame_height = ty - y_start - FRAG_BOTTOM_PADDING;
                    // Find the first message tile index within this fragment.
                    // Count message tiles before child_start to get the message index.
                    let first_msg_idx = {
                        let mut msg_count_before = 0;
                        let mut found = None;
                        #[allow(clippy::needless_range_loop)]
                        for ti in 0..tiles.len() {
                            let is_msg = matches!(
                                tiles[ti],
                                TeozTile::Communication { .. } | TeozTile::SelfMessage { .. }
                            );
                            if ti >= child_start && ti < tile_i && is_msg && found.is_none() {
                                found = Some(msg_count_before);
                            }
                            if is_msg && ti < child_start {
                                msg_count_before += 1;
                            }
                            if is_msg && ti >= child_start && ti < tile_i && found.is_some() {
                                break;
                            }
                        }
                        found
                    };
                    fragments.push(FragmentLayout {
                        kind,
                        label,
                        x: frag_x,
                        y: y_start,
                        width: frag_width,
                        height: frame_height,
                        separators,
                        first_msg_index: first_msg_idx,
                        color: frag_color,
                    });
                }
            }
            TeozTile::GroupStart { _label, y, .. } => {
                let ty = y.unwrap_or(0.0);
                group_stack.push((ty, _label.clone()));
            }
            TeozTile::GroupEnd { y, .. } => {
                let ty = y.unwrap_or(0.0);
                if let Some((y_start, label)) = group_stack.pop() {
                    // Java GroupingTile: drawU uses min (not min-EXTERNAL_MARGINX1)
                    let depth = group_stack.len();
                    let inset_left = GROUP_EXTERNAL_MARGINX1 * (depth + 1) as f64;
                    let inset_right = GROUP_EXTERNAL_MARGINX2 * (depth + 1) as f64;
                    groups.push(GroupLayout {
                        x: total_min_x + inset_left,
                        y_start,
                        y_end: ty,
                        width: diagram_width - inset_left - inset_right,
                        label,
                    });
                } else {
                    log::warn!("GroupEnd without matching GroupStart");
                }
            }
            _ => {}
        }
    }

    // Build activation bars from the event stream.
    // Re-scan events to track activate/deactivate pairs.
    //
    // Java LiveBoxes: each tile records a "step" y for the living spaces:
    // - CommunicationTile records step at tile_top + arrowY (= arrow y position)
    // - LifeEventTile records step at tile_top
    // Activation bars span from the step-y of the activate event to the step-y
    // of the deactivate event.
    {
        // act_state: per-participant stack of active levels.
        // Each entry: (y_start_stairs, y_start_addstep, level, color)
        // y_start_stairs = position used in getStairs (message arrowY)
        // y_start_addstep = position used in addStep collision check
        //   (arrowY for first-message inline, msg_bottom for parallel-message inline)
        // (y_start_stairs, y_start_addstep, level, color)
        type ActEntry = (f64, f64, usize, Option<String>);
        let mut act_state: HashMap<String, Vec<ActEntry>> = HashMap::new();
        let mut tile_idx = 0;
        let lifeline_top = STARTING_Y + max_preferred_height;
        let mut last_step_y: f64 = lifeline_top + PLAYINGSPACE_STARTING_Y;
        let mut last_msg_bottom_y: f64 = lifeline_top + PLAYINGSPACE_STARTING_Y;
        // Map from event_idx → (arrow_y, p1, p2) for each Message event so
        // LifeEvents can look up their owning message's arrow position.
        let mut msg_arrow_y_by_event: HashMap<usize, (f64, String, String)> = HashMap::new();
        // For self-message tiles, Java uses p2.y (end point) for activate events
        // and p1.y (start point) for deactivate events. Track the end point
        // separately so inline activates after self-messages get the correct y.
        let mut last_step_y_self_end: Option<f64> = None;
        // Java getStairs: msg step gets indent from getLevelAt peek-ahead.
        // If a future standalone activate raises the level, the msg step
        // has higher indent and the activation box starts at msg arrowY.
        let mut msg_claims_activate: HashMap<String, f64> = HashMap::new();

        // Per-participant tracking that mirrors Java LiveBoxes.getStairs state:
        // - msg_arrow_y: the arrow_y of the most recent Communication that this
        //   participant was involved in (the "lastMessage" position).
        // - seen_act / seen_deact: whether an activate / deactivate LifeEvent
        //   attached to that message has already been seen for this participant.
        //
        // Java's getStairs keeps the stair `position` pointing at the last
        // message's arrow_y until the (deactivate && seenAct) or (activate &&
        // seenDeact) condition flips it to the LifeEvent's own potentialPosition.
        #[derive(Default, Clone)]
        struct LifeEventScope {
            msg_arrow_y: Option<f64>,
            seen_act: bool,
            seen_deact: bool,
            // Java LiveBoxes.eventsStep tracks every addStep call's y per
            // participant. The +5 collision bump fires when a deactivate's
            // step y matches a previously seen activate y. Track the most
            // recent activate's tile_y so we can replicate the bump.
            last_act_tile_y: Option<f64>,
        }
        let mut le_scope: HashMap<String, LifeEventScope> = HashMap::new();

        // Java SequenceDiagram.activate auto-attaches every LifeEvent to the
        // most recent message added (lastEventWithDeactivate). For each
        // LifeEvent (inline or standalone) compute the owning message index.
        // - Inline LifeEvents: owned by the message they were parsed with
        //   (the previous Message in the events list).
        // - Standalone LifeEvents: owned by the most recent Message in the
        //   events list at parse time, regardless of intervening notes/etc.
        // Both reduce to "most recent SeqEvent::Message before this index".
        let _life_event_owner_msg: Vec<Option<usize>> = {
            let mut owner = vec![None; sd.events.len()];
            let mut last_msg: Option<usize> = None;
            for (i, ev) in sd.events.iter().enumerate() {
                match ev {
                    SeqEvent::Message(_) => {
                        last_msg = Some(i);
                    }
                    SeqEvent::Activate(..) | SeqEvent::Deactivate(_) | SeqEvent::Destroy(_) => {
                        owner[i] = last_msg;
                    }
                    _ => {}
                }
            }
            owner
        };

        // Pre-compute which events are "inside TileParallel first message".
        // In Java, when a non-parallel message is followed (after inline events)
        // by a parallel `&` message, mergeParallel puts the first message + its
        // inline LifeEvents inside a TileParallel. Contact point adjustment
        // positions those LifeEvents at arrowY instead of msg_bottom.
        // For all other cases (no following parallel, or events from the
        // parallel message itself), addStep y = msg_bottom.
        let inside_tile_parallel: Vec<bool> = {
            let mut result = vec![false; sd.events.len()];
            let mut last_msg_idx: Option<usize> = None;
            let mut inline_indices: Vec<usize> = Vec::new();
            for (i, ev) in sd.events.iter().enumerate() {
                match ev {
                    SeqEvent::Message(m) => {
                        if m.parallel {
                            // The previous message + its inline events are inside TileParallel
                            if let Some(_msg_idx) = last_msg_idx {
                                for &idx in &inline_indices {
                                    result[idx] = true;
                                }
                            }
                        }
                        last_msg_idx = Some(i);
                        inline_indices.clear();
                    }
                    SeqEvent::Activate(..) | SeqEvent::Deactivate(_) | SeqEvent::Destroy(_) => {
                        if last_msg_idx.is_some() {
                            inline_indices.push(i);
                        }
                    }
                    _ => {
                        last_msg_idx = None;
                        inline_indices.clear();
                    }
                }
            }
            result
        };
        for (event_idx, event) in sd.events.iter().enumerate() {
            // AutoNumber events don't produce tiles — skip tile_idx update.
            if matches!(event, SeqEvent::AutoNumber { .. }) {
                continue;
            }

            // Update last_step_y when we see a tile
            if let Some(tile) = tiles.get(tile_idx) {
                match tile {
                    TeozTile::Communication { height, y, .. } => {
                        let ty = y.unwrap_or(0.0);
                        // Step y = tile_top + arrowY = tile_top + (height - 8)
                        last_step_y = ty + (height - rose::ARROW_DELTA_Y - rose::ARROW_PADDING_Y);
                        last_msg_bottom_y = ty + height;
                        last_step_y_self_end = None;
                    }
                    TeozTile::SelfMessage {
                        height,
                        y,
                        text_lines,
                        ..
                    } => {
                        let ty = y.unwrap_or(0.0);
                        // Java: when text is a single empty string, TextBlockEmpty gives height 0.
                        let is_text_empty = text_lines.len() == 1 && text_lines[0].is_empty();
                        let self_text_h = if is_text_empty {
                            0.0
                        } else {
                            tp.msg_line_height * text_lines.len().max(1) as f64
                        };
                        let self_tm = TextMetrics::new(7.0, 7.0, 1.0, 0.0, self_text_h);
                        // Java CommunicationTileSelf.callbackY_internal:
                        //   activate → addStep(y + p2.y) (end point)
                        //   deactivate → addStep(y + p1.y) (start point)
                        last_step_y = ty + rose::self_arrow_start_point(&self_tm).y;
                        last_step_y_self_end = Some(ty + rose::self_arrow_end_point(&self_tm).y);
                        last_msg_bottom_y = ty + height;
                    }
                    TeozTile::LifeEvent { .. } => {
                        // Inline LifeEvents use the message's step_y (already
                        // set by the preceding Communication). We don't update
                        // last_step_y here.
                    }
                    _ => {}
                }
            }

            // Mirror Java LiveBoxes.getStairs per-participant state machine.
            // Java iterates ALL events: when an AbstractMessage is encountered
            // it resets seenActivate/seenDeactivate for the current participant
            // and updates lastMessage; if the message involves the participant,
            // the participant's `position` becomes the message's arrow_y.
            // Otherwise the participant's `position` becomes null (potentialPosition is null).
            //
            // Java also resets lastMessage and seen state when a Note event
            // is encountered (any kind of standalone note, not message-attached).
            //
            // We track only the bits we need: msg_arrow_y (last message arrow_y
            // when this participant was involved, or None if msg doesn't involve
            // them) and seen_act/seen_deact since the last message.
            match event {
                SeqEvent::Message(msg) => {
                    let arrow_y = last_step_y;
                    let msg_self = msg.from == msg.to;
                    msg_arrow_y_by_event
                        .insert(event_idx, (arrow_y, msg.from.clone(), msg.to.clone()));
                    // For self messages, Java's CommunicationTileSelf only
                    // calls addStepForLivebox on livingSpace1 (the source).
                    // Other participants get their msg_arrow_y cleared.
                    for entry in le_scope.values_mut() {
                        entry.seen_act = false;
                        entry.seen_deact = false;
                        entry.msg_arrow_y = None;
                    }
                    let part1 = le_scope.entry(msg.from.clone()).or_default();
                    part1.msg_arrow_y = Some(arrow_y);
                    if !msg_self {
                        let part2 = le_scope.entry(msg.to.clone()).or_default();
                        part2.msg_arrow_y = Some(arrow_y);
                    }
                }
                SeqEvent::NoteOver { .. }
                | SeqEvent::NoteLeft { .. }
                | SeqEvent::NoteRight { .. } => {
                    // Java getStairs: a standalone Note resets lastMessage
                    // and seen flags, forcing position to null for any
                    // subsequent LifeEvent.
                    for entry in le_scope.values_mut() {
                        entry.seen_act = false;
                        entry.seen_deact = false;
                        entry.msg_arrow_y = None;
                    }
                }
                _ => {}
            }

            // Peek-ahead: if standalone activate for msg sender/receiver
            // occurs before next message, msg "claims" the activation start.
            if let SeqEvent::Message(msg) = event {
                for check_name in [&msg.from, &msg.to] {
                    let mut found = false;
                    for (fi, future) in sd.events[(event_idx + 1)..].iter().enumerate() {
                        let abs_idx = event_idx + 1 + fi;
                        match future {
                            SeqEvent::Activate(n, _)
                                if n == check_name && !sd.inline_life_events.contains(&abs_idx) =>
                            {
                                found = true;
                                break;
                            }
                            SeqEvent::Message(_) => break,
                            _ => {}
                        }
                    }
                    if found {
                        msg_claims_activate.insert(check_name.clone(), last_step_y);
                    }
                }
            }

            match event {
                SeqEvent::Activate(name, act_color) => {
                    let is_inline = sd.inline_life_events.contains(&event_idx);
                    // Java SequenceDiagram.activate auto-attaches every
                    // activate to the previous message via lifeEvent.setMessage.
                    // LiveBoxes.getStairs then keeps the stair `position` at
                    // that message's arrow_y unless this LifeEvent's pair has
                    // already seen its complement: when a deactivate has been
                    // seen first for the same message scope, an activate gets
                    // the LifeEvent's own potentialPosition (= tile_y). Also
                    // when the prior message in the iteration did not involve
                    // this participant Java's `position` is null and the
                    // LifeEvent's tile_y is used directly.
                    //
                    // The "owning message" of a LifeEvent (Java
                    // lifeEvent.getMessage()) is the most recent message at
                    // parse time, even if there are intervening notes. The
                    // owner determines the bar's anchor when this LifeEvent
                    // is the first activate of its scope.
                    let scope = le_scope.entry(name.clone()).or_default();
                    // If a previous message in the events list peek-ahead
                    // identified this activate as the level rise (Java's
                    // getLevelAt CONSIDERE_FUTURE_DEACTIVATE), the bar's
                    // visible start is that message's arrow_y. Otherwise
                    // the position uses the standard Java getStairs rules.
                    let claimed = msg_claims_activate.remove(name);
                    let use_tile_y =
                        scope.seen_deact || (scope.msg_arrow_y.is_none() && claimed.is_none());
                    let y_stairs = if let Some(claim_y) = claimed {
                        claim_y
                    } else if is_inline {
                        if use_tile_y {
                            tiles
                                .get(tile_idx)
                                .and_then(|t| t.get_y())
                                .unwrap_or(last_step_y)
                        } else {
                            // Java CommunicationTileSelf: inline activate uses p2.y
                            // (end point); regular inline uses the arrow_y.
                            last_step_y_self_end.unwrap_or(last_step_y)
                        }
                    } else if use_tile_y {
                        tiles
                            .get(tile_idx)
                            .and_then(|t| t.get_y())
                            .unwrap_or(last_step_y)
                    } else if let Some(arrow_y) = scope.msg_arrow_y {
                        arrow_y
                    } else {
                        tiles
                            .get(tile_idx)
                            .and_then(|t| t.get_y())
                            .unwrap_or(last_step_y)
                    };
                    scope.seen_act = true;
                    // Track activate's eventsStep tile_y for the collision
                    // bump check on a subsequent deactivate.
                    let act_tile_y = tiles
                        .get(tile_idx)
                        .and_then(|t| t.get_y())
                        .unwrap_or(last_step_y);
                    scope.last_act_tile_y = Some(act_tile_y);
                    let y_addstep = if inside_tile_parallel[event_idx] {
                        last_step_y
                    } else {
                        last_msg_bottom_y
                    };
                    let stack = act_state.entry(name.clone()).or_default();
                    let level = stack.len() + 1;
                    log::debug!("teoz activate {name} level={level} y_stairs={y_stairs:.4} y_addstep={y_addstep:.4} inline={is_inline}");
                    stack.push((y_stairs, y_addstep, level, act_color.clone()));
                }
                SeqEvent::Deactivate(name) => {
                    let deact_inline = sd.inline_life_events.contains(&event_idx);
                    let scope = le_scope.entry(name.clone()).or_default();
                    let use_tile_y = scope.seen_act || scope.msg_arrow_y.is_none();
                    scope.seen_deact = true;
                    if let Some(stack) = act_state.get_mut(name) {
                        if let Some((y_start, y_start_addstep, level, color)) = stack.pop() {
                            let idx = name_to_idx.get(name).copied().unwrap_or(0);
                            let cx = get_x(livings[idx].pos_c);
                            let x = cx - ACTIVATION_WIDTH / 2.0
                                + (level - 1) as f64 * (ACTIVATION_WIDTH / 2.0);
                            // Java auto-attaches every deactivate to the previous
                            // message. LiveBoxes.getStairs uses that message's
                            // arrow_y as the bar end position UNLESS an activate
                            // for the same scope was already seen (or the prior
                            // message did not involve this participant, which
                            // sets Java's `position` to null and forces use of
                            // potentialPosition = LifeEvent tile_y).
                            let deact_tile_y = tiles
                                .get(tile_idx)
                                .and_then(|t| t.get_y())
                                .unwrap_or(last_step_y);
                            // Java LiveBoxes.addStep applies +5 to a
                            // deactivate's step y when it collides with an
                            // existing eventsStep value. Across Java's
                            // 6 multi-pass renders the deactivate's first-pass
                            // value populates eventsStep so subsequent even
                            // passes always re-collide and bump by 5. The
                            // final (sixth) pass therefore always reflects
                            // the bumped position when use_tile_y is true.
                            let mut y_end = if use_tile_y {
                                deact_tile_y + 5.0
                            } else {
                                scope.msg_arrow_y.unwrap_or(last_step_y)
                            };
                            if (y_end - y_start).abs() < 0.001 {
                                if deact_inline {
                                    // Java: the deactivate LifeEventTile position
                                    // naturally advances past the message/note
                                    // combined tile height, producing correct bar
                                    // height. Use tile y as the bar end position.
                                    let tile_y =
                                        tiles.get(tile_idx).and_then(|t| t.get_y()).unwrap_or(
                                            y_start
                                                + rose::ARROW_DELTA_Y
                                                + rose::ARROW_PADDING_Y
                                                + 5.0,
                                        );
                                    y_end = tile_y;
                                    // If tile y also matches start, apply minimum
                                    if (y_end - y_start).abs() < 0.001 {
                                        y_end = y_start
                                            + rose::ARROW_DELTA_Y
                                            + rose::ARROW_PADDING_Y
                                            + 5.0;
                                    } else {
                                        // Java multi-pass: the deactivate's own step
                                        // value persists across render passes, causing
                                        // a self-collision (+5) in even-numbered passes.
                                        // With Java's 6 passes (even count), the final
                                        // bar includes the +5 bump.
                                        y_end += 5.0;
                                    }
                                } else if last_msg_bottom_y > y_start + 0.001 {
                                    y_end = last_msg_bottom_y;
                                    if (last_msg_bottom_y - y_start_addstep).abs() < 0.001 {
                                        y_end += 5.0;
                                    }
                                }
                            }
                            // Java LiveBoxes.addStep applies a +5 collision
                            // bump only to the eventsStep value, but standalone
                            // deactivates following a message use the message's
                            // arrow_y as the bar position (via the LiveBoxes
                            // attached-LifeEvent path), so the bump does not
                            // affect the rendered bar end.
                            log::debug!("teoz deactivate {name} level={level} y_start={y_start:.4} y_end={y_end:.4} inline={deact_inline}");
                            activations.push(ActivationLayout {
                                participant: name.clone(),
                                x,
                                y_start,
                                y_end,
                                level,
                                color,
                            });
                        }
                    }
                }
                SeqEvent::Destroy(name) => {
                    // Java auto-attaches the destroy LifeEvent to the
                    // preceding message, so the bar end and cross center
                    // both fall on the message's arrow_y (= last_step_y),
                    // not the LifeEvent tile_y.
                    let destroy_inline = sd.inline_life_events.contains(&event_idx);
                    let ty = if destroy_inline
                        || matches!(tiles.get(tile_idx), Some(TeozTile::LifeEvent { .. }))
                    {
                        last_step_y
                    } else {
                        tiles
                            .get(tile_idx)
                            .and_then(|t| t.get_y())
                            .unwrap_or(last_step_y)
                    };
                    let idx = name_to_idx.get(name).copied().unwrap_or(0);
                    let cx = get_x(livings[idx].pos_c);
                    destroys.push(DestroyLayout {
                        x: cx,
                        y: ty,
                        participant: name.clone(),
                    });
                    // Close any open activations
                    if let Some(stack) = act_state.get_mut(name) {
                        while let Some((y_start, _y_addstep, level, color)) = stack.pop() {
                            let x = cx - ACTIVATION_WIDTH / 2.0
                                + (level - 1) as f64 * (ACTIVATION_WIDTH / 2.0);
                            activations.push(ActivationLayout {
                                participant: name.clone(),
                                x,
                                y_start,
                                y_end: ty,
                                level,
                                color,
                            });
                        }
                    }
                }
                _ => {}
            }
            tile_idx += 1;
        }
        // Close any unclosed activations at the lifeline bottom.
        // Java: unclosed activations extend the lifeline by a minimum height
        // (approximately 18px) beyond the last message bottom.
        const MIN_UNCLOSED_ACTIVATION_HEIGHT: f64 = 18.0;
        let mut extended_lifeline_bottom = lifeline_bottom;
        for (name, stack) in act_state.drain() {
            let idx = name_to_idx.get(&name).copied().unwrap_or(0);
            let cx = get_x(livings[idx].pos_c);
            for (y_start, _y_addstep, level, color) in stack {
                let x = cx - ACTIVATION_WIDTH / 2.0 + (level - 1) as f64 * (ACTIVATION_WIDTH / 2.0);
                // Ensure the activation has at least MIN_UNCLOSED_ACTIVATION_HEIGHT
                let y_end = (y_start + MIN_UNCLOSED_ACTIVATION_HEIGHT).max(lifeline_bottom);
                if y_end > extended_lifeline_bottom {
                    extended_lifeline_bottom = y_end;
                }
                activations.push(ActivationLayout {
                    participant: name.clone(),
                    x,
                    y_start,
                    y_end,
                    level,
                    color,
                });
            }
        }
        // Update lifeline_bottom to account for unclosed activations
        lifeline_bottom = extended_lifeline_bottom;

        // Java LiveBoxesDrawer draws activation bars per-participant sorted by
        // stair position (level ascending). Sort to match Java draw order.
        activations.sort_by(|a, b| {
            a.participant
                .cmp(&b.participant)
                .then(a.level.cmp(&b.level))
                .then(
                    a.y_start
                        .partial_cmp(&b.y_start)
                        .unwrap_or(std::cmp::Ordering::Equal),
                )
        });
    }

    // Java: PlayingSpaceWithParticipants.width = maxX - minX (= diagram_width)
    // SequenceDiagramFileMakerTeoz: calculateDimension returns (width + 10, height + 10)
    // SVG exporter adds getDefaultMargins() = (5,5,5,5) for teoz mode.
    // Total viewport width = body_width + 10 + 5 + 5 = body_width + 20.
    let total_width = diagram_width + 2.0 * DOC_MARGIN_X;
    // Java height chain:
    //   startingY(8) + sum_tiles → finalY (in PlayingSpace coordinates)
    //   getPreferredHeight  = finalY + 10 (bottom padding)
    //   bodyHeight          = preferred + factor*headHeight
    //   calculateDimension  = bodyHeight + 10 (TextBlock wrapper)
    //   SVG viewport        = dimension + 10 (UTranslate(5,5))
    //
    // Combined: 8 + sum + 10 + factor*head + 10 + 10 = sum + factor*head + 38
    // Java SVG viewport height = sum + factor*head + 38
    // Our tiles_bottom = STARTING_Y + head + 8 + sum = sum + head + 18
    // total = tiles_bottom + (factor-1)*head + 20 = sum + factor*head + 38  ✓
    let show_footbox = !sd.hide_footbox;
    let factor = if show_footbox { 2 } else { 1 };
    // Java: participant getPreferredHeight includes deltaShadow, which is
    // already folded into max_preferred_height. With factor=2 (footbox), this
    // correctly expands the total height by 2*deltaShadow (once for head, once
    // for tiles_bottom offset which includes one head height).
    let total_height = tiles_bottom + (factor - 1) as f64 * max_preferred_height + 20.0;
    log::debug!("teoz_layout: total_width={total_width:.4} total_height={total_height:.4} lifeline_bottom={lifeline_bottom:.4} max_preferred_height={max_preferred_height:.4}");

    Ok(SeqLayout {
        participants: part_layouts,
        messages,
        activations,
        destroys,
        notes,
        groups,
        fragments: {
            // Sort fragments so outer (earlier y, taller) come before inner.
            // Java draws outer GroupingTile first via recursive drawU().
            let mut sorted = fragments;
            sorted.sort_by(|a, b| {
                a.y.partial_cmp(&b.y)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| {
                        b.height
                            .partial_cmp(&a.height)
                            .unwrap_or(std::cmp::Ordering::Equal)
                    })
            });
            sorted
        },
        dividers,
        delays,
        refs,
        autonumber_enabled,
        autonumber_start,
        lifeline_top: STARTING_Y + max_preferred_height,
        lifeline_bottom,
        total_width,
        total_height,
    })
}

// ── Text wrapping helper (copied from Puma) ──────────────────────────────────

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
