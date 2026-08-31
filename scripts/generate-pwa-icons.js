/**
 * generate-pwa-icons.js — Pure-Node PWA icon generator (no image libs).
 * Reads public/unity-erp-mark.png (RGBA, non-interlaced) and writes:
 *   public/icons/icon-192.png, icon-512.png, maskable-192.png, maskable-512.png
 * Usage: node scripts/generate-pwa-icons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUTDIR = path.join(__dirname, '..', 'public', 'icons');
const SRCFILE = path.join(__dirname, '..', 'public', 'unity-erp-mark.png');
const BG = { r: 5, g: 5, b: 5, a: 255 }; // #050505 theme

// ---- PNG decode ----
function crc32(buf) {
  let t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function decodePNG(buf) {
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = []; let plte = null, trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (interlace !== 0) throw new Error('Interlaced PNG not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('Unsupported colorType ' + colorType);
  const bytesPer = bitDepth <= 8 ? 1 : 2;
  const stride = width * channels * bytesPer;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const srcStart = y * (stride + 1) + 1;
    const row = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const cur = raw[srcStart + x];
      const left = x >= channels * bytesPer ? row[x - channels * bytesPer] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const ul = y > 0 && x >= channels * bytesPer ? out[(y - 1) * stride + x - channels * bytesPer] : 0;
      let v = cur;
      if (f === 0) v = cur;
      else if (f === 1) v = (v + left) & 0xff;
      else if (f === 2) v = (v + up) & 0xff;
      else if (f === 3) v = (v + ((left + up) >> 1)) & 0xff;
      else if (f === 4) { const p = left + up - ul; const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul); v = (v + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul)) & 0xff; }
      else throw new Error('Bad filter ' + f);
      row[x] = v;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  const get = (row, col, ch) => out[row * stride + col * channels * bytesPer + ch * bytesPer];
  for (let i = 0; i < width * height; i++) {
    const row = (i / width) | 0, col = i % width;
    let r, g, b, a;
    if (colorType === 6) { r = get(row, col, 0); g = get(row, col, 1); b = get(row, col, 2); a = get(row, col, 3); }
    else if (colorType === 2) { r = get(row, col, 0); g = get(row, col, 1); b = get(row, col, 2); a = 255; }
    else if (colorType === 0) { r = g = b = get(row, col, 0); a = 255; }
    else if (colorType === 4) { r = g = b = get(row, col, 0); a = get(row, col, 1); }
    else { const idx = out[row * stride + col]; r = plte[idx * 3]; g = plte[idx * 3 + 1]; b = plte[idx * 3 + 2]; a = trns && idx < trns.length ? trns[idx] : 255; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { width, height, rgba };
}

// ---- area sampling scale (offset + content window for maskable) ----
function scaleRGBA(src, sw, sh, size, contentScale) {
  const contentW = size * contentScale;
  const off = (size - contentW) / 2;
  const full = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) { full[i * 4] = BG.r; full[i * 4 + 1] = BG.g; full[i * 4 + 2] = BG.b; full[i * 4 + 3] = 255; }
  for (let dy = 0; dy < size; dy++) {
    const sy0 = off + (dy / size) * contentW, sy1 = off + ((dy + 1) / size) * contentW;
    const y0 = Math.max(0, Math.floor(sy0)), y1 = Math.min(sh - 1, Math.ceil(sy1) - 1);
    for (let dx = 0; dx < size; dx++) {
      const sx0 = off + (dx / size) * contentW, sx1 = off + ((dx + 1) / size) * contentW;
      const x0 = Math.max(0, Math.floor(sx0)), x1 = Math.min(sw - 1, Math.ceil(sx1) - 1);
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let sy = y0; sy <= y1; sy++) {
        const oy = Math.max(0, Math.min(sy + 1, sy1) - Math.max(sy, sy0));
        for (let sx = x0; sx <= x1; sx++) {
          const ox = Math.max(0, Math.min(sx + 1, sx1) - Math.max(sx, sx0));
          const w = ox * oy; if (w <= 0) continue;
          const i = (sy * sw + sx) * 4;
          const sa = src[i + 3] / 255;
          r += src[i] * sa * w; g += src[i + 1] * sa * w; b += src[i + 2] * sa * w; a += sa * w; wsum += w;
        }
      }
      const oi = (dy * size + dx) * 4;
      if (wsum > 0) {
        const na = a / wsum;
        full[oi] = Math.round((r / wsum) * na + BG.r * (1 - na));
        full[oi + 1] = Math.round((g / wsum) * na + BG.g * (1 - na));
        full[oi + 2] = Math.round((b / wsum) * na + BG.b * (1 - na));
      }
    }
  }
  return full;
}
// ---- PNG encode ----
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; /* filter None */
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- main ----
const src = decodePNG(fs.readFileSync(SRCFILE));
console.log('decoded source', src.width + 'x' + src.height);
fs.mkdirSync(OUTDIR, { recursive: true });

function gen(name, size, contentScale) {
  const rgba = scaleRGBA(src.rgba, src.width, src.height, size, contentScale);
  const png = encodePNG(size, size, rgba);
  fs.writeFileSync(path.join(OUTDIR, name), png);
  console.log('wrote public/icons/' + name, size + 'x' + size, (png.length / 1024).toFixed(0) + 'KB');
}
gen('icon-192.png', 192, 0.9);
gen('icon-512.png', 512, 0.9);
gen('maskable-192.png', 192, 0.8);
gen('maskable-512.png', 512, 0.8);

for (const f of fs.readdirSync(OUTDIR)) {
  const d = decodePNG(fs.readFileSync(path.join(OUTDIR, f)));
  let opaque = 0, total = 0;
  for (let i = 0; i < d.width * d.height; i += 41) { total++; if (d.rgba[i * 4 + 3] > 250) opaque++; }
  console.log('  verify', f, d.width + 'x' + d.height, 'opaque fraction', (opaque / total).toFixed(2));
}
console.log('done');