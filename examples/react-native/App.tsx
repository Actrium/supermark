import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { Supramark } from '@supramark/rn';
// import { DiagramRenderProvider } from '@supramark/rn-diagram-worker'; // 临时注释掉以避免LRUCache问题
import type { SupramarkConfig } from '@supramark/core';
import {
  createCoreMarkdownFeatureConfig,
} from '@supramark/feature-core-markdown';
import {
  createGfmFeatureConfig,
} from '@supramark/feature-gfm';
import {
  createAdmonitionFeatureConfig,
} from '@supramark/feature-admonition';
import {
  createDefinitionListFeatureConfig,
} from '@supramark/feature-definition-list';
import {
  createHtmlPageFeatureConfig,
} from '@supramark/feature-html-page';
import {
  createMapFeatureConfig,
} from '@supramark/feature-map';
import {
  createDiagramVegaLiteFeatureConfig,
} from '@supramark/feature-diagram-vega-lite';
import {
  createDiagramEchartsFeatureConfig,
} from '@supramark/feature-diagram-echarts';
import { DEMOS } from '../demos';

// 添加全局错误处理
const originalError = console.error;
console.error = (...args) => {
  console.log('=== 详细错误信息 ===');
  console.log(JSON.stringify(args, null, 2));
  if (args[0] instanceof Error) {
    console.log('堆栈:', args[0].stack);
  }
  originalError(...args);
};

// 统一的 Supramark 配置示例：
// - 与 React Web 示例共享思路；
// - diagram 配置通过 DiagramRenderProvider + Supramark 同时生效。
const BASE_CONFIG: SupramarkConfig = {
  // 配置示例：只启用部分扩展，并通过 options 控制行为
  features: [
    // 启用基础 Markdown
    createCoreMarkdownFeatureConfig(true),
    // 启用 GFM，但只保留表格和任务列表，关闭删除线
    createGfmFeatureConfig(true, {
      tables: true,
      taskListItems: true,
      strikethrough: false,
    }),
    // 只允许 note / warning 两类 Admonition，其余 kind 将退化为普通段落
    createAdmonitionFeatureConfig(true, {
      kinds: ['note', 'warning'],
    }),
    // 定义列表使用“紧凑模式”，多个描述之间不额外插入空行
    createDefinitionListFeatureConfig(true, {
      compact: true,
    }),
    // HTML Page：启用 :::html 容器
    createHtmlPageFeatureConfig(true),
    // Map：启用 :::map 容器，宿主可根据 provider 选择地图实现
    createMapFeatureConfig(true, {
      provider: 'custom',
    }),
    // Diagram：显式启用 Vega-Lite / ECharts 图表特性
    createDiagramVegaLiteFeatureConfig(true),
    createDiagramEchartsFeatureConfig(true),
  ],

  diagram: {
    defaultTimeoutMs: 10000,
    defaultCache: {
      enabled: true,
      maxSize: 100,
      ttl: 300000,
    },
  },
};

type DemoId = 'basic' | 'headings' | 'lists' | 'code' | 'diagram';
type Theme = 'light' | 'dark';

interface DemoItem {
  id: DemoId;
  title: string;
  description: string;
  markdown: string;
}

