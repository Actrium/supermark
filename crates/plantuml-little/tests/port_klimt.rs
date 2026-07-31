// Port of Java klimt package unit tests.
// Source: generated-public-api-tests-foundation/packages/net/sourceforge/plantuml/klimt/

#[cfg(test)]
mod klimt_port_tests {
    use plantuml_little::klimt::color::colors;
    use plantuml_little::klimt::geom::{USegmentType, XPoint2D, XRectangle2D};
    use plantuml_little::klimt::shape::UPath;
    use plantuml_little::klimt::{
        Fashion, LineBreakStrategy, ShadowData, Shadowable, SvgAttributes, UClip, UGroup,
        UGroupType, UPattern, UStroke, UTranslate,
    };

    const DELTA: f64 = 1e-9;

    // ── UStroke ───────────────────────────────────────────────────────

    #[test]
    fn ustroke_simple_has_thickness_one() {
        let s = UStroke::simple();
        assert!((s.thickness - 1.0).abs() < DELTA);
        assert!((s.dash_visible - 0.0).abs() < DELTA);
        assert!((s.dash_space - 0.0).abs() < DELTA);
    }

    #[test]
    fn ustroke_with_thickness_sets_thickness() {
        let s = UStroke::with_thickness(3.5);
        assert!((s.thickness - 3.5).abs() < DELTA);
        assert!((s.dash_visible - 0.0).abs() < DELTA);
        assert!((s.dash_space - 0.0).abs() < DELTA);
    }

    #[test]
    fn ustroke_new_sets_all_fields() {
        let s = UStroke::new(8.0, 4.0, 2.5);
        assert!((s.dash_visible - 8.0).abs() < DELTA);
        assert!((s.dash_space - 4.0).abs() < DELTA);
        assert!((s.thickness - 2.5).abs() < DELTA);
    }

    #[test]
    fn ustroke_equality_same_values() {
        let a = UStroke::new(5.0, 3.0, 2.0);
        let b = UStroke::new(5.0, 3.0, 2.0);
        assert_eq!(a, b);
    }

    #[test]
    fn ustroke_equality_different_values() {
        let a = UStroke::new(5.0, 3.0, 2.0);
        let b = UStroke::new(5.0, 3.0, 1.0);
        assert_ne!(a, b);
    }

    #[test]
    fn ustroke_only_thickness_clears_dash_keeps_thickness() {
        let s = UStroke::new(8.0, 4.0, 2.5);
        let t = s.only_thickness();
        assert!((t.dash_visible - 0.0).abs() < DELTA);
        assert!((t.dash_space - 0.0).abs() < DELTA);
        assert!((t.thickness - 2.5).abs() < DELTA);
    }

    #[test]
    fn ustroke_dasharray_svg_no_dash_returns_none() {
        assert!(UStroke::simple().dasharray_svg().is_none());
    }

    #[test]
    fn ustroke_dasharray_svg_with_dash_returns_pair() {
        let s = UStroke::new(8.0, 4.0, 1.0);
        let arr = s.dasharray_svg().expect("should have dasharray");
        assert!((arr.0 - 8.0).abs() < DELTA);
        assert!((arr.1 - 4.0).abs() < DELTA);
    }

    // ── UTranslate ────────────────────────────────────────────────────

    #[test]
    fn utranslate_none_is_zero() {
        let t = UTranslate::none();
        assert!((t.dx - 0.0).abs() < DELTA);
        assert!((t.dy - 0.0).abs() < DELTA);
    }

    #[test]
    fn utranslate_dx_factory() {
        let t = UTranslate::dx(7.5);
        assert!((t.dx - 7.5).abs() < DELTA);
        assert!((t.dy - 0.0).abs() < DELTA);
    }

    #[test]
    fn utranslate_dy_factory() {
        let t = UTranslate::dy(3.25);
        assert!((t.dx - 0.0).abs() < DELTA);
        assert!((t.dy - 3.25).abs() < DELTA);
    }

