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

## cmark-gfm 数据导入

cmark-gfm 适配器合并解析 `github/cmark-gfm` 仓库 `test/spec.txt` 的 672 条 GFM
规范用例，以及 `test/extensions.txt` 的 30 条额外扩展用例，共 702 条。数据源固定到
`0.29.0.gfm.13` 对应的完整 commit；每条用例保留真实 fixture 路径和独立编号空间，
并统一写入：

```text
tests/cases/_fixtures/cmark-gfm/
  cases.json
  cases.json.license
  version.json
  NOTICE.md
```

```powershell
node tests/markdown-conformance/scripts/import.mjs cmark-gfm
node tests/markdown-conformance/scripts/validate.mjs cmark-gfm
```

新增数据源时只需增加 source 配置和适配器；通用约定见 `config/sources/README.md`。

## 测试命令

安装隔离依赖和 Chromium：

```powershell
pnpm --dir tests/markdown-conformance install --frozen-lockfile
node tests/markdown-conformance/node_modules/playwright/cli.js install chromium
```

构建 Parser 后执行快速语义对照：

```powershell
cargo build -p supramark-markdown --bin supramark-markdown
node tests/markdown-conformance/scripts/run.mjs <source-name>
node tests/markdown-conformance/scripts/run-visual.mjs <source-name>
```

当前可直接运行 `commonmark` 和 `cmark-gfm`。例如：

```powershell
node tests/markdown-conformance/scripts/run.mjs cmark-gfm
node tests/markdown-conformance/scripts/run-visual.mjs cmark-gfm
```

原有 `run-commonmark.mjs` 与 `run-commonmark-visual.mjs` 保留为兼容入口。新增数据源只需提供配置、统一用例和导入适配器，不再新增专用运行脚本。

可设置：

- `SUPRAMARK_MARKDOWN_BIN`：指定 Parser CLI。
- `CASE_IDS`：逗号分隔的用例 ID，用于局部调试。
- `FAIL_ON_FAILURES=0`：生成失败报告但保持进程退出码为 0。
- `ARTIFACT_DIR`：指定本次输出目录，适合单条用例调试且不会覆盖完整报告。
- `VISUAL_PIXEL_THRESHOLD`、`VISUAL_MAX_DIFF_PIXELS`、`VISUAL_MAX_DIFF_RATIO`：视觉阈值。

## 报告

报告写入 `tests/markdown-conformance/artifacts/<source-name>/`：

- `summary.md`：中文汇总和失败列表。
- `report.html`：中文可视化报告，并排显示预期、实际和差异图。
- `issue.md`：包含问题描述、复现步骤、预期结果和实际结果的 Issue 内容。
- `issue-metadata.json`：记录数据源感知的 Issue 标题、稳定标记和标签。
- `summary.json`、`failures.json`、`visual-failures.json`：机器可读结果。
- `visual/`：失败用例的 PNG 产物。
- `evidence/<用例 ID>/`：实际 AST、实际 HTML、预期及实际语义树。
- `evidence-index.json`：本次失败证据索引。

视觉测试使用主仓库默认 Rust Supramark Parser AST 和
`packages/renderers/web/src/Supramark.tsx` 生产 React Renderer。浏览器宿主只隔离图表引擎和
浏览器 WASM Parser，避免重复解析；最终 DOM 来自生产 Renderer。

GitHub Actions 工作流位于 `.github/workflows/markdown-conformance.yml`。工作流先校验所选数据源，
再通过动态 matrix 为每个数据源独立导入、验证、对照、上传报告并维护聚合 Issue。失败运行会上传完整
中文报告并生成 `issue.md` 与 `issue-metadata.json`；启用 Issue 开关后会创建或更新聚合 Issue。Pull Request 只验证和上传产物。
Issue 标题格式为 `[<数据源显示名>] 验证结果问题：存在未通过用例`，并自动添加 `bug` 标签；稳定标记用于更新同一数据源已有的聚合 Issue。

手动运行工作流时可以配置：

