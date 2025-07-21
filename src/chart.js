/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/

import * as echarts from 'echarts';
import { createCanvas/*, registerFont */ } from 'canvas';

import { getNameValueData, getXData, getYData } from './util.js';

// This is an example of how to register a custom font.
// registerFont('./font/xxx.otf', {
//     family: 'xxx',
//     weight: 'bold',
// });

// This is an example of how to use a custom theme.
// echarts.registerTheme('custom', {
//     backgroundColor: '#ccc',
//     ...
// });


export function getChartOption(type, data, title, seriesName, xAxisName, yAxisName) {
    const option = {
        title: {
            text: title || 'Chart',
        },
        series: [
            {
                type,
                data,
                name: seriesName,
            },
        ],
    };

    const series = option.series[0];

    switch (type) {
        case 'pie':
        case 'funnel':
            series.data = getNameValueData(data);
            break;
    }

    if (['line', 'bar', 'scatter'].includes(type)) {
        const xAxis = getXData(data, xAxisName);
        const yAxis = getYData(data, yAxisName);
        option.xAxis = xAxis;
        option.yAxis = yAxis;

        series.label =
            data.length < 16
                ? {
                      show: true,
                  }
                : null;
    }

    series.animation = false;

    return option;
}

export function getChartBase64(type, data, title, seriesName, xAxisName, yAxisName) {
    // Create canvas
    const canvas = createCanvas(800, 600);

    // Initialize ECharts
    let chart = echarts.init(canvas, 'custom');

    // Set chart options
    const option = getChartOption(type, data, title, seriesName, xAxisName, yAxisName);
    chart.setOption(option);

    // Return base64 image
    const url = canvas.toDataURL();

    // Dispose the chart instance
    chart.dispose();
    chart = null;

    return url;
}
