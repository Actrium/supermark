// klimt - 2D graphics abstraction layer
// Port of Java PlantUML's net.sourceforge.plantuml.klimt package
//
// Named after Gustav Klimt, the Austrian painter.
// Provides output-format-independent drawing primitives that map 1:1
// with Java PlantUML's internal graphics API.

pub mod color;
pub mod drawable;
pub mod font;
pub mod geom;
pub mod hand;
pub mod shape;
pub mod svg;

// ── UChange: marker trait for state changes applied to UGraphic ──────

/// Marker trait for changes that can be applied to a UGraphic context.
/// Java: `klimt.UChange` (empty interface)
///
/// Implementors: UStroke, UTranslate, HColor (foreground), UBackground, UPattern
pub trait UChange: std::any::Any {
    fn as_any(&self) -> &dyn std::any::Any;
}

// ── UStroke ──────────────────────────────────────────────────────────

/// Line stroke style: dash pattern + thickness.
/// Java: `klimt.UStroke`
#[derive(Debug, Clone, PartialEq)]
pub struct UStroke {
    pub dash_visible: f64,
    pub dash_space: f64,
    pub thickness: f64,
}

impl UChange for UStroke {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

impl UStroke {
    pub fn new(dash_visible: f64, dash_space: f64, thickness: f64) -> Self {
        Self {
            dash_visible,
            dash_space,
            thickness,
        }
    }

    pub fn with_thickness(thickness: f64) -> Self {
        Self {
            dash_visible: 0.0,
            dash_space: 0.0,
            thickness,
        }
    }

    pub fn simple() -> Self {
        Self::with_thickness(1.0)
    }

    pub fn only_thickness(&self) -> Self {
        Self {
            dash_visible: 0.0,
            dash_space: 0.0,
            thickness: self.thickness,
        }
    }

    /// Returns dash array for SVG `stroke-dasharray`, or None if solid.
    pub fn dasharray_svg(&self) -> Option<(f64, f64)> {
        if self.dash_visible == 0.0 {
            None
        } else {
            Some((self.dash_visible, self.dash_space))
        }
    }
}

impl Default for UStroke {
    fn default() -> Self {
        Self::simple()
    }
}

// ── UTranslate ───────────────────────────────────────────────────────

/// 2D translation offset.
/// Java: `klimt.UTranslate`
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct UTranslate {
    pub dx: f64,
    pub dy: f64,
}

impl UChange for UTranslate {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

impl UTranslate {
    pub fn new(dx: f64, dy: f64) -> Self {
        Self { dx, dy }
    }
    pub fn none() -> Self {
        Self { dx: 0.0, dy: 0.0 }
    }
    pub fn dx(dx: f64) -> Self {
        Self { dx, dy: 0.0 }
    }
    pub fn dy(dy: f64) -> Self {
        Self { dx: 0.0, dy }
    }

    pub fn compose(self, other: UTranslate) -> Self {
        Self {
            dx: self.dx + other.dx,
            dy: self.dy + other.dy,
        }
    }

    pub fn reverse(self) -> Self {
        Self {
            dx: -self.dx,
            dy: -self.dy,
        }
    }

    pub fn scaled(self, scale: f64) -> Self {
        Self {
            dx: self.dx * scale,
            dy: self.dy * scale,
        }
    }
}

impl Default for UTranslate {
    fn default() -> Self {
        Self::none()
    }
}

// ── UBackground ──────────────────────────────────────────────────────

/// Background fill specification.
/// Java: `klimt.UBackground`
#[derive(Debug, Clone)]
pub enum UBackground {
    None,
    Color(color::HColor),
}

impl UChange for UBackground {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

// ── UPattern ─────────────────────────────────────────────────────────

/// Fill pattern.
/// Java: `klimt.UPattern`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum UPattern {
    #[default]
    None,
    Striped,
    VerticalStriped,
}

impl UChange for UPattern {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

// ── UParam: current render state ─────────────────────────────────────

/// Accumulated rendering parameters (color, stroke, etc.)
/// Java: `klimt.UParam`
#[derive(Debug, Clone)]
pub struct UParam {
    pub color: color::HColor,
    pub backcolor: color::HColor,
    pub stroke: UStroke,
    pub pattern: UPattern,
    pub hidden: bool,
}

impl Default for UParam {
    fn default() -> Self {
        Self {
            color: color::HColor::simple("#000000"),
            backcolor: color::HColor::none(),
            stroke: UStroke::simple(),
            pattern: UPattern::None,
            hidden: false,
        }
    }
}

// ── UGraphic trait ───────────────────────────────────────────────────

/// The core drawing abstraction. All diagram renderers draw through this.
/// Java: `klimt.drawing.UGraphic`
///
/// Usage:
/// ```ignore
/// let mut ug = SvgGraphic::new(...);
/// ug.apply(UTranslate::new(10.0, 20.0));
/// ug.apply(UStroke::with_thickness(1.5));
/// ug.apply(HColor::simple("#FF0000")); // foreground
/// ug.draw_rect(100.0, 50.0, 5.0);     // rounded rect
/// ```
pub trait UGraphic {
    /// Apply a state change (translate, stroke, color, etc.)
    fn apply(&mut self, change: &dyn UChange);