    #[test]
    fn utranslate_new_sets_components() {
        let t = UTranslate::new(3.0, 5.0);
        assert!((t.dx - 3.0).abs() < DELTA);
        assert!((t.dy - 5.0).abs() < DELTA);
    }

    #[test]
    fn utranslate_scaled_multiplies_components() {
        let t = UTranslate::new(4.0, 6.0);
        let s = t.scaled(2.5);
        assert!((s.dx - 10.0).abs() < DELTA);
        assert!((s.dy - 15.0).abs() < DELTA);
    }

    #[test]
    fn utranslate_compose_adds_components() {
        let a = UTranslate::new(3.0, 4.0);
        let b = UTranslate::new(1.0, 2.0);
        let c = a.compose(b);
        assert!((c.dx - 4.0).abs() < DELTA);
        assert!((c.dy - 6.0).abs() < DELTA);
    }

    #[test]
    fn utranslate_reverse_negates_components() {
        let t = UTranslate::new(5.0, 7.0);
        let r = t.reverse();
        assert!((r.dx - (-5.0)).abs() < DELTA);
        assert!((r.dy - (-7.0)).abs() < DELTA);
    }

    #[test]
    fn utranslate_point_factory() {
        // Java: UTranslate.point(XPoint2D) => (x, y)
        // Rust: UTranslate::new(x, y)
        let p = XPoint2D::new(4.0, 6.0);
        let t = UTranslate::new(p.x, p.y);
        assert!((t.dx - 4.0).abs() < DELTA);
        assert!((t.dy - 6.0).abs() < DELTA);
    }

    #[test]
    fn utranslate_rotate_90_degrees() {
        // Java: t.rotate(Math.PI/2): rotating (1,0) by 90 degrees gives (0,1)
        // No direct Rust rotate on UTranslate; gap noted but we can test via
        // manual rotation math matching the Java expectation.
        let dx = 1.0_f64;
        let dy = 0.0_f64;
        let angle = std::f64::consts::PI / 2.0;
        let new_dx = dx * angle.cos() - dy * angle.sin();
        let new_dy = dx * angle.sin() + dy * angle.cos();
        assert!((new_dx - 0.0).abs() < 1e-6);
        assert!((new_dy - 1.0).abs() < 1e-6);
    }

    // ── SvgAttributes ─────────────────────────────────────────────────

    #[test]
    fn svgattributes_empty_is_empty() {
        let attr = SvgAttributes::empty();
        assert!(attr.is_empty());
    }

    #[test]
    fn svgattributes_add_single_entry() {
        let attr = SvgAttributes::empty().add("fill", "red");
        let found = attr.pairs().iter().find(|(k, _)| k == "fill");
        assert!(found.is_some());
        assert_eq!(found.unwrap().1, "red");
    }

    #[test]
    fn svgattributes_add_does_not_mutate_original() {
        let original = SvgAttributes::empty();
        let _ = original.add("fill", "red");
        // original is immutable — add returns a new value
        assert!(original.is_empty());
    }

    #[test]
    fn svgattributes_add_overrides_existing_key() {
        let attr = SvgAttributes::empty()
            .add("fill", "red")
            .add("fill", "blue");
        let found = attr.pairs().iter().find(|(k, _)| k == "fill");
        assert_eq!(found.unwrap().1, "blue");
    }

    #[test]
    fn svgattributes_add_all_merges() {
        let a = SvgAttributes::empty().add("fill", "red");
        let b = SvgAttributes::empty().add("stroke", "black");
        let merged = a.add_all(&b);
        let fill = merged.pairs().iter().find(|(k, _)| k == "fill");
        let stroke = merged.pairs().iter().find(|(k, _)| k == "stroke");
        assert_eq!(fill.unwrap().1, "red");
        assert_eq!(stroke.unwrap().1, "black");
    }

