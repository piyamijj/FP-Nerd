import { describe, expect, it } from 'vitest';
import {
  CHECKERS,
  applyMove,
  allHome,
  createBoard,
  legalFirstMoves,
  legalSequences,
  makeRng,
  movesForDie,
  pipCount,
  scoreGame,
  totalCheckers,
  type Board,
  type Player,
} from './engine';
import { chooseSequence } from './ai';
import { isLegalFirstMove, newGame, playMove, startRoll } from './state';

function emptyBoard(): Board {
  return { pts: new Array(24).fill(0), bar: [0, 0], off: [0, 0] };
}

function put(b: Board, p: Player, index: number, n: number) {
  b.pts[index] += p === 0 ? n : -n;
}

describe('tahta kurulumu', () => {
  it('her oyuncunun 15 taşı ve 167 pipsi vardır', () => {
    const b = createBoard();
    expect(totalCheckers(b, 0)).toBe(CHECKERS);
    expect(totalCheckers(b, 1)).toBe(CHECKERS);
    expect(pipCount(b, 0)).toBe(167);
    expect(pipCount(b, 1)).toBe(167);
    expect(b.bar).toEqual([0, 0]);
    expect(b.off).toEqual([0, 0]);
  });
});

describe('hamle üretimi', () => {
  it('kırık taş varsa sadece giriş hamlesi üretilir', () => {
    const b = emptyBoard();
    put(b, 0, 10, 14);
    b.bar[0] = 1;
    const moves = movesForDie(b, 0, 3);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from: 'bar', to: 21, die: 3 });
  });

  it('kapalı hane (2+ rakip taşı) engellenir', () => {
    const b = emptyBoard();
    put(b, 0, 10, 15);
    put(b, 1, 9, 2);
    expect(movesForDie(b, 0, 1).filter((m) => m.from === 10 && m.to === 9)).toHaveLength(0);
  });

  it('rakip tek taşı (blot) kırılır', () => {
    const b = emptyBoard();
    put(b, 0, 10, 14);
    put(b, 1, 9, 1);
    const mv = movesForDie(b, 0, 1).find((m) => m.from === 10)!;
    expect(mv.hit).toBe(true);
    const after = applyMove(b, 0, mv);
    expect(after.bar[1]).toBe(1);
    expect(after.pts[9]).toBe(1);
  });

  it('kep atışı: tam zarla ve taşraşma (overshoot) ile', () => {
    const b = emptyBoard();
    put(b, 0, 3, 12);
    put(b, 0, 2, 3);
    b.off[0] = 0;
    expect(allHome(b, 0)).toBe(true);

    // index 2 (3. hane) 3 ile tam çıkış
    const exact = movesForDie(b, 0, 3).filter((m) => m.to === 'off');
    expect(exact.some((m) => m.from === 2)).toBe(true);
    // index 2'den 6 ile taşraşma: daha ileride (index 3) taş olduğu için yasak
    expect(movesForDie(b, 0, 6).some((m) => m.from === 2 && m.to === 'off')).toBe(false);
    // index 3'ten 6 ile taşraşmaya izin var (daha ileride taş yok)
    expect(movesForDie(b, 0, 6).some((m) => m.from === 3 && m.to === 'off')).toBe(true);
  });

  it('kep atışı: daha ileride taş yoksa büyük zarla çıkılır', () => {
    const b = emptyBoard();
    put(b, 0, 2, 15);
    const moves = movesForDie(b, 0, 6).filter((m) => m.to === 'off');
    expect(moves).toHaveLength(1);
    expect(moves[0].from).toBe(2);
  });

  it('evde taş yokken kep atılamaz', () => {
    const b = emptyBoard();
    put(b, 0, 8, 15);
    expect(allHome(b, 0)).toBe(false);
    expect(movesForDie(b, 0, 6).filter((m) => m.to === 'off')).toHaveLength(0);
  });
});

describe('tam hamle dizileri', () => {
  it('çift zarda 4 hamlelik dizi üretir', () => {
    const b = emptyBoard();
    put(b, 0, 20, 15);
    const seqs = legalSequences(b, 0, [2, 2, 2, 2]);
    expect(seqs[0].moves).toHaveLength(4);
  });

  it('tek zar oynanabiliyorsa büyük zar zorunlu', () => {
    const b = emptyBoard();
    put(b, 0, 10, 15);
    put(b, 1, 4, 2); // 6'lık yol kapalı
    const seqs = legalSequences(b, 0, [5, 6]);
    expect(seqs).toHaveLength(1);
    expect(seqs[0].moves[0].die).toBe(5);
  });

  it('iki zar da oynanabiliyorsa ikisi de kullanılır', () => {
    const b = emptyBoard();
    put(b, 0, 10, 15);
    const seqs = legalSequences(b, 0, [2, 3]);
    expect(seqs.every((s) => s.moves.length === 2)).toBe(true);
  });

  it('hiç hamle yoksa boş dizi döner (dans)', () => {
    const b = emptyBoard();
    put(b, 0, 10, 14);
    b.bar[0] = 1;
    put(b, 1, 23, 2);
    put(b, 1, 22, 2);
    put(b, 1, 21, 2);
    put(b, 1, 20, 2);
    put(b, 1, 19, 2);
    put(b, 1, 18, 2);
    expect(legalSequences(b, 0, [1, 2])).toHaveLength(0);
  });
});