    /// Get current render parameters
    fn param(&self) -> &UParam;

    /// Get the string bounder for text measurement
    fn string_bounder(&self) -> &dyn font::StringBounder;

    /// Get the default background color.
    /// Java: `getDefaultBackground()`
    fn default_background(&self) -> color::HColor {
        color::HColor::none()
    }

    // ── Shape drawing methods ──
    // Instead of Java's generic `draw(UShape)` with runtime dispatch,
    // we use explicit methods for type safety.

    fn draw_rect(&mut self, width: f64, height: f64, rx: f64);
    fn draw_ellipse(&mut self, width: f64, height: f64);
    fn draw_line(&mut self, dx: f64, dy: f64);
    fn draw_text(
        &mut self,
        text: &str,
        font_family: &str,
        font_size: f64,
        bold: bool,
        italic: bool,
    );
    fn draw_path(&mut self, path: &shape::UPath);
    fn draw_polygon(&mut self, points: &[(f64, f64)]);

    // ── Group/URL management ──

    /// Start a group with metadata.
    /// Java: `startGroup(UGroup group)`
    fn start_group(&mut self, group: &UGroup);
    fn close_group(&mut self);
    fn start_url(&mut self, url: &str, tooltip: &str);
    fn close_url(&mut self);

    /// Flush pending output. Java: `flushUg()`
    fn flush(&mut self) {}

    /// Check whether a property is enabled. Java: `matchesProperty(String)`
    fn matches_property(&self, _property_name: &str) -> bool {
        false
    }
}

// ── UClip ────────────────────────────────────────────────────────────

/// Clipping rectangle. Points outside this region are not drawn.
/// Java: `klimt.UClip`
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct UClip {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl UChange for UClip {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

impl UClip {
    pub fn new(x: f64, y: f64, width: f64, height: f64) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    /// Enlarge the clip region by `delta` in all directions.
    pub fn enlarge(&self, delta: f64) -> Self {
        Self {
            x: self.x - delta,
            y: self.y - delta,
            width: self.width + 2.0 * delta,
            height: self.height + 2.0 * delta,
        }
    }

    /// Translate the clip region by the given offset.
    pub fn translate(&self, dx: f64, dy: f64) -> Self {
        Self {
            x: self.x + dx,
            y: self.y + dy,
            width: self.width,
            height: self.height,
        }
    }

    /// Translate the clip region by a UTranslate.
    pub fn translate_ut(&self, t: &UTranslate) -> Self {
        self.translate(t.dx, t.dy)
    }

    /// Test whether a point is inside this clip region.
    pub fn is_inside(&self, xp: f64, yp: f64) -> bool {
        xp >= self.x && xp <= self.x + self.width && yp >= self.y && yp <= self.y + self.height
    }

    /// Test whether a point (from geom::XPoint2D) is inside this clip region.
    pub fn is_inside_pt(&self, pt: &geom::XPoint2D) -> bool {
        self.is_inside(pt.x, pt.y)
    }

    /// Clamp an X coordinate to the clip region.
    pub fn clipped_x(&self, xp: f64) -> f64 {
        xp.clamp(self.x, self.x + self.width)
    }

    /// Clamp a Y coordinate to the clip region.
    pub fn clipped_y(&self, yp: f64) -> f64 {
        yp.clamp(self.y, self.y + self.height)
    }
}

impl std::fmt::Display for UClip {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "CLIP x={} y={} w={} h={}",
            self.x, self.y, self.width, self.height
        )
    }
}

// ── Fashion ─────────────────────────────────────────────────────────

/// Combined visual style: colors + stroke + shadow + rounded corners.
/// Java: `klimt.Fashion`
///
/// Uses builder-pattern `with_*` methods (returns a new Fashion) to
/// derive modified styles from an existing one.
#[derive(Debug, Clone)]
pub struct Fashion {
    pub back_color: Option<color::HColor>,
    pub fore_color: Option<color::HColor>,
    pub stroke: UStroke,
    pub delta_shadow: f64,
    pub round_corner: f64,
    pub diagonal_corner: f64,
}

impl Fashion {
    pub fn new(back_color: Option<color::HColor>, fore_color: Option<color::HColor>) -> Self {
        Self {
            back_color,
            fore_color,
            stroke: UStroke::simple(),
            delta_shadow: 0.0,
            round_corner: 0.0,
            diagonal_corner: 0.0,
        }
    }

