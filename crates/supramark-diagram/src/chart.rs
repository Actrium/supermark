use serde_json::Value;
use supramark_diagram_core::{DiagramEngine, DiagramError, RenderOutput};

const WIDTH: f64 = 640.0;
const HEIGHT: f64 = 400.0;
const LEFT: f64 = 64.0;
const RIGHT: f64 = 28.0;
const TOP: f64 = 56.0;
const BOTTOM: f64 = 64.0;
const COLORS: [&str; 8] = [
    "#4f7cff", "#21a67a", "#f59e0b", "#d14d72", "#7c3aed", "#0891b2", "#64748b", "#ef4444",
];

pub struct VegaLiteChartEngine;
pub struct EchartsChartEngine;
pub struct ChartJsEngine;

impl DiagramEngine for VegaLiteChartEngine {
    fn id(&self) -> &'static str {
        "vega-lite"
    }

    fn render(&self, source: &str) -> Result<RenderOutput, DiagramError> {
        let json = parse_json("vega-lite", source)?;
        let chart = chart_from_vega_lite(&json)?;
        Ok(RenderOutput::svg(render_chart_svg(&chart).into_bytes()))
    }
}

impl DiagramEngine for EchartsChartEngine {
    fn id(&self) -> &'static str {
        "echarts"
    }

    fn render(&self, source: &str) -> Result<RenderOutput, DiagramError> {
        let json = parse_json("echarts", source)?;
        let chart = chart_from_echarts(&json)?;
        Ok(RenderOutput::svg(render_chart_svg(&chart).into_bytes()))
    }
}