describe('skorlama', () => {
  it('tek oyun 1 puan', () => {
    const b = emptyBoard();
    b.off = [15, 2];
    expect(scoreGame(b, 0)).toMatchObject({ points: 1, kind: 'tek' });
  });

  it('mars 2 puan', () => {
    const b = emptyBoard();
    b.off = [15, 0];
    put(b, 1, 20, 15);
    expect(scoreGame(b, 0)).toMatchObject({ points: 2, kind: 'mars' });
  });

  it('mars-üstü (kırıkta taş) 3 puan', () => {
    const b = emptyBoard();
    b.off = [15, 0];
    b.bar[1] = 1;
    put(b, 1, 20, 14);
    expect(scoreGame(b, 0)).toMatchObject({ points: 3, kind: 'mars-ustu' });
  });
});

describe('oyun akışı', () => {
  it('zar atınca hamle fazına geçer ve hamle uygulanır', () => {
    let s = newGame();
    s = startRoll(s, makeRng(7), [3, 4]);
    expect(s.phase).toBe('move');
    expect(s.dice).toHaveLength(2);

    const mv = legalFirstMoves(s.board, 0, s.dice)[0];
    expect(isLegalFirstMove(s, mv)).toBe(true);
    const s2 = playMove(s, mv);
    expect(s2.board).not.toEqual(s.board);
    expect(s2.dice.length).toBeLessThan(2);
  });

  it('geçersiz hamle yok sayılır', () => {
    let s = newGame();
    s = startRoll(s, makeRng(3), [3, 4]);
    const bad = { from: 0, to: 5, die: 3, hit: false };
    expect(playMove(s, bad as never)).toBe(s);
  });

  it('oynanamayan zarda sıra geçer ve dans işaretlenir', () => {
    let s = newGame();
    s = { ...s, board: { pts: new Array(24).fill(0), bar: [1, 0], off: [14, 15] } };
    for (let i = 18; i < 24; i++) s.board.pts[i] = -2;
    s.board.pts[0] = 14;
    s = startRoll(s, makeRng(1), [1, 2]);
    expect(s.turn).toBe(1);
    expect(s.dance).toBe(0);
    expect(s.phase).toBe('roll');
  });

  it('tüm taşlar çıkınca oyun biter ve skor eklenir', () => {
    let s = newGame();
    const b = emptyBoard();
    b.off = [14, 0];
    put(b, 0, 0, 1);
    put(b, 1, 20, 15);
    s = { ...s, board: b };
    s = startRoll(s, makeRng(9), [1, 2]);
    const mv = legalFirstMoves(s.board, 0, s.dice).find((m) => m.to === 'off');
    expect(mv).toBeDefined();
    const done = playMove(s, mv!);
    expect(done.phase).toBe('over');
    expect(done.result?.winner).toBe(0);
    expect(done.match[0]).toBeGreaterThan(0);
  });

  it('yapay zeka her seviyede geçerli hamle üretir', () => {
    const rng = makeRng(42);
    for (const level of ['kolay', 'normal', 'zor'] as const) {
      const b = createBoard();
      const seq = chooseSequence(b, 0, [6, 5], level, rng);
      expect(seq).not.toBeNull();
      expect(seq!.moves.length).toBeGreaterThan(0);
      expect(seq!.board.pts.reduce((a, v) => a + Math.abs(v), 0)).toBeGreaterThan(0);
    }
  });
});

describe('tam oyun simülasyonu', () => {
  it('yapay zeka kendine karşı oynayınca oyun makul sürede biter', () => {
    const rng = makeRng(2024);
    let s = newGame();
    let guard = 0;
    while (s.phase !== 'over' && guard++ < 4000) {
      s = startRoll(s, rng);
      if (s.phase === 'over') break;
      if (s.dance !== null) continue;
      let steps = 0;
      while (s.phase === 'move' && steps++ < 8) {
        const seq = chooseSequence(s.board, s.turn, s.dice, 'normal', rng);
        if (!seq) break;
        for (const mv of seq.moves) s = playMove(s, mv);
      }
    }
    expect(s.phase).toBe('over');
    expect(totalCheckers(s.board, 0) + totalCheckers(s.board, 1)).toBe(30);
    expect(s.board.off[s.result!.winner]).toBe(15);
  }, 30000);
});