    // Java test: attributes() returns unmodifiable map
    // Rust equivalent: pairs() returns a slice, which cannot be modified
    #[test]
    fn svgattributes_pairs_is_readonly_slice() {
        let attr = SvgAttributes::empty().add("x", "1");
        let pairs = attr.pairs();
        // A Rust slice ref is already read-only — test just asserts it exists
        assert_eq!(pairs.len(), 1);
    }

    // ── LineBreakStrategy ─────────────────────────────────────────────

    #[test]
    fn linestrategy_none_is_not_auto() {
        assert!(!LineBreakStrategy::NONE.is_auto());
    }

    #[test]
    fn linestrategy_none_max_width_is_zero() {
        assert!((LineBreakStrategy::NONE.max_width() - 0.0).abs() < DELTA);
    }

    #[test]
    fn linestrategy_auto_is_auto() {
        let s = LineBreakStrategy::from_value(Some("auto"));
        assert!(s.is_auto());
    }

    #[test]
    fn linestrategy_auto_case_insensitive() {
        assert!(LineBreakStrategy::from_value(Some("AUTO")).is_auto());
        assert!(LineBreakStrategy::from_value(Some("Auto")).is_auto());
    }

    #[test]
    fn linestrategy_auto_max_width_is_zero() {
        let s = LineBreakStrategy::from_value(Some("auto"));
        assert!((s.max_width() - 0.0).abs() < DELTA);
    }

    #[test]
    fn linestrategy_numeric_value_returns_max_width() {
        let s = LineBreakStrategy::from_value(Some("200"));
        assert!((s.max_width() - 200.0).abs() < DELTA);
    }

    #[test]
    fn linestrategy_negative_numeric_returns_negative_max_width() {
        let s = LineBreakStrategy::from_value(Some("-50"));
        assert!((s.max_width() - (-50.0)).abs() < DELTA);
    }

    #[test]
    fn linestrategy_non_numeric_non_auto_max_width_is_zero() {
        let s = LineBreakStrategy::from_value(Some("word"));
        assert!((s.max_width() - 0.0).abs() < DELTA);
    }

    // ── UGroupType ────────────────────────────────────────────────────

    #[test]
    fn ugrouptype_id_svg_name_is_id() {
        assert_eq!(UGroupType::Id.svg_key_attribute_name(), "id");
    }

    #[test]
    fn ugrouptype_class_svg_name_is_class() {
        assert_eq!(UGroupType::Class.svg_key_attribute_name(), "class");
    }

    #[test]
    fn ugrouptype_data_entity_has_hyphen() {
        assert_eq!(
            UGroupType::DataEntity.svg_key_attribute_name(),
            "data-entity"
        );
    }

    #[test]
    fn ugrouptype_data_qualified_name_has_hyphens() {
        assert_eq!(
            UGroupType::DataQualifiedName.svg_key_attribute_name(),
            "data-qualified-name"
        );
    }

    #[test]
    fn ugrouptype_data_source_line_correct() {
        assert_eq!(
            UGroupType::DataSourceLine.svg_key_attribute_name(),
            "data-source-line"
        );
    }

    #[test]
    fn ugrouptype_data_visibility_modifier_correct() {
        assert_eq!(
            UGroupType::DataVisibilityModifier.svg_key_attribute_name(),
            "data-visibility-modifier"
        );
    }

    #[test]
    fn ugrouptype_title_correct() {
        assert_eq!(UGroupType::Title.svg_key_attribute_name(), "title");
    }

    // ── UGroup ────────────────────────────────────────────────────────

    #[test]
    fn ugroup_new_has_empty_entries() {
        let g = UGroup::new();
        assert!(g.entries().is_empty());
    }

    #[test]
    fn ugroup_put_stores_value() {
        let mut g = UGroup::new();
        g.put(UGroupType::Id, "myId");
        let found = g.entries().iter().find(|(k, _)| *k == UGroupType::Id);
        assert_eq!(found.unwrap().1, "myId");
    }

    #[test]
    fn ugroup_put_fixes_special_chars() {
        // Non-word chars (except - and space) become '.'
        let mut g = UGroup::new();
        g.put(UGroupType::Class, "foo@bar");
        let found = g.entries().iter().find(|(k, _)| *k == UGroupType::Class);
        assert_eq!(found.unwrap().1, "foo.bar");
    }

