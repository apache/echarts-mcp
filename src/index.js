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

import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import fs from 'fs';

import { getChartBase64 } from './chart.js';
import { isTreelike, seriesTypes } from './util.js';
import { saveImage } from './storage.js';

dotenv.config();

class EChartsServer {
    constructor() {
        // Throw an error if there is no .env file
        if (!fs.existsSync('.env')) {
            throw new Error('Missing .env file. Please create a .env file with your configuration. See .env.example for reference.');
        }

        this.server = new Server(
            {
                name: 'echarts',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupToolHandlers();

        this.server.onerror = (error) => console.error('[MCP Error]', error);
    }

    validateChartType(type) {
        if (!seriesTypes.includes(type)) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Invalid chart type. Must be one of: ${seriesTypes.join(', ')}`
            );
        }
    }

    validateChartData(data, type) {
        if (isTreelike(type)) {
            if (data.length > 0 && data[0].value == null) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    type +
                        ' chart data should be like [["A", 100], ["B", 200], ["C", 300]] for bar/line/pie/scatter charts, or [{ "name": "A", "value": 100, "children": [{ "name": "A1", "value": 40}, { "name": "A2", "value": 60}]}]'
                );
            }
            return;
        }

        if (!Array.isArray(data)) {
            throw new McpError(ErrorCode.InvalidParams, 'Chart data must be an array. Input data: ' + JSON.stringify(data));
        }

        if (data.length > 1) {
            const firstRow = data[0];
            if (!Array.isArray(firstRow)) {
                throw new McpError(
                    ErrorCode.InvalidParams,
                    'Chart data must be an array of arrays. For example: [["A", 100], ["B", 200], ["C", 300]]'
                );
            }
        }
    }

    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'get-chart',
                    description: 'Generate an ECharts chart',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            title: {
                                type: 'string',
                                description: 'Chart title',
                            },
                            type: {
                                type: 'string',
                                description: `Chart type (${seriesTypes.join(', ')})`,
                            },
                            seriesName: {
                                type: 'string',
                                description: 'Series name that will be displayed in the legend',
                            },
                            data: {
                                type: 'array',
                                description:
                                    'Chart data array. For example: [["A", 100], ["B", 200], ["C", 300]] for bar/line/pie/scatter charts, or [{ "name": "A", "value": 100, "children": [{ "name": "A1", "value": 40}, { "name": "A2", "value": 60}]}] for tree charts',
                            },
                            xAxisName: {
                                type: 'string',
                                description:
                                    'Name of the first dimension (data[0]) including unit, for bar/line/scatter/pie charts. For example, when data is [["Apple", 100], ["Banana", 200], ["Cherry", 300]], xAxisName should be "Fruit".',
                            },
                            yAxisName: {
                                type: 'string',
                                description:
                                    'Name of the second dimension (data[1]) including unit, for bar/line/scatter/pie charts. For example, when data is [["Apple", 100], ["Banana", 200], ["Cherry", 300]], yAxisName should be "Sales (USD)".',
                            },
                        },
                        required: ['type', 'data', 'title', 'seriesName'],
                    },
                },
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name === 'get-chart') {
                try {
                    const { type, data, title, seriesName, xAxisName, yAxisName } = request.params.arguments;

                    this.validateChartType(type);
                    this.validateChartData(data, type);

                    const base64 = getChartBase64(type, data, title, seriesName, xAxisName, yAxisName);

                    try {
                        const url = await saveImage(base64);
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: url,
                                },
                            ],
                        };
                    } catch (error) {
                        console.error(error);
                        throw new McpError(ErrorCode.InternalError, 'Failed to save image');
                    }
                } catch (error) {
                    console.error(error);
                    if (error instanceof McpError) {
                        throw error;
                    }
                    throw new McpError(
                        ErrorCode.InternalError,
                        `Failed to generate chart: ${error?.message || 'Unknown error'}`
                    );
                }
            }
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        });
    }

    async run() {
        const app = express();
        const transports = {};

        app.get('/', (_, res) => {
            res.send('Apache ECharts MCP Server is running');
        });

        app.get('/sse', async (_, res) => {
            const transport = new SSEServerTransport('/messages', res);
            transports[transport.sessionId] = transport;
            res.on('close', () => {
                delete transports[transport.sessionId];
            });
            await this.server.connect(transport);
        });

        app.post('/messages', async (req, res) => {
            const sessionId = req.query.sessionId;
            const transport = transports[sessionId];
            if (!transport) {
                if (!res.headersSent) {
                    res.status(400).send('No transport found for sessionId. Please establish SSE connection first.');
                }
                return;
            }
            await transport.handlePostMessage(req, res);
        });

        const port = process.env.SERVER_PORT || 8081;
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    }
}

const server = new EChartsServer();
server.run().catch(console.error);
