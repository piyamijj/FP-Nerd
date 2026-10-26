/** Temel tavla tipleri. Tahta 24 haneli (0..23). */

export type Player = 0 | 1;

/**
 * `pts[i]` işaretli sayıdır: + ise 0. oyuncunun, - ise 1. oyuncunun taşları.
 * 0. oyuncu (açık renk) 23 -> 0 yönünde, 1. oyuncu (koyu renk) 0 -> 23 yönünde oynar.
 * 0. oyuncunun evi 0..5, 1. oyuncunun evi 18..23.
 */
export interface Board {
  pts: number[];
  bar: [number, number];
  off: [number, number];
}

export interface Move {
  from: number | 'bar';
  to: number | 'off';
  die: number;
  hit: boolean;
}

export type Phase = 'roll' | 'move' | 'over';

export type WinKind = 'tek' | 'mars' | 'mars-ustu';

export interface GameResult {
  winner: Player;
  points: number;
  kind: WinKind;
}

export interface GameState {
  board: Board;
  turn: Player;
  /** Kalan zarlar (çift zar 4 eleman). */
  dice: number[];
  /** Atılan zar çifti. */
  rolled: number[];
  phase: Phase;
  result: GameResult | null;
  /** Maç skoru. */
  match: [number, number];
  /** Hamle sayacı (oyun saati / animasyon için). */
  plies: number;
  /** Zar atıldı ama hiç hamle yok: sıra kimden geçti. */
  dance: Player | null;
}

export type Rng = () => number;

export const POINTS = 24;
export const CHECKERS = 15;
export const HOME: [number, number] = [0, 18];

export const opp = (p: Player): Player => (p === 0 ? 1 : 0);

export function ownerOf(value: number): Player | null {
  if (value > 0) return 0;
  if (value < 0) return 1;
  return null;
}

export function countAt(b: Board, p: Player, i: number): number {
  return p === 0 ? Math.max(b.pts[i], 0) : Math.max(-b.pts[i], 0);
}

export function isBlot(b: Board, p: Player, i: number): boolean {
  return countAt(b, opp(p), i) === 1 && countAt(b, p, i) === 0;
}

export function cloneBoard(b: Board): Board {
  return { pts: b.pts.slice(), bar: [b.bar[0], b.bar[1]], off: [b.off[0], b.off[1]] };
}

export function createBoard(): Board {
  const pts = new Array<number>(POINTS).fill(0);
  // 0. oyuncu (açık): 24, 13, 8 ve 6 numaralı haneler
  pts[23] = 2;
  pts[12] = 5;
  pts[7] = 3;
  pts[5] = 5;
  // 1. oyuncu (koyu): aynalanmış dizilim
  pts[0] = -2;
  pts[11] = -5;
  pts[16] = -3;
  pts[18] = -5;
  return { pts, bar: [0, 0], off: [0, 0] };
}

export function boardKey(b: Board): string {
  return `${b.pts.join(',')}|${b.bar[0]},${b.bar[1]}|${b.off[0]},${b.off[1]}`;
}

export function totalCheckers(b: Board, p: Player): number {
  let n = b.bar[p] + b.off[p];
  for (let i = 0; i < POINTS; i++) n += countAt(b, p, i);
  return n;
}

/** Tüm taşlar evde mi (kapalı tahta yok)? Kep atışı için gerekli. */
export function allHome(b: Board, p: Player): boolean {
  if (b.bar[p] > 0) return false;
  const lo = HOME[p];
  const hi = lo + 5;
  for (let i = 0; i < POINTS; i++) {
    if (i >= lo && i <= hi) continue;
    if (countAt(b, p, i) > 0) return false;
  }
  return true;
}

/** Kep yönünde daha ileride (çıkışa uzak) taş var mı? */
function hasFarther(b: Board, p: Player, from: number): boolean {
  if (p === 0) {
    for (let i = from + 1; i <= 5; i++) if (countAt(b, p, i) > 0) return true;
  } else {
    for (let i = 18; i < from; i++) if (countAt(b, p, i) > 0) return true;
  }
  return false;
}

/** Bir zar için oynanabilecek tek hamleler. */
export function movesForDie(b: Board, p: Player, die: number): Move[] {
  const out: Move[] = [];
  const dir = p === 0 ? -1 : 1;

  // Kırık taş varsa önce giriş yapılır (rakip evine).
  if (b.bar[p] > 0) {
    const target = p === 0 ? 24 - die : die - 1;
    const blocked = p === 0 ? b.pts[target] <= -2 : b.pts[target] >= 2;
    if (!blocked) {
      out.push({ from: 'bar', to: target, die, hit: isBlot(b, p, target) });
    }
    return out;
  }

  const canOff = allHome(b, p);
  for (let i = 0; i < POINTS; i++) {
    if (countAt(b, p, i) === 0) continue;
    const t = i + dir * die;
    if (t >= 0 && t < POINTS) {
      const blocked = p === 0 ? b.pts[t] <= -2 : b.pts[t] >= 2;
      if (blocked) continue;
      out.push({ from: i, to: t, die, hit: isBlot(b, p, t) });
    } else if (canOff) {
      const dist = p === 0 ? i + 1 : POINTS - i;
      if (die === dist) {
        out.push({ from: i, to: 'off', die, hit: false });
      } else if (die > dist && !hasFarther(b, p, i)) {
        out.push({ from: i, to: 'off', die, hit: false });
      }
    }
  }
  return out;
}