    pub fn with_shadow(&self, delta_shadow: f64) -> Self {
        Self {
            delta_shadow,
            ..self.clone()
        }
    }

    pub fn with_stroke(&self, stroke: UStroke) -> Self {
        Self {
            stroke,
            ..self.clone()
        }
    }

    pub fn with_back_color(&self, back_color: Option<color::HColor>) -> Self {
        Self {
            back_color,
            ..self.clone()
        }
    }

    pub fn with_fore_color(&self, fore_color: Option<color::HColor>) -> Self {
        Self {
            fore_color,
            ..self.clone()
        }
    }

    pub fn with_corner(&self, round_corner: f64, diagonal_corner: f64) -> Self {
        Self {
            round_corner,
            diagonal_corner,
            ..self.clone()
        }
    }

    pub fn is_shadowing(&self) -> bool {
        self.delta_shadow > 0.0
    }
}

// ── LineBreakStrategy ───────────────────────────────────────────────

/// Text wrapping strategy: none, auto, or a fixed max width.
/// Java: `klimt.LineBreakStrategy`
#[derive(Debug, Clone, PartialEq, Default)]
pub enum LineBreakStrategy {
    /// No line breaking.
    #[default]
    None,
    /// Automatic line breaking.
    Auto,
    /// Break at a fixed max width (in pixels).
    MaxWidth(f64),
}

impl LineBreakStrategy {
    pub const NONE: Self = Self::None;

    /// Parse from a string value as Java PlantUML does.
    /// - `None` / empty => `LineBreakStrategy::None`
    /// - `"auto"` (case-insensitive) => `LineBreakStrategy::Auto`
    /// - A decimal integer string => `LineBreakStrategy::MaxWidth(n)`
    pub fn from_value(value: Option<&str>) -> Self {
        match value {
            None | Some("") => Self::None,
            Some(s) if s.eq_ignore_ascii_case("auto") => Self::Auto,
            Some(s) => {
                if let Ok(n) = s.parse::<f64>() {
                    Self::MaxWidth(n)
                } else {
                    Self::None
                }
            }
        }
    }

    pub fn is_auto(&self) -> bool {
        matches!(self, Self::Auto)
    }

    /// Returns the max width, or 0 if not a fixed-width strategy.
    pub fn max_width(&self) -> f64 {
        match self {
            Self::MaxWidth(w) => *w,
            _ => 0.0,
        }
    }
}

// ── UGroupType ──────────────────────────────────────────────────────

/// Type/purpose of a SVG group element.
/// Java: `klimt.UGroupType`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum UGroupType {
    Id,
    Class,
    Title,
    DataEntity,
    DataQualifiedName,
    DataEntity1,
    DataEntity2,
    DataEntityUid,
    DataEntity1Uid,
    DataEntity2Uid,
    DataParticipant,
    DataParticipant1,
    DataParticipant2,
    DataUid,
    DataSourceLine,
    DataVisibilityModifier,
    DataLinkType,
}

impl UGroupType {
    /// Returns the SVG attribute name (lowercase, underscores become hyphens).
    /// Java: `getSvgKeyAttributeName()`
    pub fn svg_key_attribute_name(&self) -> &'static str {
        match self {
            Self::Id => "id",
            Self::Class => "class",
            Self::Title => "title",
            Self::DataEntity => "data-entity",
            Self::DataQualifiedName => "data-qualified-name",
            Self::DataEntity1 => "data-entity-1",
            Self::DataEntity2 => "data-entity-2",
            Self::DataEntityUid => "data-entity-uid",
            Self::DataEntity1Uid => "data-entity-1-uid",
            Self::DataEntity2Uid => "data-entity-2-uid",
            Self::DataParticipant => "data-participant",
            Self::DataParticipant1 => "data-participant-1",
            Self::DataParticipant2 => "data-participant-2",
            Self::DataUid => "data-uid",
            Self::DataSourceLine => "data-source-line",
            Self::DataVisibilityModifier => "data-visibility-modifier",
            Self::DataLinkType => "data-link-type",
        }
    }
}

// ── UGroup ──────────────────────────────────────────────────────────

/// Group metadata: a set of (UGroupType -> value) pairs for SVG `<g>` elements.
/// Java: `klimt.UGroup`
#[derive(Debug, Clone, Default)]
pub struct UGroup {
    entries: Vec<(UGroupType, String)>,
}

impl UGroup {
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a UGroup with a single entry.
    pub fn singleton(key: UGroupType, value: &str) -> Self {
        let mut g = Self::new();
        g.put(key, value);
        g
    }

