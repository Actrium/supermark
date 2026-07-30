const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

/**
 * Webpack config example - Supramark integration
 *
 * Supports development and production environments
 */

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    // Entry point
    entry: './src/index.tsx',

    // Output config
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      chunkFilename: isProduction ? '[name].[contenthash].chunk.js' : '[name].chunk.js',
      clean: true, // Clean the output directory before each build
      publicPath: '/',
    },

    // Module resolution
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
      // Make sure package.json exports resolve correctly
      conditionNames: ['import', 'require', 'default'],
    },

    // Module rules
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

        // Images and fonts
        {
          test: /\.(png|jpg|jpeg|gif|svg|woff|woff2|eot|ttf|otf)$/,
          type: 'asset/resource',
        },
      ],
    },

    // Plugins
    plugins: [
      // Generate the HTML file
      new HtmlWebpackPlugin({
        template: './public/index.html',
        inject: 'body',
      }),

      // Extract CSS (production only)
      ...(isProduction
        ? [
            new MiniCssExtractPlugin({
              filename: '[name].[contenthash].css',
              chunkFilename: '[name].[contenthash].chunk.css',
            }),
          ]
        : []),
    ],

    // Optimization
    optimization: {
      minimize: isProduction,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: true, // Strip console.log in production
            },
          },
        }),
        new CssMinimizerPlugin(),
      ],

      // Code splitting
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          // React and related libraries
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            name: 'react-vendor',
            priority: 20,
          },
          // Supramark library
          supramark: {
            test: /[\\/]node_modules[\\/](@supramark)[\\/]/,
            name: 'supramark',
            priority: 15,
          },
          // Other third-party libraries
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: 10,
          },
          // Common/shared modules
          common: {
            minChunks: 2,
            priority: 5,
            reuseExistingChunk: true,
          },
        },
      },

      // Runtime chunk
      runtimeChunk: {
        name: 'runtime',
      },
    },

    // Dev server
    devServer: {
      static: {
        directory: path.join(__dirname, 'public'),
      },
      port: 3000,
      hot: true,
      open: true,
      historyApiFallback: true, // SPA routing support
      compress: true,
    },

    // Source maps
    devtool: isProduction ? 'source-map' : 'eval-source-map',

    // Performance hints
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000,
    },

    // Stats output
    stats: {
      children: false,
      modules: false,
    },
  };
};
