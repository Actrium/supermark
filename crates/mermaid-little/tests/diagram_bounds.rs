#![cfg(feature = "metrics-ttf-parser")]

use mermaid_little::convert_with_id;

#[derive(Debug)]
struct ForeignObject {
    text: String,
    width: f64,
    height: f64,
}

fn parse_number(value: &str) -> f64 {
    value
        .parse::<f64>()
        .unwrap_or_else(|e| panic!("parse float {value:?}: {e}"))
}

fn viewbox(svg: &str) -> [f64; 4] {
    let doc = roxmltree::Document::parse(svg).expect("valid svg");
    let svg_node = doc
        .descendants()
        .find(|n| n.has_tag_name("svg"))
        .expect("svg root");
    let value = svg_node.attribute("viewBox").expect("viewBox");
    let parts: Vec<f64> = value.split_whitespace().map(parse_number).collect();
    assert_eq!(parts.len(), 4, "viewBox should have four numbers");
    [parts[0], parts[1], parts[2], parts[3]]
}

fn foreign_objects(svg: &str) -> Vec<ForeignObject> {
    let doc = roxmltree::Document::parse(svg).expect("valid svg");
    doc.descendants()
        .filter(|n| n.has_tag_name("foreignObject"))
        .map(|node| ForeignObject {
            text: node
                .descendants()
                .filter_map(|n| n.text())
                .collect::<String>()
                .trim()
                .to_string(),
            width: parse_number(node.attribute("width").unwrap_or("0")),
            height: parse_number(node.attribute("height").unwrap_or("0")),
        })
        .collect()
}

#[test]
fn flowchart_html_labels_have_browser_line_height_and_bounds() {
    let source = r#"flowchart TD
    A[Write Markdown] --> B[Render Preview]
    B --> C{Review}
    C -->|Pass| D[Publish]
    C -->|Fail| A
"#;
    let svg = convert_with_id(source, "bounds-flowchart").expect("render flowchart");
    let vb = viewbox(&svg);
    assert_eq!(vb[0], 0.0);
    assert_eq!(vb[1], 0.0);
    assert!(vb[2] > 250.0, "flowchart viewBox is too narrow: {vb:?}");
    assert!(
        vb[3] > 410.0,
        "flowchart viewBox does not include the bottom node: {vb:?}"
    );

    let labels = foreign_objects(&svg);
    let non_empty: Vec<_> = labels.iter().filter(|fo| !fo.text.is_empty()).collect();
    assert_eq!(non_empty.len(), 6);
    for label in non_empty {
        assert!(
            label.height >= 24.0,
            "HTML label {:?} has clipped height {}",
            label.text,
            label.height
        );
        assert!(
            label.width > 0.0,
            "HTML label {:?} has no width",
            label.text
        );
    }

    for label in labels.iter().filter(|fo| fo.text.is_empty()) {
        assert_eq!(
            label.height, 0.0,
            "empty edge labels should not affect bounds"
        );
    }
}

#[test]
fn class_diagram_labels_have_browser_line_height_and_empty_edge_label_zero_height() {
    let source = r#"classDiagram
    class Workspace {
      +string id
      +string root
      +open()
      +status()
    }
    class MarkdownFile {
      +string path
      +render()
    }
    Workspace "1" --> "*" MarkdownFile
"#;
    let svg = convert_with_id(source, "bounds-class").expect("render class diagram");
    let vb = viewbox(&svg);
    assert_eq!(vb[0], 0.0);
    assert_eq!(vb[1], 0.0);
    assert!(vb[2] > 145.0, "class viewBox is too narrow: {vb:?}");
    assert!(vb[3] >= 400.0, "class viewBox is too short: {vb:?}");

    let labels = foreign_objects(&svg);
    let empty = labels
        .iter()
        .find(|fo| fo.text.is_empty())
        .expect("empty relation edge label placeholder");
    assert_eq!(empty.height, 0.0);

    for label in labels.iter().filter(|fo| !fo.text.is_empty()) {
        assert!(
            label.height >= 21.0,
            "class label {:?} has clipped height {}",
            label.text,
            label.height
        );
        assert!(
            label.width > 0.0,
            "class label {:?} has no width",
            label.text
        );
    }
}

#[test]
fn class_namespace_labels_do_not_use_jsdom_fixture_height() {
    let source = r#"classDiagram
namespace WorkspaceLayer {
  class Workspace
}
"#;
    let svg = convert_with_id(source, "bounds-class-namespace").expect("render class namespace");
    let labels = foreign_objects(&svg);
    let namespace = labels
        .iter()
        .find(|fo| fo.text.contains("WorkspaceLayer"))
        .expect("namespace label");
    assert!(
        namespace.height >= 21.0,
        "namespace label uses clipped fixture height {}",
        namespace.height
    );
}
