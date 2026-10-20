/**
 * Draws the app icon (a blue HQ badge with a star) and writes PNGs to public/icons/.
 * No image tools needed: shapes are rasterized here with supersampling and encoded with zlib.
 * Run with `node scripts/make-icons.mjs` after changing the design.
 */
import { Buffer } from 'node:buffer';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve('public/icons');
const SIZES = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };

const BG = [27, 36, 22];
const GRID = [44, 58, 36];
const RING = [12, 40, 90];
const BLUE = [61, 139, 253];
const WHITE = [255, 255, 255];

function starPoints(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Color at a point in a 1x1 design space. */
function colorAt(u, v) {
  const d = Math.hypot(u - 0.5, v - 0.5);
  if (inPolygon(u, v, STAR)) return WHITE;
  if (d < 0.33) return BLUE;
  if (d < 0.37) return RING;
  const onGrid = Math.abs(((u * 8) % 1) - 0.5) > 0.47 || Math.abs(((v * 8) % 1) - 0.5) > 0.47;
  return onGrid ? GRID : BG;
}
const STAR = starPoints(0.5, 0.52, 0.24, 0.1);

function render(size) {
  const ss = 4;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = colorAt((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const n = ss * ss;
      row[1 + x * 3] = Math.round(r / n);
      row[2 + x * 3] = Math.round(g / n);
      row[3 + x * 3] = Math.round(b / n);
    }
    rows.push(row);
  }
  return encodePng(size, size, Buffer.concat(rows));
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, raw) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, size] of Object.entries(SIZES)) {
  fs.writeFileSync(path.join(OUT, name), render(size));
  console.log(`wrote public/icons/${name} (${size}x${size})`);
}