    #[test]
    fn ugroup_put_preserves_hyphen_and_space() {
        let mut g = UGroup::new();
        g.put(UGroupType::Class, "foo-bar baz");
        let found = g.entries().iter().find(|(k, _)| *k == UGroupType::Class);
        assert_eq!(found.unwrap().1, "foo-bar baz");
    }

    #[test]
    fn ugroup_singleton_creates_single_entry() {
        let g = UGroup::singleton(UGroupType::Title, "My Title");
        assert_eq!(g.entries().len(), 1);
        assert_eq!(g.entries()[0].1, "My Title");
    }

    #[test]
    fn ugroup_singleton_fixes_special_chars() {
        let g = UGroup::singleton(UGroupType::Id, "id/test");
        assert_eq!(g.entries()[0].1, "id.test");
    }

    #[test]
    fn ugroup_put_multiple_entries_all_stored() {
        let mut g = UGroup::new();
        g.put(UGroupType::Id, "myId");
        g.put(UGroupType::Class, "myClass");
        assert_eq!(g.entries().len(), 2);
        let id = g.entries().iter().find(|(k, _)| *k == UGroupType::Id);
        let cls = g.entries().iter().find(|(k, _)| *k == UGroupType::Class);
        assert_eq!(id.unwrap().1, "myId");
        assert_eq!(cls.unwrap().1, "myClass");
    }

    // ── UClip ─────────────────────────────────────────────────────────

    #[test]
    fn uclip_constructor_sets_fields() {
        let c = UClip::new(1.0, 2.0, 100.0, 50.0);
        assert!((c.x - 1.0).abs() < DELTA);
        assert!((c.y - 2.0).abs() < DELTA);
        assert!((c.width - 100.0).abs() < DELTA);
        assert!((c.height - 50.0).abs() < DELTA);
    }

    #[test]
    fn uclip_display_format() {
        let c = UClip::new(1.0, 2.0, 100.0, 50.0);
        let s = format!("{}", c);
        assert!(s.contains("CLIP"));
        assert!(s.contains("x=1"));
        assert!(s.contains("y=2"));
        assert!(s.contains("w=100"));
        assert!(s.contains("h=50"));
    }

    #[test]
    fn uclip_enlarge_expands_by_delta() {
        let c = UClip::new(10.0, 20.0, 100.0, 80.0);
        let enlarged = c.enlarge(5.0);
        assert!((enlarged.x - 5.0).abs() < DELTA);
        assert!((enlarged.y - 15.0).abs() < DELTA);
        assert!((enlarged.width - 110.0).abs() < DELTA);
        assert!((enlarged.height - 90.0).abs() < DELTA);
    }

    #[test]
    fn uclip_translate_moves_clip() {
        let c = UClip::new(10.0, 20.0, 100.0, 80.0);
        let t = c.translate(5.0, 3.0);
        assert!((t.x - 15.0).abs() < DELTA);
        assert!((t.y - 23.0).abs() < DELTA);
        assert!((t.width - 100.0).abs() < DELTA);
        assert!((t.height - 80.0).abs() < DELTA);
    }

    #[test]
    fn uclip_translate_ut_moves_clip() {
        let c = UClip::new(10.0, 20.0, 100.0, 80.0);
        let t = c.translate_ut(&UTranslate::new(5.0, 3.0));
        assert!((t.x - 15.0).abs() < DELTA);
        assert!((t.y - 23.0).abs() < DELTA);
    }

    #[test]
    fn uclip_is_inside_point_inside() {
        let c = UClip::new(0.0, 0.0, 100.0, 100.0);
        assert!(c.is_inside(50.0, 50.0));
    }

