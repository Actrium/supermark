# Vison 架构设计与设计哲学

## 一、设计哲学

Vison 的设计核心在于 **“限制即自由”**。通过严格限制组件类型和样式子集，我们获得了跨端的一致性和极高的渲染性能。

### 1. 为什么选择 Flexbox？
Vison 的布局模型完全基于 Flexbox。这是因为：
- **工业标准**：Flexbox 是 Web 和移动端（React Native, Flutter）共同支持的布局语言。
- **确定性**：相比于 `float` 或 `absolute` 定位，Flexbox 在不同屏幕尺寸下的表现高度可预测。

### 2. 命名习惯：为什么借鉴 React Native 而非 Flutter？
虽然 Flutter 的 `MainAxisAlignment` 语义更严谨，但 Vison 选择了 React Native 的驼峰式命名（如 `flexDirection`, `justifyContent`）：
- **零转换开销**：在 React Native 中，这些属性可以被组件直接使用。
- **Web 映射简单**：可以非常直观地映射到标准的 CSS 属性。
- **生态兼容**：目前 AI 领域的 UI 渲染器大多基于 JavaScript/TypeScript 生态。

---

## 二、技术流程

1. **生成层 (Producer)**：AI 或业务后端根据 Vison 规范生成 JSON。
2. **校验层 (Validator)**：客户端接收 JSON，校验其嵌套深度、节点数及样式合法性。
3. **解析层 (Parser)**：将 JSON 转换为对应平台的虚拟 DOM 或组件树。
4. **渲染层 (Renderer)**：
   - **Web**: 映射为标准的 HTML 标签和 Inline CSS。
   - **RN**: 映射为 `View`, `Text`, `Image` 等原生组件。

---

## 三、性能优化建议

### 1. Streaming 渲染
Vison 支持流式渲染。由于规范要求必须输出完整的 JSON 块，建议渲染器实现 **“增量挂载”**，即：
- 当 JSON 数组 `children` 增加时，仅渲染新增的节点。

### 2. 布局锁定 (Layout Locking)
为了防止加载图片时页面抖动（CLS），Vison 强制要求 `image` 组件声明宽高或宽高比。渲染器应在图片加载前就预留好对应尺寸的占位空间。

---

## 四、安全性设计

- **AST 级 Markdown 解析**：不使用 `dangerouslySetInnerHTML`，通过解析 Markdown 语法树生成 React 组件，从根源上杜绝 XSS。
- **样式沙箱**：仅支持样式白名单，不支持任何可能执行脚本或引用外部资源的样式属性。