export function applyMove(b: Board, p: Player, m: Move): Board {
  const nb = cloneBoard(b);
  const sign = p === 0 ? 1 : -1;

  if (m.from === 'bar') nb.bar[p] = Math.max(0, nb.bar[p] - 1);
  else nb.pts[m.from] -= sign;

  if (m.to === 'off') {
    nb.off[p] += 1;
    return nb;
  }

  const t = m.to;
  if (isBlot(nb, p, t)) {
    nb.pts[t] = 0;
    nb.bar[opp(p)] += 1;
  }
  nb.pts[t] += sign;
  return nb;
}

export function applyMoves(b: Board, p: Player, moves: Move[]): Board {
  return moves.reduce((acc, m) => applyMove(acc, p, m), b);
}

export interface Sequence {
  moves: Move[];
  board: Board;
}

/**
 * Verilen zarlarla oynanabilecek tüm tam hamle dizileri.
 * Aynı sonuca götüren diziler tekilleştirilir. En fazla zar kullanılan
 * diziler döner (tavla kuralı: oynanabiliyorsa iki zar da oynanır).
 */
export function legalSequences(b: Board, p: Player, dice: number[]): Sequence[] {
  if (dice.length === 0) return [];
  const best = new Map<string, { seq: Move[]; used: number; board: Board }>();

  const walk = (board: Board, remaining: number[], seq: Move[]) => {
    const values = [...new Set(remaining)].sort((a, c) => c - a);
    let branched = false;

    for (const die of values) {
      const options = movesForDie(board, p, die);
      if (options.length === 0) continue;
      branched = true;
      const idx = remaining.indexOf(die);
      const rest = remaining.slice();
      rest.splice(idx, 1);
      for (const mv of options) {
        const nb = applyMove(board, p, mv);
        walk(nb, rest, [...seq, mv]);
      }
    }

    if (!branched) {
      const key = boardKey(board);
      const used = dice.length - remaining.length;
      const prev = best.get(key);
      if (!prev || used > prev.used) best.set(key, { seq, used, board });
    }
  };

  walk(b, dice.slice(), []);

  // Hiç zar kullanılamadıysa oynanabilir hamle yoktur (dans).
  const all = [...best.values()].filter((s) => s.used > 0);
  if (all.length === 0) return [];
  const maxUsed = Math.max(...all.map((s) => s.used));
  let chosen = all.filter((s) => s.used === maxUsed);

  // Tek zar oynanabiliyorsa büyük zar oynanmak zorunda.
  if (maxUsed === 1) {
    const maxDie = Math.max(...dice);
    const withBig = chosen.filter((s) => s.seq[0]?.die === maxDie);
    if (withBig.length > 0) chosen = withBig;
  }

  return chosen.map((s) => ({ moves: s.seq, board: s.board }));
}

/** Şu an oynanabilecek ilk hamleler (tam dizilerin ilk adımları). */
export function legalFirstMoves(b: Board, p: Player, dice: number[]): Move[] {
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const s of legalSequences(b, p, dice)) {
    const m = s.moves[0];
    if (!m) continue;
    const key = `${m.from}>${m.to}/${m.die}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

export function pipCount(b: Board, p: Player): number {
  let pips = 0;
  for (let i = 0; i < POINTS; i++) {
    const n = countAt(b, p, i);
    if (!n) continue;
    pips += n * (p === 0 ? i + 1 : POINTS - i);
  }
  pips += b.bar[p] * 25;
  return pips;
}

export function scoreGame(b: Board, winner: Player): GameResult {
  const loser = opp(winner);
  const loserOff = b.off[loser];
  if (loserOff > 0) return { winner, points: 1, kind: 'tek' };

  // Mars: hiç taş çıkarmadı. Mars-üstü: kırıkta taşı var ya da kazananın
  // evinde taşı kalmış.
  const winnerHome = HOME[winner];
  let inWinnerHome = false;
  for (let i = winnerHome; i < winnerHome + 6; i++) {
    if (countAt(b, loser, i) > 0) {
      inWinnerHome = true;
      break;
    }
  }
  if (b.bar[loser] > 0 || inWinnerHome) return { winner, points: 3, kind: 'mars-ustu' };
  return { winner, points: 2, kind: 'mars' };
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

export function rollDice(rng: Rng): [number, number] {
  const d1 = 1 + Math.floor(rng() * 6);
  const d2 = 1 + Math.floor(rng() * 6);
  return [d1, d2];
}

export function diceToPool(rolled: [number, number]): number[] {
  return rolled[0] === rolled[1] ? [rolled[0], rolled[0], rolled[0], rolled[0]] : [rolled[0], rolled[1]];
}
