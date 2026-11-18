import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES = 4;
const DARK = [23, 23, 23];
const WHITE = [255, 255, 255];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
  return Buffer.concat([header, data, crc]);
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  if (x < left || y < top || x > left + width || y > top + height) return false;
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const dx = Math.max(left + r - x, 0, x - (left + width - r));
  const dy = Math.max(top + r - y, 0, y - (top + height - r));
  return dx * dx + dy * dy <= r * r;
}

function distanceToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const ratio =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSq));
  return Math.hypot(x - (x1 + ratio * dx), y - (y1 + ratio * dy));
}

function sampleCoverage(size, maskable, px, py) {
  let background = 0;
  let ink = 0;
  const scale = size / 64;

  for (let sy = 0; sy < SAMPLES; sy += 1) {
    for (let sx = 0; sx < SAMPLES; sx += 1) {
      const x = px + (sx + 0.5) / SAMPLES;
      const y = py + (sy + 0.5) / SAMPLES;

      const hasBackground = maskable ? true : insideRoundedRect(x, y, 0, 0, size, size, 14 * scale);
      if (!hasBackground) continue;
      background += 1;

      const outer = insideRoundedRect(
        x,
        y,
        18 * scale,
        14 * scale,
        28 * scale,
        36 * scale,
        4 * scale,
      );
      const inner = insideRoundedRect(
        x,
        y,
        21 * scale,
        17 * scale,
        22 * scale,
        30 * scale,
        1 * scale,
      );
      const stroke = 1.5 * scale;
      const lines = [
        distanceToSegment(x, y, 25 * scale, 24 * scale, 39 * scale, 24 * scale) <= stroke,
        distanceToSegment(x, y, 25 * scale, 32 * scale, 39 * scale, 32 * scale) <= stroke,
        distanceToSegment(x, y, 25 * scale, 40 * scale, 33 * scale, 40 * scale) <= stroke,
      ].some(Boolean);

      if ((outer && !inner) || lines) ink += 1;
    }
  }

  const total = SAMPLES * SAMPLES;
  return { alpha: background / total, ink: ink / total };
}

/** 由 favicon.svg 的同一组矩形与线条生成 PNG，无额外图像依赖。 */
export function createIconPng(size, options = {}) {
  const maskable = options.maskable === true;
  const scanlines = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;

  for (let y = 0; y < size; y += 1) {
    scanlines[offset] = 0;
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      const { alpha, ink } = sampleCoverage(size, maskable, x, y);
      const mix = Math.min(1, ink);
      for (let channel = 0; channel < 3; channel += 1) {
        scanlines[offset + channel] = Math.round(DARK[channel] * (1 - mix) + WHITE[channel] * mix);
      }
      scanlines[offset + 3] = Math.round(alpha * 255);
      offset += 4;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

export function writeIcons(directory = join(ROOT, "public", "icons")) {
  mkdirSync(directory, { recursive: true });
  const files = [
    ["icon-192.png", createIconPng(192)],
    ["icon-512.png", createIconPng(512)],
    ["icon-maskable-512.png", createIconPng(512, { maskable: true })],
  ];
  for (const [name, png] of files) writeFileSync(join(directory, name), png);
  return files.map(([name]) => name);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`已生成图标：${writeIcons().join("、")}`);
}
