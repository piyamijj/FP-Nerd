// Android mipmap ikonlarını public/icons/icon-512.png dosyasından üretir.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(root, 'public/icons/icon-512.png');
const res = path.join(root, 'android/app/src/main/res');

const src = PNG.sync.read(fs.readFileSync(srcPath));

function resize(img, w, h) {
  const out = new PNG({ width: w, height: h });
  const sx = img.width / w;
  const sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(img.height - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(img.width - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const wx = fx - x0;
      const i00 = (y0 * img.width + x0) << 2;
      const i10 = (y0 * img.width + x1) << 2;
      const i01 = (y1 * img.width + x0) << 2;
      const i11 = (y1 * img.width + x1) << 2;
      const o = (y * w + x) << 2;
      for (let c = 0; c < 4; c++) {
        const top = img.data[i00 + c] * (1 - wx) + img.data[i10 + c] * wx;
        const bottom = img.data[i01 + c] * (1 - wx) + img.data[i11 + c] * wx;
        out.data[o + c] = Math.round(top * (1 - wy) + bottom * wy);
      }
    }
  }
  return out;
}

function write(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

const densities = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

for (const [d, size] of Object.entries(densities)) {
  const png = resize(src, size, size);
  const dir = path.join(res, `mipmap-${d}`);
  write(path.join(dir, 'ic_launcher.png'), png);
  write(path.join(dir, 'ic_launcher_round.png'), png);
  // Adaptive icon foreground: 108dp, art full-bleed (maske köşeleri kırpar)
  write(path.join(dir, 'ic_launcher_foreground.png'), resize(src, Math.round(size * 2.25), Math.round(size * 2.25)));
}

console.log('Android ikonları güncellendi:', Object.keys(densities).join(', '));