    /// Insert/overwrite an entry, sanitizing the value (non-word chars become '.').
    pub fn put(&mut self, key: UGroupType, value: &str) {
        let fixed = sanitize_group_metadata_value(value);
        // Replace existing entry for this key, or append.
        if let Some(entry) = self.entries.iter_mut().find(|(k, _)| *k == key) {
            entry.1 = fixed;
        } else {
            self.entries.push((key, fixed));
        }
    }

    pub fn entries(&self) -> &[(UGroupType, String)] {
        &self.entries
    }
}

/// Java `UGroup.fix()`: replace characters that are not `[-\\w ]` with '.',
/// where `\\w` uses ASCII semantics.
pub(crate) fn sanitize_group_metadata_value(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == ' ' {
                c
            } else {
                '.'
            }
        })
        .collect()
}

// ── SvgAttributes ───────────────────────────────────────────────────

/// An ordered set of SVG attribute key-value pairs.
/// Java: `klimt.SvgAttributes`
///
/// Immutable builder pattern: `add()` returns a new SvgAttributes.
#[derive(Debug, Clone, Default)]
pub struct SvgAttributes {
    pairs: Vec<(String, String)>,
}

impl SvgAttributes {
    pub fn empty() -> Self {
        Self::default()
    }

    /// Add a single attribute, returning a new SvgAttributes.
    pub fn add(&self, key: &str, value: &str) -> Self {
        let mut result = self.clone();
        // Replace existing key or append.
        if let Some(entry) = result.pairs.iter_mut().find(|(k, _)| k == key) {
            entry.1 = value.to_string();
        } else {
            result.pairs.push((key.to_string(), value.to_string()));
        }
        result
    }

    /// Merge another SvgAttributes into this one, returning a new SvgAttributes.
    pub fn add_all(&self, other: &SvgAttributes) -> Self {
        let mut result = self.clone();
        for (k, v) in &other.pairs {
            if let Some(entry) = result.pairs.iter_mut().find(|(ek, _)| ek == k) {
                entry.1 = v.clone();
            } else {
                result.pairs.push((k.clone(), v.clone()));
            }
        }
        result
    }

    /// Get all attribute pairs (ordered).
    pub fn pairs(&self) -> &[(String, String)] {
        &self.pairs
    }

    pub fn is_empty(&self) -> bool {
        self.pairs.is_empty()
    }
}

// ── UShapeSized trait ───────────────────────────────────────────────

/// Trait for shapes that have a width and height.
/// Java: `klimt.UShapeSized extends UShape`
pub trait UShapeSized {
    fn width(&self) -> f64;
    fn height(&self) -> f64;
}

// ── Shadowable trait ────────────────────────────────────────────────

/// Trait for shapes that support drop-shadow.
/// Java: `klimt.Shadowable extends UShape`
///
/// The `delta_shadow` value controls the shadow offset/blur.
/// A value of 0 means no shadow.
pub trait Shadowable {
    fn set_delta_shadow(&mut self, delta_shadow: f64);
    fn delta_shadow(&self) -> f64;

    fn is_shadowed(&self) -> bool {
        self.delta_shadow() > 0.0
    }
}

