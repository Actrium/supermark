import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Supramark",
  description: "跨平台 Markdown 渲染引擎 - React Native & Web",

  base: '/supramark/',

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo.svg',

    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/getting-started' },
      { text: 'Features', link: '/features/' },
      { text: 'API 参考', link: '/api/' },
      { text: '示例', link: '/examples/' },
      { text: 'TypeDoc', link: '/typedoc/' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: '介绍',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '核心概念', link: '/guide/concepts' },
            { text: '架构设计', link: '/guide/architecture' },
          ]
        },
        {
          text: '使用指南',
          items: [
            { text: 'Web 端使用', link: '/guide/web' },
            { text: 'React Native 使用', link: '/guide/react-native' },
            { text: '配置选项', link: '/guide/configuration' },
          ]
        }
      ],

      '/features/': [
        {
          text: 'Feature 列表',
          items: [
            { text: '概览', link: '/features/' },
            { text: 'Core Markdown', link: '/features/core-markdown' },
            { text: 'GFM', link: '/features/gfm' },
            { text: 'Math', link: '/features/math' },
            { text: 'Admonition', link: '/features/admonition' },
            { text: 'Definition List', link: '/features/definition-list' },
            { text: 'Emoji', link: '/features/emoji' },
            { text: 'Footnote', link: '/features/footnote' },
          ]
        }
      ],

      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: '概览', link: '/api/' },
            { text: '@supramark/core', link: '/api/core' },
            { text: '@supramark/web', link: '/api/web' },
            { text: '@supramark/rn', link: '/api/rn' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/supramark/supramark' }
    ],

    footer: {
      message: 'Released under the Apache-2.0 License.',
      copyright: 'Copyright © 2024-present Supramark Team'
    },

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/supramark/supramark/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页'
    },

    lastUpdated: {
      text: '最后更新于',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'medium'
      }
    }
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    lineNumbers: true
  }
})
