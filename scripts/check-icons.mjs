import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-maskable-512.png", 512],
];

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

for (const [relativePath, size] of ICONS) {
  const png = readFileSync(join(ROOT, relativePath));
  if (!png.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error(`${relativePath} 不是有效 PNG`);
  }
  if (png.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error(`${relativePath} 缺少 IHDR`);
  }
  if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) {
    throw new Error(`${relativePath} 尺寸不是 ${size}×${size}`);
  }
}

console.log(`图标检查通过：${ICONS.length} 个 PNG`);