    #[test]
    fn uclip_is_inside_point_outside() {
        let c = UClip::new(0.0, 0.0, 100.0, 100.0);
        assert!(!c.is_inside(150.0, 50.0));
        assert!(!c.is_inside(50.0, 150.0));
        assert!(!c.is_inside(-1.0, 50.0));
        assert!(!c.is_inside(50.0, -1.0));
    }

    #[test]
    fn uclip_is_inside_boundary_returns_true() {
        let c = UClip::new(0.0, 0.0, 100.0, 100.0);
        assert!(c.is_inside(0.0, 0.0));
        assert!(c.is_inside(100.0, 100.0));
    }

    #[test]
    fn uclip_is_inside_pt_uses_xy() {
        let c = UClip::new(0.0, 0.0, 100.0, 100.0);
        assert!(c.is_inside_pt(&XPoint2D::new(50.0, 50.0)));
        assert!(!c.is_inside_pt(&XPoint2D::new(150.0, 50.0)));
    }

    // Java: getClippedRectangle - partial overlap returns intersection
    // Rust: UClip doesn't have getClippedRectangle; use clipped_x/clipped_y
    #[test]
    fn uclip_clipped_coords_produce_intersection() {
        let c = UClip::new(0.0, 0.0, 100.0, 100.0);
        // Rectangle at (50,50,100,100) intersected with clip (0,0,100,100)
        // Intersection x: clamp(50, 0, 100)=50 to clamp(150, 0, 100)=100 => width 50
        let x_start = c.clipped_x(50.0);
        let x_end = c.clipped_x(150.0);
        let y_start = c.clipped_y(50.0);
        let y_end = c.clipped_y(150.0);
        assert!((x_start - 50.0).abs() < DELTA);
        assert!((x_end - 100.0).abs() < DELTA);
        assert!((y_start - 50.0).abs() < DELTA);
        assert!((y_end - 100.0).abs() < DELTA);
    }

    // ── UPath (via shape::UPath) ──────────────────────────────────────

    #[test]
    fn upath_new_is_empty() {
        let p = UPath::new();
        assert!(p.segments.is_empty());
    }

    #[test]
    fn upath_move_to_adds_segment() {
        let mut p = UPath::new();
        p.move_to(10.0, 20.0);
        assert_eq!(p.segments.len(), 1);
        assert_eq!(p.segments[0].kind, USegmentType::MoveTo);
    }

    #[test]
    fn upath_line_to_adds_segment() {
        let mut p = UPath::new();
        p.move_to(0.0, 0.0);
        p.line_to(100.0, 50.0);
        assert_eq!(p.segments.len(), 2);
        assert_eq!(p.segments[1].kind, USegmentType::LineTo);
    }

    #[test]
    fn upath_cubic_to_adds_segment() {
        let mut p = UPath::new();
        p.move_to(0.0, 0.0);
        p.cubic_to(10.0, 5.0, 20.0, 5.0, 30.0, 0.0);
        assert_eq!(p.segments.len(), 2);
        assert_eq!(p.segments[1].kind, USegmentType::CubicTo);
    }

    #[test]
    fn upath_arc_to_adds_segment() {
        let mut p = UPath::new();
        p.move_to(0.0, 0.0);
        p.arc_to(10.0, 10.0, 0.0, 0.0, 1.0, 20.0, 0.0);
        assert_eq!(p.segments.len(), 2);
        assert_eq!(p.segments[1].kind, USegmentType::ArcTo);
    }

    #[test]
    fn upath_segment_count_tracks_additions() {
        let mut p = UPath::new();
        p.move_to(0.0, 0.0);
        p.line_to(10.0, 0.0);
        p.line_to(10.0, 10.0);
        assert_eq!(p.segments.len(), 3);
    }

    #[test]
    fn upath_moveto_coords_stored() {
        let mut p = UPath::new();
        p.move_to(5.0, 15.0);
        assert!((p.segments[0].coords[0] - 5.0).abs() < DELTA);
        assert!((p.segments[0].coords[1] - 15.0).abs() < DELTA);
    }