function InnerApp() {
  const [activeId, setActiveId] = useState<DemoId | null>(null);
  const [theme, setTheme] = useState<Theme>('light');
  const activeDemo = activeId ? DEMOS.find((d) => d.id === activeId) ?? null : null;

  const isDark = theme === 'dark';
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  // 动态样式
  const containerStyle = [
    styles.container,
    isDark && { backgroundColor: '#0d1117' },
  ];
  const headerStyle = [
    styles.header,
    isDark && { borderBottomColor: '#30363d' },
  ];
  const titleStyle = [
    styles.title,
    isDark && { color: '#ffffff' },
  ];
  const subtitleStyle = [
    styles.subtitle,
    isDark && { color: '#8b949e' },
  ];
  const menuContentStyle = [
    styles.menuContent,
    isDark && { backgroundColor: '#0d1117' },
  ];
  const menuItemStyle = [
    styles.menuItem,
    isDark && { borderBottomColor: '#21262d' },
  ];
  const menuItemTitleStyle = [
    styles.menuItemTitle,
    isDark && { color: '#ffffff' },
  ];
  const menuItemDescStyle = [
    styles.menuItemDesc,
    isDark && { color: '#8b949e' },
  ];
  const themeButtonStyle = [
    styles.themeButton,
    isDark && { backgroundColor: '#21262d' },
  ];
  const themeButtonTextStyle = [
    styles.themeButtonText,
    isDark && { color: '#58a6ff' },
  ];

  // 菜单页：展示所有演示项列表
  if (!activeDemo) {
    return (
      <SafeAreaView style={containerStyle}>
        <View style={headerStyle}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={titleStyle}>supramark Demo</Text>
              <Text style={subtitleStyle}>选择要演示的类型，进入详情查看 markdown 与渲染结果。</Text>
            </View>
            <TouchableOpacity style={themeButtonStyle} onPress={toggleTheme}>
              <Text style={themeButtonTextStyle}>{isDark ? '☀️ Light' : '🌙 Dark'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView contentContainerStyle={menuContentStyle}>
          {DEMOS.map((demo) => (
            <TouchableOpacity
              key={demo.id}
              style={menuItemStyle}
              onPress={() => setActiveId(demo.id)}
            >
              <Text style={menuItemTitleStyle}>{demo.title}</Text>
              <Text style={menuItemDescStyle}>{demo.description}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 详情页：展示某一类型的 markdown 源与渲染结果
  const detailContentStyle = [
    styles.detailContent,
    isDark && { backgroundColor: '#0d1117' },
  ];
  const demoTitleStyle = [
    styles.demoTitle,
    isDark && { color: '#ffffff' },
  ];
  const demoDescriptionStyle = [
    styles.demoDescription,
    isDark && { color: '#8b949e' },
  ];
  const demoSectionTitleStyle = [
    styles.demoSectionTitle,
    isDark && { color: '#ffffff' },
  ];
  const sourceBlockStyle = [
    styles.sourceBlock,
    isDark && { backgroundColor: '#161b22', borderColor: '#30363d' },
  ];
  const sourceTextStyle = [
    styles.sourceText,
    isDark && { color: '#e0e0e0' },
  ];

  return (
    <SafeAreaView style={containerStyle}>
      <ScrollView contentContainerStyle={detailContentStyle}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={() => setActiveId(null)} style={styles.backButton}>
            <Text style={[styles.backButtonText, isDark && { color: '#58a6ff' }]}>‹ 返回</Text>
          </TouchableOpacity>
          <View style={styles.detailTitleWrap}>
            <Text style={demoTitleStyle}>{activeDemo.title}</Text>
            <Text style={demoDescriptionStyle}>{activeDemo.description}</Text>
          </View>
          <TouchableOpacity style={themeButtonStyle} onPress={toggleTheme}>
            <Text style={themeButtonTextStyle}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={demoSectionTitleStyle}>Markdown 源文本：</Text>
        <View style={sourceBlockStyle}>
          <Text style={sourceTextStyle}>{activeDemo.markdown}</Text>
        </View>
        <Text style={demoSectionTitleStyle}>渲染结果：</Text>
        <View style={styles.renderBlock}>
          <Supramark
            markdown={activeDemo.markdown}
            theme={theme}
            config={BASE_CONFIG}
            onOpenHtmlPage={(node) => {
              Alert.alert(
                node.title || 'HTML Page',
                '这里应该在宿主中打开独立 WebView。当前只是示意回调已触发。'
              );
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    // 临时注释掉DiagramRenderProvider以避免LRUCache兼容性问题
    // <DiagramRenderProvider diagramConfig={BASE_CONFIG.diagram}>
      <InnerApp />
    // </DiagramRenderProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
  },
  themeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    marginLeft: 12,
  },
  themeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2f54eb',
  },
  menuContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  menuItemDesc: {
    fontSize: 13,
    color: '#666',
  },
  detailContent: {
    flexGrow: 1,
    padding: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  backButton: {
    paddingRight: 12,
    paddingVertical: 4,
  },
  backButtonText: {
    fontSize: 14,
    color: '#2f54eb',
  },
  detailTitleWrap: {
    flex: 1,
  },
  demoTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  demoDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  demoSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  sourceBlock: {
    padding: 8,
    borderRadius: 4,
    backgroundColor: '#fafafa',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee',
  },
  sourceText: {
    fontFamily: 'Menlo',
    fontSize: 12,
  },
  renderBlock: {
    marginTop: 4,
  },
});
