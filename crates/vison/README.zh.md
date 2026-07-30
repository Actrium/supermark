# Vison

Vison 是一套专门为 AI 聊天场景设计的**纯视觉 JSON 描述规范**。它旨在解决 AI 消息在 Web 和 React Native（RN）端渲染不一致、样式难控制、以及安全性等问题。

## 核心目标

- **跨端一致性**：一套 JSON，在 Web 和 App 上拥有高度统一的视觉表现。
- **纯视觉描述**：剥离业务逻辑，仅关注 UI 结构。
- **高性能 & 安全**：极简的组件集合，严格的复杂度限制，原生支持 Streaming 渲染。

## 文档导航

- [**技术规范 (SPEC v1)**](./SPEC.zh.md) - 详细的 JSON 结构、组件白名单、样式规范及约束。
- [**架构设计 (ARCHITECTURE)**](./ARCHITECTURE.zh.md) - 设计哲学、渲染流程、以及为什么选择 Flexbox 等技术细节。

## 快速示例

```json
{
  "version": "1",
  "type": "container",
  "style": { "padding": 12, "backgroundColor": "#F5F5F5", "borderRadius": 8 },
  "children": [
    {
      "type": "text",
      "props": { "text": "Hello Vison" },
      "style": { "fontSize": 16, "fontWeight": "bold" }
    }
  ]
}
```

## 开源协议

MIT