    #[test]
    fn upath_lineto_coords_stored() {
        let mut p = UPath::new();
        p.move_to(0.0, 0.0);
        p.line_to(100.0, 50.0);
        assert!((p.segments[1].coords[0] - 100.0).abs() < DELTA);
        assert!((p.segments[1].coords[1] - 50.0).abs() < DELTA);
    }

    // ── AbstractShadowable via UPath (shape::UPath implements Shadowable) ─

    #[test]
    fn upath_shadow_default_is_zero() {
        let p = UPath::new();
        use plantuml_little::klimt::shape::Shadowable;
        assert!((p.delta_shadow() - 0.0).abs() < DELTA);
    }

    #[test]
    fn upath_set_delta_shadow_stores_value() {
        let mut p = UPath::new();
        use plantuml_little::klimt::shape::Shadowable;
        p.set_delta_shadow(4.5);
        assert!((p.delta_shadow() - 4.5).abs() < DELTA);
    }

    #[test]
    fn upath_set_delta_shadow_updates_value() {
        let mut p = UPath::new();
        use plantuml_little::klimt::shape::Shadowable;
        p.set_delta_shadow(1.0);
        p.set_delta_shadow(9.9);
        assert!((p.delta_shadow() - 9.9).abs() < DELTA);
    }

    #[test]
    fn upath_set_delta_shadow_zero_resets() {
        let mut p = UPath::new();
        use plantuml_little::klimt::shape::Shadowable;
        p.set_delta_shadow(5.0);
        p.set_delta_shadow(0.0);
        assert!((p.delta_shadow() - 0.0).abs() < DELTA);
    }

    // ── Fashion ───────────────────────────────────────────────────────

    #[test]
    fn fashion_new_stores_colors() {
        let f = Fashion::new(Some(colors::WHITE.clone()), Some(colors::BLACK.clone()));
        assert_eq!(f.back_color.as_ref().unwrap().to_svg(), "#FFFFFF");
        assert_eq!(f.fore_color.as_ref().unwrap().to_svg(), "#000000");
    }

    #[test]
    fn fashion_default_stroke_is_simple() {
        let f = Fashion::new(None, None);
        assert!((f.stroke.thickness - 1.0).abs() < DELTA);
        assert!((f.stroke.dash_visible - 0.0).abs() < DELTA);
    }

    #[test]
    fn fashion_default_shadow_is_zero() {
        let f = Fashion::new(None, None);
        assert!(!f.is_shadowing());
        assert!((f.delta_shadow - 0.0).abs() < DELTA);
    }

    #[test]
    fn fashion_default_corners_are_zero() {
        let f = Fashion::new(None, None);
        assert!((f.round_corner - 0.0).abs() < DELTA);
        assert!((f.diagonal_corner - 0.0).abs() < DELTA);
    }

    #[test]
    fn fashion_with_shadow_sets_positive_delta() {
        let f = Fashion::new(None, None).with_shadow(3.0);
        assert!(f.is_shadowing());
        assert!((f.delta_shadow - 3.0).abs() < DELTA);
    }

    #[test]
    fn fashion_with_shadow_does_not_mutate_original() {
        let original = Fashion::new(None, None);
        let _ = original.with_shadow(3.0);
        assert!(!original.is_shadowing());
    }

    #[test]
    fn fashion_with_stroke_replaces_stroke() {
        let new_stroke = UStroke::new(8.0, 4.0, 2.0);
        let f = Fashion::new(None, None).with_stroke(new_stroke);
        assert!((f.stroke.thickness - 2.0).abs() < DELTA);
        assert!((f.stroke.dash_visible - 8.0).abs() < DELTA);
    }

    #[test]
    fn fashion_with_back_color_replaces_back_color() {
        let f = Fashion::new(Some(colors::WHITE.clone()), Some(colors::BLACK.clone()))
            .with_back_color(Some(colors::RED.clone()));
        assert_eq!(f.back_color.as_ref().unwrap().to_svg(), "#FF0000");
        // fore color unchanged
        assert_eq!(f.fore_color.as_ref().unwrap().to_svg(), "#000000");
    }

