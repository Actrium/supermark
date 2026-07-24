# Imported Markdown fixtures

本目录只保存从外部标准数据源导入的统一测试用例，不包含导入脚本、测试运行器、依赖或报告产物。

目录约定：

```text
tests/cases/
  _fixtures/
    <source-name>/
      cases.json
      cases.json.license
      version.json
      NOTICE.md
```

当前数据源：

- `commonmark`：CommonMark 0.31.2，共 652 条规范用例。

用例的导入、校验、生产 Web Renderer 对照和中文报告工具位于
`tests/markdown-conformance/`。