- `sources`：执行的数据源；支持单个名称、逗号分隔的多个名称或 `all`。例如 `commonmark`、`cmark-gfm`、`commonmark,cmark-gfm`。
- `create_issue`：失败后是否创建或更新聚合 Issue，默认开启。
- `run_visual`：是否执行浏览器视觉对照；关闭时只运行语义对照，默认开启。
- `fail_workflow`：判定失败时是否将工作流标记为失败，默认开启。
- `gate_mode`：失败判定方式，`regression`（仅新增失败判失败，默认）或 `absolute`（存在未通过用例即判失败）；详见「失败判定」。
- `issue_repository`：Issue 目标仓库，格式为 `owner/repo`；留空时使用当前仓库。

push 使用仓库 Actions Variables 控制相同行为：

- `MARKDOWN_CONFORMANCE_SOURCES`：数据源名称、逗号分隔列表或 `all`；未配置时执行全部已配置数据源。
- `MARKDOWN_CONFORMANCE_AUTO_ISSUE=false`：禁止失败后创建或更新 Issue；未配置时开启。
- `MARKDOWN_CONFORMANCE_RUN_VISUAL=false`：关闭视觉对照；未配置时开启。
- `MARKDOWN_CONFORMANCE_FAIL_WORKFLOW=false`：失败时保留报告但不标红；未配置时标红。
- `MARKDOWN_CONFORMANCE_ISSUE_REPOSITORY=owner/repo`：指定 Issue 目标仓库；未配置时使用当前仓库。

原有 `COMMONMARK_AUTO_ISSUE`、`COMMONMARK_RUN_VISUAL`、`COMMONMARK_FAIL_WORKFLOW` 和
`COMMONMARK_ISSUE_REPOSITORY` 继续作为兼容配置生效。

Pull Request 始终不会自动创建 Issue，即使 `COMMONMARK_AUTO_ISSUE=true`。

目标仓库与运行工作流的仓库相同时，默认 `github.token` 即可创建 Issue。跨仓库提交时，需要在运行工作流的仓库中配置
`MARKDOWN_CONFORMANCE_ISSUE_TOKEN` Secret；原有 `COMMONMARK_ISSUE_TOKEN` 继续兼容。该 Token 必须拥有目标仓库的 Issues 写权限。目标仓库还必须启用 Issues。

## 批准基线

批准基线按数据源位于 `tests/markdown-conformance/baselines/<source-name>.json`，用于在 Issue 中区分新增失败、已恢复和持续失败，同时决定运行的退出码（见下节「失败判定」）。只有完整运行该数据源的全部用例、视觉测试已执行且语义与视觉执行错误均为 0 时，才允许更新：

```powershell
node tests/markdown-conformance/scripts/update-baseline.mjs <source-name>
```

原有 `update-commonmark-baseline.mjs` 保留为兼容入口。基线更新属于人工批准动作，不应在普通 Actions 运行中自动执行。

## 失败判定

退出码由「相对基线是否退步」决定，而不是「是否存在未通过用例」。数据源允许携带一批已知失败（cmark-gfm 起始为语义 58、视觉 29），若按绝对数量判定，main 会长期标红，而 PR 又无法得知自己是否让情况变坏。

默认 `regression` 模式下，以下三种情况判定为失败：

- 相对基线出现新增失败（`baseline.overall.added` 非空）；
- 存在执行错误（语义或视觉），意味着 parser 或测试框架本身出错，而不是用例结论不一致 —— panic 绝不能被当成「已知失败」吸收；
- 基线不可用（缺失、数据源不匹配、对照目标不匹配）。此时没有可比对的对象，静默通过等于报告了一次什么都没检查的绿色运行。这也让 `RUN_VISUAL=false` 变为显式失败：视觉运行与基线都以 `production-web-renderer-dom` 为对照目标，只跑语义会落到 `baseline-target-mismatch`。

判定结果写入 `summary.json` 的 `gate` 字段，并在运行日志中输出一行 `gate[...]: PASS/FAIL - <原因>`。

`workflow_dispatch` 的 `gate_mode` 输入或环境变量 `CONFORMANCE_GATE=absolute` 可切回按绝对数量判定；`FAIL_ON_FAILURES=0` 仍然是「只出报告、永不失败」的总开关。
