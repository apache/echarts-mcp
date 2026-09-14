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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Storage mode: 'local' or 'cloud'
 * Set via STORAGE_MODE env variable. Defaults to 'local'.
 */
const storageMode = process.env.STORAGE_MODE || 'local';

export async function saveImage(base64) {
    if (storageMode === 'cloud') {
        return saveImageToCloud(base64);
    }
    return saveImageLocally(base64);
}

// ─── Local Storage ───────────────────────────────────────────────────────────

const imagesDir = path.join(__dirname, '../images');

function ensureImagesDir() {
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
    }
}

async function saveImageLocally(base64) {
    ensureImagesDir();

    const fileName = getFilePrefix() + '.png';
    const filePath = path.join(imagesDir, fileName);

    try {
        const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        return filePath;
    } catch (error) {
        console.error('Failed to save image locally:', error);
        throw error;
    }
}

// ─── Cloud Storage (BaiduBCE BOS) ────────────────────────────────────────────

async function saveImageToCloud(base64) {
    const { BosClient } = await import('@baiducloud/sdk');

    const bosConfig = {
        endpoint: process.env.BOS_ENDPOINT,
        credentials: {
            ak: process.env.BOS_AK,
            sk: process.env.BOS_SK,
        },
    };

    const bucket = process.env.BOS_BUCKET || 'echarts-mcp';
    const cdnEndpoint = process.env.BOS_CDN_ENDPOINT;

    if (!bosConfig.endpoint || !bosConfig.credentials.ak || !bosConfig.credentials.sk) {
        throw new Error(
            'Cloud storage requires BOS_ENDPOINT, BOS_AK, and BOS_SK environment variables. ' +
            'Set STORAGE_MODE=local to use local storage instead.'
        );
    }

    const client = new BosClient(bosConfig);
    const fileName = getFilePrefix() + '.png';
    const key = `charts/${fileName}`;

    try {
        const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        await client.putObject(bucket, key, buffer, {
            'Content-Type': 'image/png',
        });

        const url = cdnEndpoint
            ? `${cdnEndpoint}/${key}`
            : `${bosConfig.endpoint}/${bucket}/${key}`;

        return url;
    } catch (error) {
        console.error('Failed to save image to cloud:', error);
        throw error;
    }
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function getFilePrefix() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');

    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return `${year}${month}${day}_${hour}${minute}${second}_${result}`;
}
