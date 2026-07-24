# Markdown Conformance

本目录是 Markdown 标准数据导入与渲染对照测试套件。统一用例数据单独保存在
`tests/cases/_fixtures/`，这里仅保存执行工具、配置、浏览器宿主、依赖和运行产物。

## 目录职责

```text
tests/markdown-conformance/
  config/       数据源配置和统一用例 Schema
  importers/    各数据源 fixture 适配解析器
  scripts/      可直接执行的导入、校验和测试命令
  lib/          语义、视觉和报告实现
  browser/      生产 Web Renderer 浏览器测试宿主
  baselines/      已批准的失败用例 ID 基线
  artifacts/    本地与 Actions 运行产物（gitignore）
```

## CommonMark 数据导入

CommonMark 适配器解析 `commonmark/commonmark-spec` 仓库 `spec.txt` 中的规范 example 块。
导入过程固定源仓库 commit，并把统一 JSON 写入：

```text
tests/cases/_fixtures/commonmark/
  cases.json
  cases.json.license
  version.json
  NOTICE.md
```

从仓库根目录执行：

```powershell
node tests/markdown-conformance/scripts/import.mjs commonmark
node tests/markdown-conformance/scripts/validate.mjs commonmark
```

已有本地源仓库时可使用 `--source-dir <path>`；适配器仍会校验 `origin` 和固定 commit。

## 测试命令

安装隔离依赖和 Chromium：

```powershell
pnpm --dir tests/markdown-conformance install --frozen-lockfile
node tests/markdown-conformance/node_modules/playwright/cli.js install chromium
```

构建 Parser 后执行快速语义对照：

```powershell
cargo build -p supramark-markdown --bin supramark-markdown
node tests/markdown-conformance/scripts/run-commonmark.mjs
```

执行生产 Web Renderer DOM 与 Chromium 视觉对照：

```powershell
node tests/markdown-conformance/scripts/run-commonmark-visual.mjs
```

可设置：

- `SUPRAMARK_MARKDOWN_BIN`：指定 Parser CLI。
- `CASE_IDS`：逗号分隔的用例 ID，用于局部调试。
- `FAIL_ON_FAILURES=0`：生成失败报告但保持进程退出码为 0。
- `ARTIFACT_DIR`：指定本次输出目录，适合单条用例调试且不会覆盖完整报告。
- `VISUAL_PIXEL_THRESHOLD`、`VISUAL_MAX_DIFF_PIXELS`、`VISUAL_MAX_DIFF_RATIO`：视觉阈值。

## 报告

报告写入 `tests/markdown-conformance/artifacts/commonmark/`：

- `summary.md`：中文汇总和失败列表。
- `report.html`：中文可视化报告，并排显示预期、实际和差异图。
- `issue.md`：包含问题描述、复现步骤、预期结果和实际结果的 Issue 内容。
- `summary.json`、`failures.json`、`visual-failures.json`：机器可读结果。
- `visual/`：失败用例的 PNG 产物。
- `evidence/<用例 ID>/`：实际 AST、实际 HTML、预期及实际语义树。
- `evidence-index.json`：本次失败证据索引。

视觉测试使用主仓库默认 Rust Supramark Parser AST 和
`packages/renderers/web/src/Supramark.tsx` 生产 React Renderer。浏览器宿主只隔离图表引擎和
浏览器 WASM Parser，避免重复解析；最终 DOM 来自生产 Renderer。

GitHub Actions 工作流位于 `.github/workflows/commonmark-conformance.yml`。失败运行会上传完整
中文报告并生成 `issue.md`；启用 Issue 开关后会创建或更新聚合 Issue。Pull Request 只验证和上传产物。

手动运行工作流时可以配置三个开关：

- `create_issue`：失败后是否创建或更新聚合 Issue，默认开启。
- `run_visual`：是否执行浏览器视觉对照；关闭时只运行语义对照，默认开启。
- `fail_workflow`：存在未通过用例时是否将工作流标记为失败，默认开启。
- `issue_repository`：Issue 目标仓库，格式为 `owner/repo`；留空时使用当前仓库。

push 使用仓库 Actions Variables 控制相同行为：

- `COMMONMARK_AUTO_ISSUE=false`：禁止失败后创建或更新 Issue；未配置时开启。
- `COMMONMARK_RUN_VISUAL=false`：关闭视觉对照；未配置时开启。
- `COMMONMARK_FAIL_WORKFLOW=false`：失败时保留报告但不标红；未配置时标红。
- `COMMONMARK_ISSUE_REPOSITORY=owner/repo`：指定 Issue 目标仓库；未配置时使用当前仓库。

Pull Request 始终不会自动创建 Issue，即使 `COMMONMARK_AUTO_ISSUE=true`。

目标仓库与运行工作流的仓库相同时，默认 `github.token` 即可创建 Issue。跨仓库提交时，需要在运行工作流的仓库中配置
`COMMONMARK_ISSUE_TOKEN` Secret；该 Token 必须拥有目标仓库的 Issues 写权限。目标仓库还必须启用 Issues。

## 批准基线

批准基线位于 `tests/markdown-conformance/baselines/commonmark.json`，用于在 Issue 中区分新增失败、已恢复和持续失败。只有完整运行 652 条、视觉测试已执行且语义与视觉执行错误均为 0 时，才允许更新：

```powershell
node tests/markdown-conformance/scripts/update-commonmark-baseline.mjs
```

基线更新属于人工批准动作，不应在普通 Actions 运行中自动执行。
