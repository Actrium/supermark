# @supramark/feature-weather

天气卡片容器，支持 JSON/YAML/TOON 配置格式。

## 语法

```markdown
:::weather [format]
配置内容
:::
```

`format` 可选值：`json`、`yaml`（默认）、`toon`

## 示例

### YAML 格式（默认）

```markdown
:::weather yaml
location: Beijing
units: metric
:::
```

### JSON 格式

```markdown
:::weather json
{
  "location": "Tokyo",
  "units": "metric"
}
:::
```

### TOON 格式

TOON 是一种紧凑的表格式数据格式：

```markdown
:::weather toon
location: London
units: imperial
:::
```

TOON 也支持数组数据：

```
key[count]{field1,field2,...}:
  val1,val2,...
  val1,val2,...
```

## 配置项

| 字段 | 类型 | 说明 |
|------|------|------|
| `location` | string | **必填** 城市/位置名称 |
| `units` | `"metric"` \| `"imperial"` | 温度单位：摄氏（默认）或华氏 |
| `showForecast` | boolean | 是否显示天气预报 |
| `days` | number | 预报天数 |

## 渲染效果

Weather 卡片会显示：
- 📍 位置名称
- 🌡️ 当前温度
- ☀️/☁️/🌧️ 天气图标
- 💧 湿度
- 💨 风速

## 安装

```bash
pnpm add @supramark/feature-weather
```

## 使用

```typescript
import { weatherFeature } from '@supramark/feature-weather';

// 注册解析器
weatherFeature.registerParser();
```
