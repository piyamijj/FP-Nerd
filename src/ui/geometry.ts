/**
 * Tahta geometrisi. Tüm ölçüler 1000x460 birim uzayındadır;
 * bileşenler bu değerleri ölçekle çarpar.
 */
export const BW = 1000;
export const BH = 460;

export const FRAME = 22;
export const INNER_TOP = 22;
export const INNER_BOTTOM = 438;
export const ROW_H = 208;
export const TRI_H = 192;
export const COL_W = (417 - 22) / 6;
export const BAR_X = 417;
export const BAR_W = 78;
export const BAR_C = 456;
export const TRAY_X = 890;
export const TRAY_W = 88;
export const TRAY_C = 934;
export const PIECE = 63;
export const TRAY_PIECE = 56;

export interface PointGeom {
  v: number;
  x: number;
  top: boolean;
  /** Taşların dizildiği dış kenar. */
  baseY: number;
  /** Merkeze doğru yön (+1 aşağı, -1 yukarı). */
  dir: 1 | -1;
  apexY: number;
  col: number;
}

export function pointGeom(v: number): PointGeom {
  const top = v >= 12;
  const col = top ? v - 12 : 11 - v;
  const x = col < 6 ? FRAME + COL_W * (col + 0.5) : BAR_X + BAR_W + COL_W * (col - 6 + 0.5);
  const baseY = top ? INNER_TOP : INNER_BOTTOM;
  const dir: 1 | -1 = top ? 1 : -1;
  const apexY = top ? INNER_TOP + TRI_H : INNER_BOTTOM - TRI_H;
  return { v, x, top, baseY, dir, apexY, col };
}

/** Bir hanedeki n taşın i. taşının merkezi. */
export function stackPos(v: number, i: number, n: number): { x: number; y: number } {
  const g = pointGeom(v);
  const avail = ROW_H - PIECE - 6;
  const spacing = n > 1 ? Math.max(PIECE * 0.135, Math.min(PIECE * 0.63, avail / (n - 1))) : 0;
  return { x: g.x, y: g.baseY + g.dir * (PIECE / 2 + i * spacing) };
}

/** Kırık taş (bar) konumu. bottom = tahta altındaki oyuncu. */
export function barPos(bottom: boolean, i: number, n: number) {
  const d = 52;
  const avail = 300 - d;
  const spacing = n > 1 ? Math.max(d * 0.14, Math.min(d * 0.6, avail / (n - 1))) : 0;
  const startY = bottom ? INNER_BOTTOM : INNER_TOP;
  const dir = bottom ? -1 : 1;
  return { x: BAR_C, y: startY + dir * (d / 2 + i * spacing) };
}

/** Çıkarılan taşların tepsideki konumu. */
export function trayPos(bottom: boolean, i: number, n: number) {
  const d = TRAY_PIECE;
  const avail = ROW_H - d - 10;
  const spacing = n > 1 ? Math.max(7, Math.min(d * 0.4, avail / (n - 1))) : 0;
  const startY = bottom ? INNER_BOTTOM - 4 : INNER_TOP + 4;
  const dir = bottom ? -1 : 1;
  return { x: TRAY_C, y: startY + dir * (d / 2 + i * spacing) };
}

/** Görünüm indeksi (0..23) -> motor indeksi. */
export function engineIndex(v: number, flip: boolean): number {
  return flip ? 23 - v : v;
}
