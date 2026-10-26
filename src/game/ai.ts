import {
  CHECKERS,
  HOME,
  countAt,
  diceToPool,
  isBlot,
  legalSequences,
  opp,
  pipCount,
  type Board,
  type Player,
  type Rng,
  type Sequence,
} from './engine';

export type Level = 'kolay' | 'normal' | 'zor';

export const LEVEL_LABEL: Record<Level, string> = {
  kolay: 'Kolay',
  normal: 'Normal',
  zor: 'Zor',
};

const ROLLS: [number, number][] = [];
for (let a = 1; a <= 6; a++) {
  for (let b = a; b <= 6; b++) ROLLS.push([a, b]);
}

/** Pozisyonu p oyuncusunun gözünden puanlar (yüksek = iyi). */
export function evaluate(b: Board, p: Player): number {
  const o = opp(p);
  if (b.off[p] === CHECKERS) return 100000 + b.off[p] * 10 - b.off[o];
  if (b.off[o] === CHECKERS) return -100000;

  let score = 0;

  // Yarış (pip) farkı ve çıkarılan taşlar
  score += (pipCount(b, o) - pipCount(b, p)) * 1.15;
  score += (b.off[p] - b.off[o]) * 20;

  // Kırık taşlar: çok kötü
  score -= b.bar[p] * 38;
  score += b.bar[o] * 38;

  // Kapalı haneler (bloklar) ve ev gücü
  const home = HOME[p];
  for (let i = 0; i < 24; i++) {
    if (countAt(b, p, i) >= 2) score += 3;
  }
  for (let i = home; i < home + 6; i++) {
    if (countAt(b, p, i) >= 2) score += 11;
  }

  // Ardışık blok (prime) bonusu
  let run = 0;
  for (let i = 0; i < 24; i++) {
    if (countAt(b, p, i) >= 2) {
      run += 1;
      score += run * 2.5;
    } else {
      run = 0;
    }
  }

  // Açık taş (blot) riski
  const barShots = b.bar[o];
  for (let i = 0; i < 24; i++) {
    if (!isBlot(b, p, i)) continue;
    let shots = 0;
    for (let d = 1; d <= 6; d++) {
      const j = o === 1 ? i - d : i + d;
      if (j >= 0 && j < 24) shots += countAt(b, o, j);
    }
    if (barShots > 0) {
      if (o === 1 && i <= 5) shots += barShots;
      if (o === 0 && i >= 18) shots += barShots;
    }
    const deep = p === 0 ? i >= 18 : i <= 5;
    score -= Math.min(shots, 12) * (deep ? 2.6 : 1.6);
  }

  // Rakibin evinde sıkışmış taşlar hafif ceza
  const oppHome = HOME[o];
  for (let i = oppHome; i < oppHome + 6; i++) {
    const n = countAt(b, p, i);
    if (n > 0) score -= n * (1.2 + i * 0.02);
  }

  return score;
}

function rank(p: Player, seqs: Sequence[]) {
  return seqs
    .map((s) => ({ s, v: evaluate(s.board, p) }))
    .sort((a, c) => c.v - a.v);
}

/**
 * Bir zara karşı en iyi hamle dizisini seçer.
 * `zor` seviyesi rakip cevabını 21 farklı zar üzerinden beklenen değerle hesaplar.
 */
export function chooseSequence(
  b: Board,
  p: Player,
  dice: number[],
  level: Level,
  rng: Rng,
): Sequence | null {
  const seqs = legalSequences(b, p, dice);
  if (seqs.length === 0) return null;
  if (seqs.length === 1) return seqs[0];

  const ranked = rank(p, seqs);
  const o = opp(p);

  if (level === 'kolay') {
    if (rng() < 0.38) return seqs[Math.floor(rng() * seqs.length)];
    const take = Math.max(2, Math.ceil(ranked.length * 0.45));
    return ranked[Math.floor(rng() * Math.min(take, ranked.length))].s;
  }

  if (level === 'normal') {
    let best = ranked[0];
    let bestValue = -Infinity;
    for (const cand of ranked.slice(0, 8)) {
      const value = cand.v + (rng() - 0.5) * 7;
      if (value > bestValue) {
        bestValue = value;
        best = cand;
      }
    }
    return best.s;
  }

  // Zor: 2 katmanlı beklenen değer araması
  let best = ranked[0];
  let bestValue = -Infinity;
  for (const cand of ranked.slice(0, 10)) {
    if (cand.v >= 100000) return cand.s;

    let sum = 0;
    for (const roll of ROLLS) {
      const replies = legalSequences(cand.s.board, o, diceToPool(roll));
      let worst = Infinity;
      if (replies.length === 0) {
        worst = evaluate(cand.s.board, p);
      } else {
        for (const r of replies) {
          const v = evaluate(r.board, p);
          if (v < worst) worst = v;
        }
      }
      sum += worst;
    }
    const expected = sum / ROLLS.length;
    const value = cand.v * 0.42 + expected * 0.58;
    if (value > bestValue) {
      bestValue = value;
      best = cand;
    }
  }
  return best.s;
}
