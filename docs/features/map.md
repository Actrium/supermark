# Map

> 地图卡片语法支持（:::map 容器）

# Map Feature

为 Supramark 提供「地图卡片」能力，用于在文档中描述一个地图视图（中心点 / 缩放 / 标记点），由宿主在 Web / React Native 中渲染为真实地图。

## 语法

使用 `:::map` 容器块：

```markdown
:::map
center: [34.05, -118.24]
zoom: 12
marker:
  lat: 34.05
  lng: -118.24
:::
```

- `center`：中心点 `[纬度, 经度]`（必填）；
- `zoom`：缩放级别（数值越大越放大）；
- `marker`：可选单个标记点坐标。

容器内部使用的是一个「接近 YAML 的迷你语法」，目前规则简单保守：

- 根级 key 从行首开始（无缩进），格式 `key: value`；
- `marker:` 可以有缩进行定义子字段 `lat` / `lng`；
- 解析失败的字段会被忽略或收集到 `meta` 中，不会抛异常。

## AST

解析后会生成一个块级 `map` 节点：

```ts
interface SupramarkMapMarker {
  lat: number;
  lng: number;
}

interface SupramarkMapNode extends SupramarkBaseNode {
  type: 'map';
  center: [number, number];            // [lat, lng]，必填
  zoom?: number;
  marker?: SupramarkMapMarker;
  meta?: Record<string, unknown>;      // 预留扩展字段
}
```

## 配置

Map Feature 的配置选项定义在 `@supramark/feature-map` 中：

```ts
import type { SupramarkConfig } from '@supramark/core';
import {
  createMapFeatureConfig,
  type MapFeatureOptions,
} from '@supramark/feature-map';

interface MapFeatureOptions {
  provider?: 'apple' | 'google' | 'mapbox' | 'custom';
  defaultZoom?: number;
}

const config: SupramarkConfig = {
  features: [
    // ...
    createMapFeatureConfig(true, {
      provider: 'custom',
      defaultZoom: 12,
    }),
  ],
};
```

当前阶段 Map 的配置主要用于运行时（Web / RN）选择具体地图 SDK，并为未指定 zoom 的节点提供默认缩放级别。

## 渲染

- **React Native**：`@supramark/rn` 默认渲染为一张「地图卡片」：
  - 展示中心点 / 缩放级别 / 标记点；
  - 真正的地图组件（`MapView` / WebView 等）由宿主根据 `provider` 与节点数据自行实现。
- **Web（React）**：`@supramark/web` 默认渲染为一个简单的说明卡片；
  - 后续可以在应用层根据 `map` 节点渲染实际地图组件。

## 与其他语法的关系

- Map 属于基于容器语法的 Feature，和 Admonition / Html Page 一样都经由 `core/src/syntax/container.ts` 这一层统一处理；
- 内部内容不会再被当作普通 Markdown 解析（是不透明容器），仅将结构化配置提取为 AST 字段。
