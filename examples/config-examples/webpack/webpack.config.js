const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

/**
 * Webpack 配置示例 - Supramark 集成
 *
 * 支持开发和生产环境
 */

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    // 入口文件
    entry: './src/index.tsx',

    // 输出配置
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      chunkFilename: isProduction ? '[name].[contenthash].chunk.js' : '[name].chunk.js',
      clean: true, // 构建前清理输出目录
      publicPath: '/',
    },

    // 模块解析
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
      // 确保正确解析 package.json exports
      conditionNames: ['import', 'require', 'default'],
    },

    // 模块规则
    module: {
      rules: [
        // TypeScript / JavaScript
        {
          test: /\.(ts|tsx|js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/preset-env',
                ['@babel/preset-react', { runtime: 'automatic' }],
                '@babel/preset-typescript',
              ],
            },
          },
        },

        // CSS
        {
          test: /\.css$/,
          use: [
            isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader',
          ],
        },

        // 图片和字体
        {
          test: /\.(png|jpg|jpeg|gif|svg|woff|woff2|eot|ttf|otf)$/,
          type: 'asset/resource',
        },
      ],
    },

    // 插件
    plugins: [
      // 生成 HTML 文件
      new HtmlWebpackPlugin({
        template: './public/index.html',
        inject: 'body',
      }),

      // 提取 CSS（生产环境）
      ...(isProduction
        ? [
            new MiniCssExtractPlugin({
              filename: '[name].[contenthash].css',
              chunkFilename: '[name].[contenthash].chunk.css',
            }),
          ]
        : []),
    ],

    // 优化配置
    optimization: {
      minimize: isProduction,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: true, // 生产环境移除 console.log
            },
          },
        }),
        new CssMinimizerPlugin(),
      ],

      // 代码分割
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          // React 相关库
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            name: 'react-vendor',
            priority: 20,
          },
          // Supramark 库
          supramark: {
            test: /[\\/]node_modules[\\/](@supramark)[\\/]/,
            name: 'supramark',
            priority: 15,
          },
          // 其他第三方库
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: 10,
          },
          // 公共模块
          common: {
            minChunks: 2,
            priority: 5,
            reuseExistingChunk: true,
          },
        },
      },

      // 运行时 chunk
      runtimeChunk: {
        name: 'runtime',
      },
    },

    // 开发服务器
    devServer: {
      static: {
        directory: path.join(__dirname, 'public'),
      },
      port: 3000,
      hot: true,
      open: true,
      historyApiFallback: true, // SPA 路由支持
      compress: true,
    },

    // Source maps
    devtool: isProduction ? 'source-map' : 'eval-source-map',

    // 性能提示
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000,
    },

    // 统计信息
    stats: {
      children: false,
      modules: false,
    },
  };
};