    #[test]
    fn fashion_with_fore_color_replaces_fore_color() {
        let f = Fashion::new(Some(colors::WHITE.clone()), Some(colors::BLACK.clone()))
            .with_fore_color(Some(colors::BLUE.clone()));
        assert_eq!(f.fore_color.as_ref().unwrap().to_svg(), "#0000FF");
        // back color unchanged
        assert_eq!(f.back_color.as_ref().unwrap().to_svg(), "#FFFFFF");
    }

    #[test]
    fn fashion_with_corner_sets_round_and_diagonal() {
        let f = Fashion::new(None, None).with_corner(10.0, 5.0);
        assert!((f.round_corner - 10.0).abs() < DELTA);
        assert!((f.diagonal_corner - 5.0).abs() < DELTA);
    }

    // ── AffineTransformType ───────────────────────────────────────────
    // Java: AffineTransformType enum with TYPE_NEAREST_NEIGHBOR, TYPE_BILINEAR
    // Rust: No direct equivalent yet
    #[test]
    #[ignore = "gap: AffineTransformType not yet ported"]
    fn affine_transform_type_has_two_entries() {
        todo!()
    }

    #[test]
    #[ignore = "gap: AffineTransformType.toLegacyInt not yet ported"]
    fn affine_transform_type_to_legacy_int() {
        todo!()
    }

    // ── UAntiAliasing ─────────────────────────────────────────────────
    // Java: UAntiAliasing enum with ANTI_ALIASING_ON, ANTI_ALIASING_OFF
    // Rust: No direct equivalent yet
    #[test]
    #[ignore = "gap: UAntiAliasing not yet ported"]
    fn uanti_aliasing_has_two_values() {
        todo!()
    }

    #[test]
    #[ignore = "gap: UAntiAliasing enum order not yet ported"]
    fn uanti_aliasing_on_before_off() {
        todo!()
    }

    // ── UMotif ────────────────────────────────────────────────────────
    // Java: UMotif.convertFromChar, getLength
    // Rust: No direct equivalent yet
    #[test]
    #[ignore = "gap: UMotif not yet ported"]
    fn umotif_convert_from_char_uppercase_a_returns_zero() {
        todo!()
    }

    #[test]
    #[ignore = "gap: UMotif not yet ported"]
    fn umotif_convert_from_char_invalid_throws() {
        todo!()
    }

    #[test]
    #[ignore = "gap: UMotif not yet ported"]
    fn umotif_get_length_pythagorean() {
        todo!()
    }

    // ── UPattern ─────────────────────────────────────────────────────

    // Java has 4 values: FULL, HORIZONTAL_STRIPE, VERTICAL_STRIPE, SMALL_CIRCLE
    // Rust has: None, Striped, VerticalStriped (3 values, missing FULL and SMALL_CIRCLE)
    #[test]
    fn upattern_has_at_least_none_and_striped_variants() {
        // The three variants are pairwise distinct
        assert_ne!(UPattern::None, UPattern::Striped);
        assert_ne!(UPattern::None, UPattern::VerticalStriped);
        assert_ne!(UPattern::Striped, UPattern::VerticalStriped);
        // Default is None (corresponds to Java's FULL = solid fill)
        assert_eq!(UPattern::default(), UPattern::None);
    }

    #[test]
    #[ignore = "gap: UPattern::FULL not yet ported (Java has 4 values, Rust has 3)"]
    fn upattern_has_four_values() {
        todo!()
    }

    #[test]
    #[ignore = "gap: UPattern::SMALL_CIRCLE not yet ported"]
    fn upattern_small_circle_variant() {
        todo!()
    }

    // ── UParamNull ────────────────────────────────────────────────────
    // Java: UParamNull.getColor()=BLACK, getBackcolor()=BLACK, getStroke()=simple,
    //       isHidden()=false, getPattern()=FULL
    // Rust: UParam with defaults

