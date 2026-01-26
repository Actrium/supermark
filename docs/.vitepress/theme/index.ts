// .vitepress/theme/index.ts
import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // 可以在此添加自定义布局插槽
    })
  },
  enhanceApp({ app, router, siteData }) {
    // 可以在此注册自定义组件或插件
  }
} satisfies Theme
