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
      index: path.join(__dirname, 'src/library.ts'),
      cli: path.join(__dirname, 'src/cli.ts'),
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
        include: /cli\.js$/,
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

