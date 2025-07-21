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

export const seriesTypes = ['bar', 'line', 'pie', 'scatter', 'funnel', 'tree', 'treemap', 'sunburst'];

export function isTreelike(seriesType) {
    return seriesType === 'tree' || seriesType === 'treemap' || seriesType === 'sunburst';
}

/**
 * Get xAxis.data from user input data.
 * If data is not 2d, throw error.
 *
 * @param {object} data
 * @param {string} axisName
 * @return {
 *   type: 'category' | 'value',
 *   data: string[] | number[]
 * }
 */
export function getXData(data, axisName) {
    if (data.length === 0) {
        return [];
    }

    const firstRow = data[0];
    if (firstRow.length < 2) {
        throw new Error('Data must be 2d array');
    }

    const type = typeof firstRow[0] === 'string' ? 'category' : 'value';

    const xData = data.map((row) => row[0]);
    return {
        type,
        data: xData,
        name: axisName
    };
}

/**
 * Get yAxis.data from user input data.
 * If data is not 2d, throw error.
 *
 * @param {object} data
 * @param {string} axisName
 * @return {
 *   type: 'category' | 'value',
 *   data: string[] | number[]
 * }
 */
export function getYData(data, axisName) {
    if (data.length === 0) {
        return [];
    }

    const firstRow = data[0];
    if (firstRow.length < 2) {
        throw new Error('Data must be 2d array');
    }

    const type = typeof firstRow[1] === 'number' ? 'value' : 'category';

    const yData = type === 'value' ? null : data.map((row) => row[1]);
    return {
        type,
        data: yData,
        name: axisName
    };
}

/**
 * Get name-value data from user input data.
 * If data is not 2d, throw error.
 *
 * @param {object} data
 * @return {Array<{name: string, value: number}>}
 */
export function getNameValueData(data) {
    if (data.length === 0) {
        return [];
    }

    const firstRow = data[0];
    if (firstRow.length < 2) {
        throw new Error('Data must be 2d array');
    }

    const nameValueData = data.map((row) => ({
        name: row[0],
        value: row[1],
    }));

    return nameValueData;
}
