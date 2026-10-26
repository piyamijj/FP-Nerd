import {
  applyMove,
  CHECKERS,
  createBoard,
  diceToPool,
  legalFirstMoves,
  legalSequences,
  opp,
  rollDice,
  scoreGame,
  type Board,
  type GameState,
  type Move,
  type Player,
  type Rng,
} from './engine';

export function newGame(match: [number, number] = [0, 0]): GameState {
  return {
    board: createBoard(),
    turn: 0,
    dice: [],
    rolled: [],
    phase: 'roll',
    result: null,
    match: [match[0], match[1]],
    plies: 0,
    dance: null,
  };
}

/** Zar at. Hamle yoksa sıra otomatik geçer (dans). */
export function startRoll(s: GameState, rng: Rng, forced?: [number, number]): GameState {
  if (s.phase !== 'roll' || s.result) return s;
  const rolled = forced ?? rollDice(rng);
  const pot = diceToPool(rolled);
  const playable = legalSequences(s.board, s.turn, pot).length > 0;

  if (!playable) {
    return {
      ...s,
      rolled,
      dice: [],
      phase: 'roll',
      turn: opp(s.turn),
      dance: s.turn,
      plies: s.plies + 1,
    };
  }

  return {
    ...s,
    rolled,
    dice: pot,
    phase: 'move',
    dance: null,
    plies: s.plies + 1,
  };
}

export function clearDance(s: GameState): GameState {
  return s.dance === null ? s : { ...s, dance: null };
}

function endTurn(s: GameState): GameState {
  return {
    ...s,
    turn: opp(s.turn),
    dice: [],
    rolled: [],
    phase: 'roll',
    dance: null,
  };
}

export function isLegalFirstMove(s: GameState, move: Move): boolean {
  return legalFirstMoves(s.board, s.turn, s.dice).some(
    (m) => m.from === move.from && m.to === move.to && m.die === move.die,
  );
}

/** Tek bir taşı oynatır, gerekirse sırayı devreder. */
export function playMove(s: GameState, move: Move): GameState {
  if (s.phase !== 'move' || s.result) return s;
  if (!s.dice.includes(move.die)) return s;
  if (!isLegalFirstMove(s, move)) return s;

  const player = s.turn;
  const board = applyMove(s.board, player, move);
  const dice = s.dice.slice();
  dice.splice(dice.indexOf(move.die), 1);

  if (board.off[player] === CHECKERS) {
    const result = scoreGame(board, player);
    const match: [number, number] = [s.match[0], s.match[1]];
    match[player] += result.points;
    return {
      ...s,
      board,
      dice: [],
      phase: 'over',
      result,
      match,
      plies: s.plies + 1,
      dance: null,
    };
  }

  if (dice.length === 0 || legalFirstMoves(board, player, dice).length === 0) {
    return endTurn({
      ...s,
      board,
      dice,
      plies: s.plies + 1,
    });
  }

  return {
    ...s,
    board,
    dice,
    phase: 'move',
    plies: s.plies + 1,
    dance: null,
  };
}

export function currentSequences(s: GameState) {
  return legalSequences(s.board, s.turn, s.dice);
}

/** Bir sonraki oyunu aynı maç skoruyla başlatır. */
export function nextGame(s: GameState, startingPlayer: Player = 0): GameState {
  const g = newGame([s.match[0], s.match[1]]);
  g.turn = startingPlayer;
  return g;
}

/** Sadece ağ üzerinden gelen durumları doğrulamak için. */
export function sanitizeState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as GameState;
  if (!s.board || !Array.isArray(s.board.pts) || s.board.pts.length !== 24) return null;
  if (s.turn !== 0 && s.turn !== 1) return null;
  if (!Array.isArray(s.dice) || !Array.isArray(s.rolled)) return null;
  if (!Array.isArray(s.match) || s.match.length !== 2) return null;
  if (!['roll', 'move', 'over'].includes(s.phase)) return null;
  const board: Board = {
    pts: s.board.pts.map((n) => (Number.isFinite(n) ? Math.trunc(n) : 0)),
    bar: [Math.max(0, s.board.bar?.[0] ?? 0), Math.max(0, s.board.bar?.[1] ?? 0)],
    off: [Math.max(0, s.board.off?.[0] ?? 0), Math.max(0, s.board.off?.[1] ?? 0)],
  };
  return {
    board,
    turn: s.turn,
    dice: s.dice.filter((d) => Number.isInteger(d) && d >= 1 && d <= 6).slice(0, 4),
    rolled: s.rolled.filter((d) => Number.isInteger(d) && d >= 1 && d <= 6).slice(0, 2),
    phase: s.phase,
    result: s.result ?? null,
    match: [Math.max(0, s.match[0] | 0), Math.max(0, s.match[1] | 0)],
    plies: Math.max(0, s.plies | 0),
    dance: s.dance === 0 || s.dance === 1 ? s.dance : null,
  };
}
