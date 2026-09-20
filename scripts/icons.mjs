import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("build", { recursive: true });
function icon(size, tray = false) {
  const png = new PNG({ width: size, height: size });
  const bars = [0.23, 0.48, 0.72, 0.42, 0.23];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = x / size,
        ny = y / size;
      const corner = Math.hypot(
        Math.max(0.2 - nx, 0, nx - 0.8),
        Math.max(0.2 - ny, 0, ny - 0.8),
      );
      const inShape = corner <= 0.19;
      let wave = false;
      for (let b = 0; b < 5; b++) {
        const cx = 0.25 + b * 0.125;
        if (
          Math.hypot(
            Math.max(Math.abs(nx - cx) - 0.018, 0),
            Math.max(Math.abs(ny - 0.5) - bars[b] / 2 + 0.035, 0),
          ) < 0.035
        )
          wave = true;
      }
      const i = (y * size + x) * 4;
      png.data.set(
        tray
          ? [255, 255, 255, wave ? 255 : 0]
          : wave
            ? [245, 251, 240, 255]
            : [35, 67, 48, inShape ? 255 : 0],
        i,
      );
    }
  return PNG.sync.write(png);
}
const buffer = icon(256);
writeFileSync("build/icon.png", buffer);
writeFileSync("build/tray.png", icon(32, true));
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(buffer.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync("build/icon.ico", Buffer.concat([header, buffer]));
