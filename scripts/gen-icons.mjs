import zlib from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../public/', import.meta.url);

/* ---------- küçük PNG kodlayıcı ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- şekil yardımcıları (0..1 uzayında) ---------- */
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function roundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
    const dx = x - cx;
    const dy = y - cy;
    return Math.hypot(dx, dy) <= r || (x > x0 + r && x < x1 - r) || (y > y0 + r && y < y1 - r) ? 1 : 0;
  }
  return 0;
}

function inCircle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) <= r ? 1 : 0;
}

function inTriangle(x, y, ax, ay, bx, by, cx, cy) {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos) ? 1 : 0;
}

const mix = (a, b, t) => a + (b - a) * t;

/** Sahneyi renklendirir: {r,g,b,a} 0..255 */
function scene(x, y, opts) {
  const { pad } = opts;
  let out = { r: 0, g: 0, b: 0, a: 0 };
  const over = (col, alpha) => {
    if (alpha <= 0) return;
    const a = alpha + out.a / 255 * (1 - alpha);
    if (a <= 0) return;
    out.r = (col.r * alpha + (out.r * out.a) / 255 * (1 - alpha)) / a;
    out.g = (col.g * alpha + (out.g * out.a) / 255 * (1 - alpha)) / a;
    out.b = (col.b * alpha + (out.b * out.a) / 255 * (1 - alpha)) / a;
    out.a = a * 255;
  };

  // zemin: yuvarlatılmış kare + gradyan
  const bg = roundRect(x, y, 0.02, 0.02, 0.98, 0.98, 0.2);
  if (!bg) return out;
  const g = clamp01((y - 0.02) / 0.96);
  over(
    {
      r: mix(74, 24, g) + 26 * Math.max(0, 1 - Math.hypot(x - 0.35, y - 0.2) * 2.4),
      g: mix(46, 14, g) + 18 * Math.max(0, 1 - Math.hypot(x - 0.35, y - 0.2) * 2.4),
      b: mix(27, 9, g) + 10 * Math.max(0, 1 - Math.hypot(x - 0.35, y - 0.2) * 2.4),
    },
    1,
  );

  // altın çerçeve
  const ring = roundRect(x, y, 0.055, 0.055, 0.945, 0.945, 0.16) - roundRect(x, y, 0.075, 0.075, 0.925, 0.925, 0.15);
  if (ring > 0.5) over({ r: 217, g: 184, b: 119 }, 0.75);

  // oyun alanı
  const field = roundRect(x, y, pad, pad, 1 - pad, 1 - pad, 0.09);
  if (field) {
    const shade = 1 - Math.hypot(x - 0.5, y - 0.45) * 0.5;
    over({ r: 40 * shade, g: 24 * shade, b: 16 * shade }, 1);
  }

  // üçgenler
  const top = 0.16;
  const bottom = 0.84;
  const tw = 0.21;
  const tri = 0.27;
  const cols = [
    { r: 235, g: 220, b: 187 },
    { r: 122, g: 33, b: 47 },
  ];
  for (let i = 0; i < 4; i++) {
    const x0 = 0.5 - 2 * tw + i * tw;
    const isTop = i < 2;
    const c = cols[i % 2];
    if (isTop && inTriangle(x, y, x0 + 0.01, top, x0 + tw - 0.01, top, x0 + tw / 2, top + tri)) over(c, 0.95);
    if (!isTop && inTriangle(x, y, x0 + 0.01, bottom, x0 + tw - 0.01, bottom, x0 + tw / 2, bottom - tri))
      over(c, 0.95);
  }

  // taşlar
  const piece = (cx, cy, r, base, dark) => {
    if (!inCircle(x, y, cx, cy, r)) return;
    const d = Math.hypot(x - (cx - r * 0.3), y - (cy - r * 0.35));
    const t = clamp01(d / (r * 1.5));
    const col = {
      r: mix(base.r, dark.r, t),
      g: mix(base.g, dark.g, t),
      b: mix(base.b, dark.b, t),
    };
    over(col, 1);
    // halka
    const rr = Math.hypot(x - cx, y - cy);
    if (rr > r * 0.72 && rr < r * 0.86) over({ r: 255, g: 245, b: 220 }, 0.16);
    // parlama
    if (inCircle(x, y, cx - r * 0.3, cy - r * 0.34, r * 0.3)) over({ r: 255, g: 255, b: 250 }, 0.22);
  };

  piece(0.5, 0.53, 0.135, { r: 246, g: 234, b: 208 }, { r: 168, g: 136, b: 88 });
  piece(0.68, 0.47, 0.135, { r: 96, g: 94, b: 108 }, { r: 14, g: 13, b: 18 });
  piece(0.32, 0.47, 0.135, { r: 246, g: 234, b: 208 }, { r: 168, g: 136, b: 88 });

  return out;
}

function render(size, opts = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = size >= 400 ? 2 : 3;
  const pad = opts.pad ?? (opts.maskable ? 0.26 : 0.14);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const c = scene(x, y, { pad });
          r += c.r * (c.a / 255);
          g += c.g * (c.a / 255);
          b += c.b * (c.a / 255);
          a += c.a / 255;
        }
      }
      const n = SS * SS;
      const alpha = a / n;
      const idx = (py * size + px) * 4;
      if (alpha > 0.001) {
        rgba[idx] = Math.round(r / Math.max(a, 1e-6));
        rgba[idx + 1] = Math.round(g / Math.max(a, 1e-6));
        rgba[idx + 2] = Math.round(b / Math.max(a, 1e-6));
        rgba[idx + 3] = Math.round(alpha * 255);
      }
    }
  }
  return encodePNG(size, size, rgba);
}

mkdirSync(new URL('./icons/', OUT), { recursive: true });
const targets = [
  ['icons/icon-192.png', 192, {}],
  ['icons/icon-512.png', 512, {}],
  ['icons/icon-maskable-512.png', 512, { maskable: true, pad: 0.3 }],
  ['icons/apple-touch-icon.png', 180, {}],
  ['favicon-64.png', 64, {}],
];
for (const [name, size, opts] of targets) {
  const buf = render(size, opts);
  writeFileSync(new URL(name, OUT), buf);
  console.log('yazıldı:', name, `${size}x${size}`, `${(buf.length / 1024).toFixed(1)} KB`);
}