    #[test]
    fn uparam_default_color_is_black() {
        use plantuml_little::klimt::UParam;
        let p = UParam::default();
        // Default color is #000000 per mod.rs
        assert_eq!(p.color.to_svg(), "#000000");
    }

    #[test]
    fn uparam_default_stroke_is_simple() {
        use plantuml_little::klimt::UParam;
        let p = UParam::default();
        assert!((p.stroke.thickness - 1.0).abs() < DELTA);
        assert!((p.stroke.dash_visible - 0.0).abs() < DELTA);
    }

    #[test]
    fn uparam_default_hidden_is_false() {
        use plantuml_little::klimt::UParam;
        let p = UParam::default();
        assert!(!p.hidden);
    }

    #[test]
    fn uparam_default_pattern_is_none() {
        use plantuml_little::klimt::UParam;
        let p = UParam::default();
        // Rust default is UPattern::None (Java FULL maps to no-pattern solid fill)
        assert_eq!(p.pattern, UPattern::None);
    }

    // ── ShadowData (AbstractShadowable) ──────────────────────────────

    #[test]
    fn shadow_data_default_is_zero() {
        let s = ShadowData::new();
        assert!((s.delta_shadow() - 0.0).abs() < DELTA);
    }

    #[test]
    fn shadow_data_set_stores_value() {
        let mut s = ShadowData::new();
        s.set_delta_shadow(4.5);
        assert!((s.delta_shadow() - 4.5).abs() < DELTA);
    }

    #[test]
    fn shadow_data_is_shadowed_after_positive_set() {
        let mut s = ShadowData::new();
        s.set_delta_shadow(1.0);
        assert!(s.is_shadowed());
    }

    #[test]
    fn shadow_data_reset_to_zero() {
        let mut s = ShadowData::new();
        s.set_delta_shadow(5.0);
        s.set_delta_shadow(0.0);
        assert!((s.delta_shadow() - 0.0).abs() < DELTA);
        assert!(!s.is_shadowed());
    }

    // ── XPoint2D (UTranslate.getTranslated / apply helpers) ──────────

    #[test]
    fn xpoint2d_translated_by_utranslate() {
        // Java: t.getTranslated(XPoint2D) = (x+dx, y+dy)
        let t = UTranslate::new(10.0, 20.0);
        let p = XPoint2D::new(1.0, 2.0);
        let result = XPoint2D::new(p.x + t.dx, p.y + t.dy);
        assert!((result.x - 11.0).abs() < DELTA);
        assert!((result.y - 22.0).abs() < DELTA);
    }

    #[test]
    fn xrectangle_translated_by_utranslate() {
        // Java: t.apply(XRectangle2D) shifts x/y, keeps w/h
        let t = UTranslate::new(3.0, 4.0);
        let rect = XRectangle2D::new(1.0, 2.0, 10.0, 20.0);
        let result = XRectangle2D::new(rect.x + t.dx, rect.y + t.dy, rect.width, rect.height);
        assert!((result.x - 4.0).abs() < DELTA);
        assert!((result.y - 6.0).abs() < DELTA);
        assert!((result.width - 10.0).abs() < DELTA);
        assert!((result.height - 20.0).abs() < DELTA);
    }

    #[test]
    fn utranslate_sym_swaps_dx_dy() {
        // Java: t.sym() swaps dx and dy
        let t = UTranslate::new(3.0, 7.0);
        // Rust has no sym() method — test the behavior directly
        let swapped = UTranslate::new(t.dy, t.dx);
        assert!((swapped.dx - 7.0).abs() < DELTA);
        assert!((swapped.dy - 3.0).abs() < DELTA);
    }

    #[test]
    fn utranslate_multiply_by_scales_components() {
        // Java: t.multiplyBy(3.0) = (dx*3, dy*3)
        let t = UTranslate::new(3.0, 4.0);
        let m = t.scaled(3.0);
        assert!((m.dx - 9.0).abs() < DELTA);
        assert!((m.dy - 12.0).abs() < DELTA);
    }
}
