# AGENTS.md

本文件仅适用于 `tests/official-diagram-visual/` 目录下的官方图表视觉回归测试工具。

## 目录定位

这里是 Supramark 的独立 QA / 回归测试工具，用于把官方 D2、PlantUML、Mermaid、DOT / Graphviz、ECharts、Vega-Lite 示例与 Supramark 线上渲染结果进行对比。

本目录应保持自包含，不要影响主项目源码、Rust workspace、前端 package workspace 或现有构建流程。

## 修改边界

- 可以修改本目录内的用例、参考图、脚本、README、局部 `.gitignore`。
- 可以修改仓库根部 `.github/workflows/official-diagram-visual-regression.yml`，因为 GitHub Actions 必须从该目录识别 workflow。
- 不要因为维护本测试工具而修改 `crates/`、`packages/`、`examples/`、根 `package.json`、根 `Cargo.toml` 等主项目文件。
- 不要把运行产物提交到仓库。

## 常用命令

所有命令默认在本目录执行：

```bash
npm install
npm run visual:official-diagrams
```

常用环境变量：

```bash
SOURCE_DOCS=cases/official-diagram-rendering-cases.md
CASE_IDS=all
SUBMIT_GITHUB_ISSUES=0
PLAYWRIGHT_HEADLESS=1
PLAYWRIGHT_VIEWPORT=1280x900
```

本地需要可视化调试时，可以设置：

```bash
PLAYWRIGHT_HEADLESS=0
PLAYWRIGHT_VIEWPORT=2048x1096
```

## 产物规则

运行产物写入：

```text
artifacts/official-diagram-visual-workflow/
```

该目录不应提交。判断当前运行结果时，以以下文件为准：

- `artifacts/official-diagram-visual-workflow/summary.json`
- `artifacts/official-diagram-visual-workflow/report.html`
- `artifacts/official-diagram-visual-workflow/CURRENT_RUN_ARTIFACTS.json`
- `artifacts/official-diagram-visual-workflow/issues/CURRENT_ISSUES.md`

如果目录中存在未列入 `CURRENT_RUN_ARTIFACTS.json` 的旧文件，不要把它们视为当前运行结果。

## Issue 行为

- 只有 `status = fail` 的用例会提交 GitHub issue。
- `pass` 和 `review` 不提交 issue。
- 页面显示渲染失败或没有生成可渲染图形时，直接判定为 `fail`。
- 创建 issue 前会按标题查找已有 open issue，避免重复创建。
- Issue 内容使用中文，必须包含用例 ID、下拉框选择、失败原因、官方参考图、实际渲染截图或错误截图、复现代码。

## 视觉阈值

默认视觉阈值：

- `<= 16.000%`：通过
- `> 16.000%` 且 `< 30.000%`：人工复核
- `>= 30.000%`：不通过
- 高像素差异但感知哈希距离 `<= 8.000%` 时，降级为人工复核

结构性错误、语义缺失、几何异常和渲染失败不应只依赖像素阈值判断。

## 用例维护

- 用例 Markdown 放在 `cases/`。
- 官方参考 SVG 放在 `cases/assets/`。
- 新增用例时，必须保留官方来源和官方渲染 URL。
- 如果官方渲染 URL 是 HTML 示例页，不要把它当作 Markdown 图片嵌入；应使用本地官方参考 SVG 或生成的 expected PNG 作为图片。

## 删除约束

遵守仓库根部的删除约束：不要批量删除文件或目录。需要删除运行产物时，只能删除明确的单个文件；如果需要批量清理，停止并让用户手动处理。
