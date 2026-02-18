# Code Review: echarts-mcp

> Tanggal review: 2026-02-18
> Branch: internal
> Reviewer: Claude Code (claude-sonnet-4-6)

---

## Ringkasan Proyek

**echarts-mcp** adalah implementasi MCP (Model Context Protocol) server untuk Apache ECharts. Server ini memungkinkan LLM (seperti Claude) untuk membuat visualisasi data berupa chart, dengan cara:

1. LLM mengirim parameter chart (tipe, data, judul, dll.) ke MCP server
2. Server me-render chart server-side menggunakan ECharts + node-canvas
3. Gambar di-upload ke Baidu Cloud Object Storage (BOS)
4. URL CDN dikembalikan ke LLM sebagai hasil

Proyek berada di bawah **Apache License 2.0** (ASF incubation).

---

## Struktur Proyek

```
echarts-mcp/
├── src/
│   ├── index.js     # Entry point: Express + MCP server, tool handler
│   ├── chart.js     # Rendering ECharts ke canvas → base64
│   ├── util.js      # Helper transformasi data
│   └── storage.js   # Upload gambar ke Baidu BOS
├── .env.exmaple     # ⚠ Typo (seharusnya .env.example)
├── package.json
└── README.md
```

**Ukuran kodebase:** ~250 baris kode efektif — sangat ringkas.

---

## Arsitektur & Alur Kerja

```
LLM → MCP Client → SSE → EChartsServer
                            │
                    validateChartType()
                    validateChartData()
                            │
                    getChartBase64()        ← echarts + node-canvas (800×600)
                            │
                    saveImage(base64)       ← Baidu BOS upload
                            │
                    return CDN URL → LLM
```

### Transport
Menggunakan **SSE (Server-Sent Events)** via Express:
- `GET /sse` — membuka koneksi SSE dan membuat transport session
- `POST /messages?sessionId=...` — menerima pesan MCP dari client

---

## Analisis Per File

### `src/index.js`

**Kelebihan:**
- Registrasi tool MCP yang bersih dan deklaratif (`ListToolsRequestSchema`)
- Validasi dilakukan sebelum rendering, memisahkan concern dengan baik
- Error handling konsisten menggunakan `McpError` dari SDK
- Session management transport sudah benar (cleanup saat koneksi tutup)

**Masalah:**

```js
// index.js:36
if (!fs.existsSync('.env')) {
    throw new Error('Missing .env file...');
}
```
> Path `.env` bersifat relatif terhadap **CWD proses**, bukan direktori file. Jika server dijalankan dari direktori lain, validasi ini gagal meski `.env` sudah ada.

```js
// index.js:82-90
if (data.length > 1) {
    const firstRow = data[0];
    if (!Array.isArray(firstRow)) { ... }
}
```
> Validasi hanya berjalan jika `data.length > 1`. Jika data berisi tepat 1 elemen dan bukan array, validasi ini di-skip.

---

### `src/chart.js`

**Kelebihan:**
- `chart.dispose()` dipanggil setelah rendering — tidak ada memory leak pada instance ECharts
- Label otomatis disembunyikan jika data > 15 item (UX yang baik)
- Ada komentar contoh untuk custom font dan custom theme

**Masalah:**

```js
// chart.js:82
const canvas = createCanvas(800, 600);
```
> Ukuran canvas di-hardcode 800×600. Tidak bisa dikustomisasi via parameter atau env variable.

```js
// chart.js:85
let chart = echarts.init(canvas, 'custom');
```
> Theme `'custom'` di-pass tapi tidak pernah di-register (kode `registerTheme` di-comment). Ini kemungkinan tidak menyebabkan error (ECharts fallback ke default), tapi misleading.

```js
// chart.js:92
const url = canvas.toDataURL();
chart.dispose(); // dipanggil setelah, bukan di finally
```
> Jika `toDataURL()` melempar exception, `chart.dispose()` tidak akan dipanggil. Pattern yang lebih aman menggunakan `try/finally`.

---

### `src/util.js`

**Kelebihan:**
- File paling bersih — JSDoc lengkap di semua fungsi
- Logika type inference (string → category, number → value) sederhana dan tepat
- `getNameValueData` menghasilkan format `{name, value}` yang dibutuhkan ECharts pie/funnel

**Masalah:**

```js
// util.js:78-80
const yData = type === 'value' ? null : data.map((row) => row[1]);
return { type, data: yData, name: axisName };
```
> Jika `type === 'value'`, `yData` di-set `null`. ECharts seharusnya fine dengan ini (numeric axis tidak butuh explicit data), tapi mengirim `data: null` ke ECharts kurang eksplisit. Lebih baik di-omit key-nya.

---

### `src/storage.js`

**Kelebihan:**
- `try/finally` memastikan file tmp selalu dibersihkan, bahkan jika upload gagal
- Nama file cukup unik: timestamp + 10 karakter random alphanumeric

**Masalah:**

