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

import bos from '@baiducloud/sdk';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tmpDir = path.join(__dirname, '../tmp');

// Create tmp directory if not exists
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
}

const config = {
    endpoint: process.env.BOS_ENDPOINT,
    credentials: {
        ak: process.env.BOS_AK,
        sk: process.env.BOS_SK,
    },
};

const client = new bos.BosClient(config);
const bucket = process.env.BOS_BUCKET;
const basePath = '/upload/echarts';

export async function saveImage(base64) {
    const fileName = getFilePrefix() + '.png';
    const key = `${basePath}/${fileName}`;
    const tmpPath = path.join(tmpDir, fileName);

    try {
        // Remove Base64 prefix if exists
        const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
        // Save base64 to tmp file
        fs.writeFileSync(tmpPath, Buffer.from(base64Data, 'base64'));

        // Upload file
        await client.putObjectFromFile(bucket, key, tmpPath);
        return process.env.BOS_CDN_ENDPOINT + key;
    } catch (error) {
        console.error('Upload failed:', error);
        throw error;
    } finally {
        // Remove tmp file
        if (fs.existsSync(tmpPath)) {
            fs.unlinkSync(tmpPath);
        }
    }
}

function getFilePrefix() {
    // Datetime + 10 random characters
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();

    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return `${year}${month}${day}${hour}${minute}${second}${result}`;
}