/// Default shadow storage mixin for shapes.
/// Java: `klimt.AbstractShadowable`
///
/// Shapes can embed this and delegate the Shadowable trait to it.
#[derive(Debug, Clone, Copy, Default)]
pub struct ShadowData {
    pub delta_shadow: f64,
}

impl ShadowData {
    pub fn new() -> Self {
        Self { delta_shadow: 0.0 }
    }
}

impl Shadowable for ShadowData {
    fn set_delta_shadow(&mut self, delta_shadow: f64) {
        self.delta_shadow = delta_shadow;
    }

    fn delta_shadow(&self) -> f64 {
        self.delta_shadow
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ustroke_default_is_solid_1px() {
        let s = UStroke::default();
        assert_eq!(s.thickness, 1.0);
        assert!(s.dasharray_svg().is_none());
    }

    #[test]
    fn ustroke_dashed() {
        let s = UStroke::new(5.0, 5.0, 1.0);
        assert_eq!(s.dasharray_svg(), Some((5.0, 5.0)));
    }

    #[test]
    fn utranslate_compose() {
        let a = UTranslate::new(10.0, 20.0);
        let b = UTranslate::new(5.0, -3.0);
        let c = a.compose(b);
        assert_eq!(c.dx, 15.0);
        assert_eq!(c.dy, 17.0);
    }

    #[test]
    fn utranslate_reverse() {
        let t = UTranslate::new(10.0, -5.0);
        let r = t.reverse();
        assert_eq!(r.dx, -10.0);
        assert_eq!(r.dy, 5.0);
    }

    // ── UClip tests ──

    #[test]
    fn uclip_is_inside() {
        let clip = UClip::new(10.0, 20.0, 100.0, 50.0);
        assert!(clip.is_inside(10.0, 20.0));
        assert!(clip.is_inside(110.0, 70.0));
        assert!(clip.is_inside(50.0, 40.0));
        assert!(!clip.is_inside(9.0, 20.0));
        assert!(!clip.is_inside(50.0, 71.0));
    }

    #[test]
    fn uclip_enlarge() {
        let clip = UClip::new(10.0, 20.0, 100.0, 50.0);
        let big = clip.enlarge(5.0);
        assert_eq!(big.x, 5.0);
        assert_eq!(big.y, 15.0);
        assert_eq!(big.width, 110.0);
        assert_eq!(big.height, 60.0);
    }

    #[test]
    fn uclip_translate() {
        let clip = UClip::new(10.0, 20.0, 100.0, 50.0);
        let moved = clip.translate(5.0, -3.0);
        assert_eq!(moved.x, 15.0);
        assert_eq!(moved.y, 17.0);
        assert_eq!(moved.width, 100.0);
        assert_eq!(moved.height, 50.0);
    }

    #[test]
    fn uclip_clipped_coords() {
        let clip = UClip::new(10.0, 20.0, 100.0, 50.0);
        assert_eq!(clip.clipped_x(5.0), 10.0);
        assert_eq!(clip.clipped_x(50.0), 50.0);
        assert_eq!(clip.clipped_x(200.0), 110.0);
        assert_eq!(clip.clipped_y(10.0), 20.0);
        assert_eq!(clip.clipped_y(40.0), 40.0);
        assert_eq!(clip.clipped_y(80.0), 70.0);
    }

    #[test]
    fn uclip_display() {
        let clip = UClip::new(1.0, 2.0, 3.0, 4.0);
        assert_eq!(format!("{}", clip), "CLIP x=1 y=2 w=3 h=4");
    }

    // ── Fashion tests ──

    #[test]
    fn fashion_new_defaults() {
        let f = Fashion::new(None, None);
        assert_eq!(f.delta_shadow, 0.0);
        assert_eq!(f.round_corner, 0.0);
        assert!(!f.is_shadowing());
    }

    #[test]
    fn fashion_with_shadow() {
        let f = Fashion::new(None, None).with_shadow(3.0);
        assert!(f.is_shadowing());
        assert_eq!(f.delta_shadow, 3.0);
    }

    #[test]
    fn fashion_with_corner() {
        let f = Fashion::new(None, None).with_corner(10.0, 5.0);
        assert_eq!(f.round_corner, 10.0);
        assert_eq!(f.diagonal_corner, 5.0);
    }

    // ── LineBreakStrategy tests ──

    #[test]
    fn line_break_none() {
        let lbs = LineBreakStrategy::from_value(None);
        assert_eq!(lbs, LineBreakStrategy::None);
        assert_eq!(lbs.max_width(), 0.0);
    }

    #[test]
    fn line_break_auto() {
        let lbs = LineBreakStrategy::from_value(Some("auto"));
        assert!(lbs.is_auto());
        assert_eq!(lbs.max_width(), 0.0);
    }

    #[test]
    fn line_break_auto_case_insensitive() {
        let lbs = LineBreakStrategy::from_value(Some("AUTO"));
        assert!(lbs.is_auto());
    }

    #[test]
    fn line_break_max_width() {
        let lbs = LineBreakStrategy::from_value(Some("200"));
        assert_eq!(lbs, LineBreakStrategy::MaxWidth(200.0));
        assert_eq!(lbs.max_width(), 200.0);
    }

    #[test]
    fn line_break_negative_width() {
        let lbs = LineBreakStrategy::from_value(Some("-50"));
        assert_eq!(lbs, LineBreakStrategy::MaxWidth(-50.0));
        assert_eq!(lbs.max_width(), -50.0);
    }

    // ── UGroupType tests ──

    #[test]
    fn ugroup_type_svg_name() {
        assert_eq!(UGroupType::Id.svg_key_attribute_name(), "id");
        assert_eq!(UGroupType::Class.svg_key_attribute_name(), "class");
        assert_eq!(
            UGroupType::DataEntity.svg_key_attribute_name(),
            "data-entity"
        );
        assert_eq!(
            UGroupType::DataSourceLine.svg_key_attribute_name(),
            "data-source-line"
        );
        assert_eq!(
            UGroupType::DataVisibilityModifier.svg_key_attribute_name(),
            "data-visibility-modifier"
        );
    }

    // ── UGroup tests ──

    #[test]
    fn ugroup_singleton() {
        let g = UGroup::singleton(UGroupType::Id, "my-element");
        assert_eq!(g.entries().len(), 1);
        assert_eq!(g.entries()[0], (UGroupType::Id, "my-element".to_string()));
    }

    #[test]
    fn ugroup_sanitize_value() {
        let g = UGroup::singleton(UGroupType::Class, "foo<bar>baz");
        assert_eq!(g.entries()[0].1, "foo.bar.baz");
    }

    #[test]
    fn ugroup_sanitize_value_non_ascii_becomes_dot() {
        let g = UGroup::singleton(UGroupType::DataQualifiedName, "Aéü-B");
        assert_eq!(g.entries()[0].1, "A..-B");
    }

    #[test]
    fn ugroup_put_replaces() {
        let mut g = UGroup::new();
        g.put(UGroupType::Id, "first");
        g.put(UGroupType::Id, "second");
        assert_eq!(g.entries().len(), 1);
        assert_eq!(g.entries()[0].1, "second");
    }

    // ── SvgAttributes tests ──

    #[test]
    fn svg_attributes_empty() {
        let a = SvgAttributes::empty();
        assert!(a.is_empty());
    }

    #[test]
    fn svg_attributes_add() {
        let a = SvgAttributes::empty()
            .add("fill", "red")
            .add("stroke", "blue");
        assert_eq!(a.pairs().len(), 2);
        assert_eq!(a.pairs()[0], ("fill".to_string(), "red".to_string()));
        assert_eq!(a.pairs()[1], ("stroke".to_string(), "blue".to_string()));
    }

    #[test]
    fn svg_attributes_add_replaces_existing() {
        let a = SvgAttributes::empty()
            .add("fill", "red")
            .add("fill", "green");
        assert_eq!(a.pairs().len(), 1);
        assert_eq!(a.pairs()[0].1, "green");
    }

    #[test]
    fn svg_attributes_add_all() {
        let a = SvgAttributes::empty().add("fill", "red");
        let b = SvgAttributes::empty().add("stroke", "blue");
        let merged = a.add_all(&b);
        assert_eq!(merged.pairs().len(), 2);
    }

    // ── Shadowable / ShadowData tests ──

    #[test]
    fn shadow_data_default() {
        let s = ShadowData::new();
        assert_eq!(s.delta_shadow(), 0.0);
        assert!(!s.is_shadowed());
    }

    #[test]
    fn shadow_data_set() {
        let mut s = ShadowData::new();
        s.set_delta_shadow(4.0);
        assert_eq!(s.delta_shadow(), 4.0);
        assert!(s.is_shadowed());
    }
}
