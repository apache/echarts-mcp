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
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import { getChartBase64 } from './chart.js';
import { isTreelike, seriesTypes } from './util.js';
import { saveImage } from './storage.js';

dotenv.config();

class EChartsServer {
    constructor() {
        this.mcpServer = new McpServer(
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

        this.mcpServer.server.onerror = (error) => console.error('[MCP Error]', error);
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
        this.mcpServer.registerTool(
            'get-chart',
            {
                description: 'Generate an ECharts chart',
                inputSchema: z.object({
                    title: z.string()
                        .describe('Chart title'),
                    type: z.string()
                        .describe(`Chart type (${seriesTypes.join(', ')})`),
                    seriesName: z.string()
                        .describe('Series name that will be displayed in the legend'),
                    data: z.array(
                            z.union([
                                z.record(z.any()),
                                z.array(z.any())
                            ])
                        )
                        .describe(
                            'Chart data array. For example: [["A", 100], ["B", 200], ["C", 300]] for bar/line/pie/scatter charts, or [{ "name": "A", "value": 100, "children": [{ "name": "A1", "value": 40}, { "name": "A2", "value": 60}]}] for tree charts'
                        ),
                    xAxisName: z.string()
                        .optional()
                        .describe(
                            'Name of the first dimension (data) including unit, for bar/line/scatter/pie charts. For example, when data is [["Apple", 100], ["Banana", 200], ["Cherry", 300]], xAxisName should be "Fruit".'
                        ),
                    yAxisName: z.string()
                        .optional()
                        .describe(
                            'Name of the second dimension (data) including unit, for bar/line/scatter/pie charts. For example, when data is [["Apple", 100], ["Banana", 200], ["Cherry", 300]], yAxisName should be "Sales (USD)".'
                        ),
                }),
            },
            async ({ type, data, title, seriesName, xAxisName, yAxisName }) => {
                try {
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
        );
    }

    async run() {
        const useStdio = process.argv.includes('--stdio');

        if (useStdio) {
            const transport = new StdioServerTransport();
            await this.mcpServer.connect(transport);
            console.log('ECharts MCP Server running on stdio');
        } else {
            const app = express();
            app.use(express.json());

            app.get('/', (_, res) => {
                res.send('Apache ECharts MCP Server (Streamable HTTP) is running');
            });

            app.post('/mcp', async (req, res) => {
                const transport = new StreamableHTTPServerTransport();
                res.on('close', () => transport.close());
                await this.mcpServer.connect(transport);
                await transport.handleRequest(req, res, req.body);
            });

            const port = process.env.SERVER_PORT || 8081;
            app.listen(port, () => {
                console.log(`Apache ECharts MCP Server (Streamable HTTP) is running on port:`, port);
            });
        }
    }
}

const server = new EChartsServer();
server.run().catch(console.error);
