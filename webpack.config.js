/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

const path = require('path');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    mode: isProduction ? 'production' : 'development',
    entry: {
      document: path.join(__dirname, 'src/document/index.ts'),
      'package-managers/mvn/index': path.join(__dirname, 'src/package-managers/mvn/index.ts'),
      'package-managers/npm/index': path.join(__dirname, 'src/package-managers/npm/index.ts'),
      'package-managers/yarn/index': path.join(__dirname, 'src/package-managers/yarn/index.ts'),
      'package-managers/yarn3/index': path.join(__dirname, 'src/package-managers/yarn3/index.ts'),
      'package-managers/mvn/bump-deps': path.join(__dirname, 'src/package-managers/mvn/bump-deps.ts'),
      'package-managers/npm/bump-deps': path.join(__dirname, 'src/package-managers/npm/bump-deps.ts'),
      'package-managers/npm/parser': path.join(__dirname, 'src/package-managers/npm/parser.ts'),
      'package-managers/yarn/bump-deps': path.join(__dirname, 'src/package-managers/yarn/bump-deps.ts'),
      'package-managers/yarn/parser': path.join(__dirname, 'src/package-managers/yarn/parser.ts'),
      'package-managers/yarn3/bump-deps': path.join(__dirname, 'src/package-managers/yarn3/bump-deps.ts'),
      'package-managers/yarn3/parser': path.join(__dirname, 'src/package-managers/yarn3/parser.ts'),
    },
    output: {
      filename: '[name].js',
      path: path.join(__dirname, 'dist'),
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
            },
          },
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    plugins: [
      new webpack.ProgressPlugin(),
      new webpack.BannerPlugin({
        banner: '#!/usr/bin/env node',
        raw: true,
        include: /index\.js$/,
      }),
    ],
    target: 'node',
    node: {
      __dirname: false,
      __filename: false,
    },
    externals: {
      // Don't bundle node_modules in production
    },
    devtool: isProduction ? false : 'source-map',
    optimization: {
      minimize: isProduction,
    },
  };
};