```js
// storage.js:45
const client = new bos.BosClient(config);
```
> Client BOS diinisialisasi di **module level** (saat import), bukan di dalam fungsi. Jika env variable belum ter-load saat module pertama kali di-import, konfigurasi bisa undefined.

```js
// storage.js:62
return process.env.BOS_CDN_ENDPOINT + key;
```
> Concatenation string langsung tanpa validasi. Jika `BOS_CDN_ENDPOINT` undefined (env tidak di-set), hasilnya `"undefined/upload/echarts/..."`.

```js
// storage.js:86
result += chars[Math.floor(Math.random() * chars.length)];
```
> Menggunakan `Math.random()` (non-cryptographic). Untuk nama file yang dimaksudkan unik, `crypto.randomBytes()` lebih aman dan menjamin distribusi yang lebih baik.

**Hard-coupling:** Storage layer sepenuhnya terikat pada Baidu BOS. Meski README menyebutkan ini bisa diganti, tidak ada abstraksi (interface/adapter) yang memudahkan penggantian storage provider.

---

## Temuan Lain

### Typo di nama file
```
.env.exmaple  →  seharusnya  .env.example
```
README sudah merujuk ke `.env.example` (ejaan benar), tapi file aktualnya salah eja. Ini menyebabkan instruksi `cp .env.example .env` gagal.

### Tidak ada transport stdio
MCP server umumnya mendukung dua mode transport: **SSE** (untuk remote/HTTP) dan **stdio** (untuk local/embedded). Proyek ini hanya mendukung SSE. Mayoritas MCP client lokal (seperti Claude Desktop) menggunakan stdio.

### Tidak ada test sama sekali
Tidak ada unit test, integration test, atau fixture data. Mengingat ini proyek referensi dari Apache, kehadiran test akan sangat membantu kontributor.

### Tidak ada rate limiting
Express server tanpa middleware rate limiting. Siapa pun yang bisa akses server bisa memicu chart rendering + cloud upload tanpa batas.

### Dependency yang tidak konsisten
`package-lock.json` mencantumkan `lodash` (dari dependabot bump), tapi `package.json` tidak mendaftarkan `lodash` sebagai dependency langsung.

### `package.json` field kosong
```json
"author": "",
```
Kosong untuk proyek Apache yang seharusnya punya author atau organization.

---

## Matriks Penilaian

| Aspek | Nilai | Catatan |
|-------|-------|---------|
| Kesederhanaan kode | ★★★★★ | Hanya 4 file, ~250 baris |
| Arsitektur | ★★★★☆ | Pemisahan concern baik, tapi storage tightly coupled |
| Validasi input | ★★★☆☆ | Ada, tapi ada celah edge case |
| Error handling | ★★★☆☆ | Konsisten di index.js, lemah di chart.js |
| Testing | ★☆☆☆☆ | Tidak ada sama sekali |
| Dokumentasi | ★★★★☆ | README cukup informatif, diskusi pendekatan bagus |
| Keamanan | ★★☆☆☆ | Tidak ada rate limiting, Math.random untuk filename |
| Portabilitas | ★★☆☆☆ | Hard-lock ke Baidu BOS, hanya SSE transport |

---

## Rekomendasi Prioritas

### Kritikal
1. **Perbaiki typo** `.env.exmaple` → `.env.example`
2. **Pindahkan inisialisasi BOS client** ke dalam fungsi atau lazy-init untuk menghindari env belum ter-load
3. **Validasi `BOS_CDN_ENDPOINT`** sebelum concatenation, atau gunakan URL constructor

### Penting
4. **Tambah stdio transport** agar kompatibel dengan Claude Desktop dan MCP client lokal lainnya
5. **Bungkus `toDataURL()` dalam try/finally** di `chart.js` untuk pastikan `chart.dispose()` selalu terpanggil
6. **Perbaiki validasi data** — tangani kasus `data.length === 1` yang bukan array

### Nice-to-have
7. **Abstraksi storage layer** — buat interface sederhana agar mudah ganti provider (S3, GCS, local, dll.)
8. **Buat canvas size configurable** via env variable atau parameter tool
9. **Tambah unit test** minimal untuk `util.js` dan `chart.js`
10. **Tambah rate limiting** via `express-rate-limit` atau middleware serupa
11. **Register atau hapus referensi theme `'custom'`** di `chart.js`

---

## Kesimpulan

**echarts-mcp** adalah proof-of-concept yang bersih dan mudah dipahami untuk mengintegrasikan ECharts dengan ekosistem MCP. Pendekatan "minimal parameters" yang dipilih (disebutkan di README) adalah keputusan desain yang tepat — memberikan output yang stabil dibanding meneruskan seluruh ECharts option ke LLM.

Namun untuk naik ke level production atau menjadi referensi resmi Apache yang lebih solid, proyek ini membutuhkan: test suite, abstraksi storage, perbaikan edge case validasi, dan dukungan stdio transport. Kodenya sudah cukup modular sehingga semua perbaikan di atas bisa dilakukan tanpa refactoring besar.