impl DiagramEngine for ChartJsEngine {
    fn id(&self) -> &'static str {
        "chartjs"
    }

    fn render(&self, source: &str) -> Result<RenderOutput, DiagramError> {
        let json = parse_json("chartjs", source)?;
        let chart = chart_from_chartjs(&json)?;
        Ok(RenderOutput::svg(render_chart_svg(&chart).into_bytes()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ChartKind {
    Bar,
    Line,
    Pie,
    Doughnut,
    Scatter,
}

#[derive(Debug, Clone)]
struct Series {
    name: String,
    kind: ChartKind,
    labels: Vec<String>,
    values: Vec<f64>,
}

#[derive(Debug, Clone)]
struct Chart {
    title: Option<String>,
    series: Vec<Series>,
}

#[derive(Debug, Clone, Copy)]
struct PlotScale {
    slot: f64,
    y_max: f64,
    plot_h: f64,
}

fn parse_json(engine: &'static str, source: &str) -> Result<Value, DiagramError> {
    serde_json::from_str(source).map_err(|e| DiagramError::Parse {
        engine,
        message: format!("JSON parse failed: {e}"),
    })
}

fn chart_from_vega_lite(value: &Value) -> Result<Chart, DiagramError> {
    let mark = value
        .get("mark")
        .and_then(|m| m.as_str().or_else(|| m.get("type").and_then(Value::as_str)))
        .unwrap_or("bar");
    let kind = parse_kind(mark);
    let values = value
        .get("data")
        .and_then(|d| d.get("values"))
        .and_then(Value::as_array)
        .ok_or_else(|| render_error("vega-lite", "expected data.values array"))?;
    let encoding = value
        .get("encoding")
        .ok_or_else(|| render_error("vega-lite", "expected encoding object"))?;
    let x_field = encoding
        .get("x")
        .and_then(|x| x.get("field"))
        .and_then(Value::as_str)
        .ok_or_else(|| render_error("vega-lite", "expected encoding.x.field"))?;
    let y_field = encoding
        .get("y")
        .and_then(|y| y.get("field"))
        .and_then(Value::as_str)
        .ok_or_else(|| render_error("vega-lite", "expected encoding.y.field"))?;

    let mut labels = Vec::new();
    let mut nums = Vec::new();
    for item in values {
        if let Some(obj) = item.as_object() {
            labels.push(value_label(obj.get(x_field)));
            nums.push(value_number(obj.get(y_field)).unwrap_or(0.0));
        }
    }
    ensure_values("vega-lite", &nums)?;

    Ok(Chart {
        title: title_text(value),
        series: vec![Series {
            name: y_field.to_string(),
            kind,
            labels,
            values: nums,
        }],
    })
}

fn chart_from_echarts(value: &Value) -> Result<Chart, DiagramError> {
    let title = value
        .get("title")
        .and_then(|t| t.get("text"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let categories = first_object(value.get("xAxis"))
        .and_then(|axis| axis.get("data"))
        .and_then(Value::as_array)
        .map(|items| labels_from_array(items))
        .unwrap_or_default();
    let series_values = value
        .get("series")
        .and_then(Value::as_array)
        .ok_or_else(|| render_error("echarts", "expected series array"))?;

    let mut series = Vec::new();
    for (idx, item) in series_values.iter().enumerate() {
        let Some(obj) = item.as_object() else {
            continue;
        };
        let kind = obj
            .get("type")
            .and_then(Value::as_str)
            .map(parse_kind)
            .unwrap_or(ChartKind::Line);
        let data = obj
            .get("data")
            .and_then(Value::as_array)
            .ok_or_else(|| render_error("echarts", "expected series.data array"))?;
        let (labels, nums) = data_labels_and_values(data, &categories);
        ensure_values("echarts", &nums)?;
        series.push(Series {
            name: obj
                .get("name")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("Series {}", idx + 1)),
            kind,
            labels,
            values: nums,
        });
    }

    if series.is_empty() {
        return Err(render_error("echarts", "no renderable series"));
    }
    Ok(Chart { title, series })
}

fn chart_from_chartjs(value: &Value) -> Result<Chart, DiagramError> {
    let kind = value
        .get("type")
        .and_then(Value::as_str)
        .map(parse_kind)
        .unwrap_or(ChartKind::Bar);
    let data = value
        .get("data")
        .ok_or_else(|| render_error("chartjs", "expected data object"))?;
    let labels = data
        .get("labels")
        .and_then(Value::as_array)
        .map(|items| labels_from_array(items))
        .unwrap_or_default();
    let datasets = data
        .get("datasets")
        .and_then(Value::as_array)
        .ok_or_else(|| render_error("chartjs", "expected data.datasets array"))?;

    let mut series = Vec::new();
    for (idx, dataset) in datasets.iter().enumerate() {
        let Some(obj) = dataset.as_object() else {
            continue;
        };
        let data = obj
            .get("data")
            .and_then(Value::as_array)
            .ok_or_else(|| render_error("chartjs", "expected dataset.data array"))?;
        let nums = data
            .iter()
            .map(|v| value_number(Some(v)).unwrap_or(0.0))
            .collect::<Vec<_>>();
        ensure_values("chartjs", &nums)?;
        series.push(Series {
            name: obj
                .get("label")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("Dataset {}", idx + 1)),
            kind: obj
                .get("type")
                .and_then(Value::as_str)
                .map(parse_kind)
                .unwrap_or(kind),
            labels: labels.clone(),
            values: nums,
        });
    }
    if series.is_empty() {
        return Err(render_error("chartjs", "no renderable dataset"));
    }
    Ok(Chart {
        title: chartjs_title(value),
        series,
    })
}

fn render_chart_svg(chart: &Chart) -> String {
    if chart
        .series
        .iter()
        .any(|s| matches!(s.kind, ChartKind::Pie | ChartKind::Doughnut))
    {
        render_pie_svg(chart)
    } else {
        render_cartesian_svg(chart)
    }
}

fn render_cartesian_svg(chart: &Chart) -> String {
    let plot_w = WIDTH - LEFT - RIGHT;
    let plot_h = HEIGHT - TOP - BOTTOM;
    let labels = chart
        .series
        .first()
        .map(|s| s.labels.as_slice())
        .unwrap_or(&[]);
    let max_value = chart
        .series
        .iter()
        .flat_map(|s| s.values.iter().copied())
        .fold(0.0_f64, f64::max)
        .max(1.0);
    let y_max = nice_max(max_value);

    let mut svg = svg_start();
    draw_title(&mut svg, chart.title.as_deref());
    svg.push_str(&format!(
        r##"<g class="axis" stroke="#94a3b8" stroke-width="1"><line x1="{LEFT}" y1="{TOP}" x2="{LEFT}" y2="{}"/><line x1="{LEFT}" y1="{}" x2="{}" y2="{}"/></g>"##,
        TOP + plot_h,
        TOP + plot_h,
        LEFT + plot_w,
        TOP + plot_h
    ));

    for i in 0..=4 {
        let ratio = f64::from(i) / 4.0;
        let y = TOP + plot_h - ratio * plot_h;
        let value = y_max * ratio;
        svg.push_str(&format!(
            r##"<line x1="{LEFT}" y1="{y:.2}" x2="{}" y2="{y:.2}" stroke="#e2e8f0" stroke-width="1"/><text x="{}" y="{:.2}" text-anchor="end" font-size="11" fill="#64748b">{}</text>"##,
            LEFT + plot_w,
            LEFT - 10.0,
            y + 4.0,
            fmt_num(value)
        ));
    }

    let count = labels.len().max(
        chart
            .series
            .iter()
            .map(|s| s.values.len())
            .max()
            .unwrap_or(0),
    );
    if count == 0 {
        svg.push_str("</svg>");
        return svg;
    }

    let slot = plot_w / count as f64;
    let scale = PlotScale {
        slot,
        y_max,
        plot_h,
    };
    let bar_series = chart
        .series
        .iter()
        .filter(|s| s.kind == ChartKind::Bar)
        .count()
        .max(1);
    for (series_idx, series) in chart.series.iter().enumerate() {
        let color = COLORS[series_idx % COLORS.len()];
        match series.kind {
            ChartKind::Line | ChartKind::Scatter => {
                draw_line_series(&mut svg, series, color, count, scale);
            }
            ChartKind::Bar => {
                let mut bar_idx = 0;
                for prior in chart.series.iter().take(series_idx) {
                    if prior.kind == ChartKind::Bar {
                        bar_idx += 1;
                    }
                }
                draw_bar_series(&mut svg, series, color, bar_idx, bar_series, scale);
            }
            ChartKind::Pie | ChartKind::Doughnut => {}
        }
    }

    for i in 0..count {
        let label = labels
            .get(i)
            .cloned()
            .unwrap_or_else(|| format!("{}", i + 1));
        let x = LEFT + slot * (i as f64 + 0.5);
        svg.push_str(&format!(
            r##"<text x="{x:.2}" y="{}" text-anchor="middle" font-size="11" fill="#475569">{}</text>"##,
            TOP + plot_h + 22.0,
            escape_xml(truncate_label(label, 12).as_str())
        ));
    }
    draw_legend(&mut svg, chart);
    svg.push_str("</svg>");
    svg
}

fn draw_bar_series(
    svg: &mut String,
    series: &Series,
    color: &str,
    bar_idx: usize,
    bar_series: usize,
    scale: PlotScale,
) {
    let group_w = scale.slot * 0.72;
    let bar_w = (group_w / bar_series as f64).max(4.0);
    for (i, value) in series.values.iter().copied().enumerate() {
        let h = (value.max(0.0) / scale.y_max) * scale.plot_h;
        let x =
            LEFT + scale.slot * i as f64 + (scale.slot - group_w) / 2.0 + bar_w * bar_idx as f64;
        let y = TOP + scale.plot_h - h;
        svg.push_str(&format!(
            r##"<rect x="{x:.2}" y="{y:.2}" width="{:.2}" height="{h:.2}" rx="3" fill="{color}"/>"##,
            bar_w * 0.86
        ));
    }
}

fn draw_line_series(
    svg: &mut String,
    series: &Series,
    color: &str,
    count: usize,
    scale: PlotScale,
) {
    let mut points = Vec::new();
    for (i, value) in series.values.iter().copied().enumerate() {
        let x = if count == 1 {
            LEFT + scale.slot * 0.5
        } else {
            LEFT + scale.slot * (i as f64 + 0.5)
        };
        let y = TOP + scale.plot_h - (value.max(0.0) / scale.y_max) * scale.plot_h;
        points.push((x, y));
    }
    if series.kind == ChartKind::Line && points.len() >= 2 {
        let d = points
            .iter()
            .enumerate()
            .map(|(i, (x, y))| {
                if i == 0 {
                    format!("M{x:.2},{y:.2}")
                } else {
                    format!("L{x:.2},{y:.2}")
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
        svg.push_str(&format!(
            r##"<path d="{d}" fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>"##
        ));
    }
    for (x, y) in points {
        svg.push_str(&format!(
            r##"<circle cx="{x:.2}" cy="{y:.2}" r="4" fill="#ffffff" stroke="{color}" stroke-width="2"/>"##
        ));
    }
}

fn render_pie_svg(chart: &Chart) -> String {
    let series = chart
        .series
        .iter()
        .find(|s| matches!(s.kind, ChartKind::Pie | ChartKind::Doughnut))
        .or_else(|| chart.series.first())
        .expect("chart has at least one series");
    let total: f64 = series.values.iter().map(|v| v.max(0.0)).sum();
    let mut svg = svg_start();
    draw_title(&mut svg, chart.title.as_deref());
    if total <= 0.0 {
        svg.push_str("</svg>");
        return svg;
    }
    let cx = 250.0;
    let cy = 215.0;
    let r = 112.0;
    let inner = if series.kind == ChartKind::Doughnut {
        58.0
    } else {
        0.0
    };
    let mut angle = -90.0_f64;
    for (i, value) in series.values.iter().copied().enumerate() {
        let sweep = value.max(0.0) / total * 360.0;
        let next = angle + sweep;
        let color = COLORS[i % COLORS.len()];
        svg.push_str(&pie_slice_path(cx, cy, r, inner, angle, next, color));
        angle = next;
    }
    let legend_x = 410.0;
    let mut legend_y = 126.0;
    for (i, label) in series.labels.iter().enumerate().take(10) {
        let color = COLORS[i % COLORS.len()];
        let value = series.values.get(i).copied().unwrap_or(0.0);
        let pct = if total > 0.0 {
            value / total * 100.0
        } else {
            0.0
        };
        svg.push_str(&format!(
            r##"<g><rect x="{legend_x}" y="{legend_y}" width="12" height="12" rx="2" fill="{color}"/><text x="{}" y="{}" font-size="13" fill="#334155">{} ({:.0}%)</text></g>"##,
            legend_x + 20.0,
            legend_y + 11.0,
            escape_xml(truncate_label(label.clone(), 22).as_str()),
            pct
        ));
        legend_y += 24.0;
    }
    svg.push_str("</svg>");
    svg
}

fn pie_slice_path(
    cx: f64,
    cy: f64,
    r: f64,
    inner: f64,
    start: f64,
    end: f64,
    color: &str,
) -> String {
    let sweep = (end - start).abs();
    if sweep >= 359.99 {
        if inner > 0.0 {
            return format!(
                r##"<circle cx="{cx}" cy="{cy}" r="{r}" fill="{color}"/><circle cx="{cx}" cy="{cy}" r="{inner}" fill="#ffffff"/>"##
            );
        }
        return format!(r##"<circle cx="{cx}" cy="{cy}" r="{r}" fill="{color}"/>"##);
    }
    let (sx, sy) = polar(cx, cy, r, start);
    let (ex, ey) = polar(cx, cy, r, end);
    let large = if sweep > 180.0 { 1 } else { 0 };
    if inner <= 0.0 {
        return format!(
            r##"<path d="M{cx:.2},{cy:.2} L{sx:.2},{sy:.2} A{r:.2},{r:.2} 0 {large},1 {ex:.2},{ey:.2} Z" fill="{color}"/>"##
        );
    }
    let (isx, isy) = polar(cx, cy, inner, start);
    let (iex, iey) = polar(cx, cy, inner, end);
    format!(
        r##"<path d="M{sx:.2},{sy:.2} A{r:.2},{r:.2} 0 {large},1 {ex:.2},{ey:.2} L{iex:.2},{iey:.2} A{inner:.2},{inner:.2} 0 {large},0 {isx:.2},{isy:.2} Z" fill="{color}"/>"##
    )
}

fn polar(cx: f64, cy: f64, r: f64, deg: f64) -> (f64, f64) {
    let rad = deg.to_radians();
    (cx + r * rad.cos(), cy + r * rad.sin())
}

fn draw_title(svg: &mut String, title: Option<&str>) {
    if let Some(title) = title.filter(|t| !t.trim().is_empty()) {
        svg.push_str(&format!(
            r##"<text x="32" y="34" font-size="20" font-weight="700" fill="#0f172a">{}</text>"##,
            escape_xml(title)
        ));
    }
}

fn draw_legend(svg: &mut String, chart: &Chart) {
    if chart.series.len() <= 1 {
        return;
    }
    let mut x = LEFT;
    let y = 374.0;
    for (idx, series) in chart.series.iter().enumerate() {
        let color = COLORS[idx % COLORS.len()];
        svg.push_str(&format!(
            r##"<g><rect x="{x:.2}" y="363" width="12" height="12" rx="2" fill="{color}"/><text x="{:.2}" y="{y}" font-size="12" fill="#334155">{}</text></g>"##,
            x + 18.0,
            escape_xml(truncate_label(series.name.clone(), 18).as_str())
        ));
        x += 130.0;
    }
}

fn svg_start() -> String {
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH:.0} {HEIGHT:.0}" width="{WIDTH:.0}" height="{HEIGHT:.0}" role="img"><rect width="100%" height="100%" rx="10" fill="#ffffff"/>"##
    )
}

fn title_text(value: &Value) -> Option<String> {
    value
        .get("title")
        .and_then(|t| t.as_str().or_else(|| t.get("text").and_then(Value::as_str)))
        .map(ToOwned::to_owned)
}

fn chartjs_title(value: &Value) -> Option<String> {
    value
        .pointer("/options/plugins/title/text")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

fn first_object(value: Option<&Value>) -> Option<&Value> {
    match value {
        Some(Value::Array(items)) => items.first(),
        Some(v) => Some(v),
        None => None,
    }
}

fn data_labels_and_values(data: &[Value], categories: &[String]) -> (Vec<String>, Vec<f64>) {
    let mut labels = Vec::new();
    let mut values = Vec::new();
    for (idx, item) in data.iter().enumerate() {
        match item {
            Value::Object(obj) => {
                labels.push(
                    obj.get("name")
                        .map(|v| value_label(Some(v)))
                        .unwrap_or_else(|| {
                            categories
                                .get(idx)
                                .cloned()
                                .unwrap_or_else(|| format!("{}", idx + 1))
                        }),
                );
                values.push(value_number(obj.get("value")).unwrap_or(0.0));
            }
            _ => {
                labels.push(
                    categories
                        .get(idx)
                        .cloned()
                        .unwrap_or_else(|| format!("{}", idx + 1)),
                );
                values.push(value_number(Some(item)).unwrap_or(0.0));
            }
        }
    }
    (labels, values)
}

fn labels_from_array(items: &[Value]) -> Vec<String> {
    items.iter().map(|v| value_label(Some(v))).collect()
}

fn value_label(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(v) => v.to_string(),
        None => String::new(),
    }
}

fn value_number(value: Option<&Value>) -> Option<f64> {
    match value? {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse().ok(),
        Value::Array(items) => items.first().and_then(|v| value_number(Some(v))),
        Value::Object(obj) => obj.get("value").and_then(|v| value_number(Some(v))),
        _ => None,
    }
}

fn parse_kind(kind: &str) -> ChartKind {
    match kind.to_ascii_lowercase().as_str() {
        "line" => ChartKind::Line,
        "pie" => ChartKind::Pie,
        "doughnut" | "donut" => ChartKind::Doughnut,
        "scatter" | "point" | "circle" => ChartKind::Scatter,
        _ => ChartKind::Bar,
    }
}

fn nice_max(value: f64) -> f64 {
    if value <= 0.0 {
        return 1.0;
    }
    let exp = value.log10().floor();
    let base = 10_f64.powf(exp);
    let n = value / base;
    let nice = if n <= 1.0 {
        1.0
    } else if n <= 2.0 {
        2.0
    } else if n <= 5.0 {
        5.0
    } else {
        10.0
    };
    nice * base
}

fn fmt_num(value: f64) -> String {
    if value.fract().abs() < 0.001 {
        format!("{value:.0}")
    } else {
        format!("{value:.1}")
    }
}

fn ensure_values(engine: &'static str, values: &[f64]) -> Result<(), DiagramError> {
    if values.is_empty() {
        Err(render_error(engine, "no numeric values found"))
    } else {
        Ok(())
    }
}

fn render_error(engine: &'static str, message: impl Into<String>) -> DiagramError {
    DiagramError::Render {
        engine,
        message: message.into(),
    }
}

fn truncate_label(label: String, max: usize) -> String {
    if label.chars().count() <= max {
        return label;
    }
    let mut out = label
        .chars()
        .take(max.saturating_sub(3))
        .collect::<String>();
    out.push_str("...");
    out
}

fn escape_xml(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}
