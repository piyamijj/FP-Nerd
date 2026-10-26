import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  countAt,
  legalFirstMoves,
  ownerOf,
  type Board as BoardModel,
  type GameState,
  type Move,
  type Player,
} from '../game/engine';
import {
  BAR_W,
  BAR_X,
  BH,
  BW,
  COL_W,
  FRAME,
  INNER_BOTTOM,
  INNER_TOP,
  PIECE,
  ROW_H,
  TRAY_X,
  TRAY_W,
  TRI_H,
  barPos,
  engineIndex,
  pointGeom,
  stackPos,
  trayPos,
} from './geometry';
import { DicePanel } from './Dice';

export interface LastMove {
  move: Move;
  player: Player;
  seq: number;
}

interface Piece {
  id: string;
  player: Player;
  loc: string; // p0..p23 | bar | off
}

interface BoardProps {
  game: GameState;
  flip: boolean;
  bottomPlayer: Player;
  selected: number | 'bar' | null;
  onSelect: (loc: number | 'bar' | null) => void;
  onMove: (to: number | 'off') => void;
  onRoll: () => void;
  canRoll: boolean;
  lastMove: LastMove | null;
  scale: number;
  interactive: boolean;
  thinking?: boolean;
}

let pieceId = 0;
const nextId = () => `pc${pieceId++}`;

function piecesFromBoard(board: BoardModel): Piece[] {
  const out: Piece[] = [];
  for (const p of [0, 1] as Player[]) {
    for (let i = 0; i < 24; i++) {
      for (let k = 0; k < countAt(board, p, i); k++) out.push({ id: nextId(), player: p, loc: `p${i}` });
    }
    for (let k = 0; k < board.bar[p]; k++) out.push({ id: nextId(), player: p, loc: 'bar' });
    for (let k = 0; k < board.off[p]; k++) out.push({ id: nextId(), player: p, loc: 'off' });
  }
  return out;
}

function reconcile(pieces: Piece[], board: BoardModel): Piece[] {
  const out: Piece[] = [];
  for (const p of [0, 1] as Player[]) {
    const mine = pieces.filter((x) => x.player === p);
    const byLoc = (loc: string) => mine.filter((x) => x.loc === loc);

    for (let i = 0; i < 24; i++) {
      const have = byLoc(`p${i}`);
      const want = countAt(board, p, i);
      out.push(...have.slice(0, want));
      for (let k = have.length; k < want; k++) out.push({ id: nextId(), player: p, loc: `p${i}` });
    }
    const bar = byLoc('bar');
    const wantBar = board.bar[p];
    out.push(...bar.slice(0, wantBar));
    for (let k = bar.length; k < wantBar; k++) out.push({ id: nextId(), player: p, loc: 'bar' });

    const off = byLoc('off');
    const wantOff = board.off[p];
    out.push(...off.slice(0, wantOff));
    for (let k = off.length; k < wantOff; k++) out.push({ id: nextId(), player: p, loc: 'off' });
  }
  return out;
}

export function Board({
  game,
  flip,
  bottomPlayer,
  selected,
  onSelect,
  onMove,
  onRoll,
  canRoll,
  lastMove,
  scale,
  interactive,
  thinking,
}: BoardProps) {
  const topPlayer: Player = bottomPlayer === 0 ? 1 : 0;
  const [pieces, setPieces] = useState<Piece[]>(() => piecesFromBoard(game.board));
  const piecesRef = useRef<Piece[]>(pieces);
  const seqRef = useRef(-1);
  const [flash, setFlash] = useState<{ from: number | 'bar' | 'off'; to: number | 'bar' | 'off' } | null>(null);

  useLayoutEffect(() => {
    let next = piecesRef.current.slice();
    if (lastMove && lastMove.seq !== seqRef.current) {
      seqRef.current = lastMove.seq;
      const { move, player } = lastMove;
      const fromLoc = move.from === 'bar' ? 'bar' : `p${move.from}`;
      const toLoc = move.to === 'off' ? 'off' : `p${move.to}`;
      const idx = next.map((p) => p.player === player && p.loc === fromLoc).lastIndexOf(true);
      if (idx >= 0) {
        const [moved] = next.splice(idx, 1);
        next.push({ ...moved, loc: toLoc });
      }
      if (move.hit) {
        const opp = player === 0 ? 1 : 0;
        const hitIdx = next.map((p) => p.player === opp && p.loc === toLoc).lastIndexOf(true);
        if (hitIdx >= 0) {
          const [hit] = next.splice(hitIdx, 1);
          next.push({ ...hit, loc: 'bar' });
        }
      }
      setFlash({ from: move.from, to: move.to });
    }
    next = reconcile(next, game.board);
    piecesRef.current = next;
    setPieces(next);
  }, [game.board, lastMove]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1100);
    return () => clearTimeout(t);
  }, [flash]);

  const legal = useMemo(
    () => (interactive && game.phase === 'move' ? legalFirstMoves(game.board, game.turn, game.dice) : []),
    [interactive, game.phase, game.board, game.turn, game.dice],
  );

  const movable = useMemo(() => {
    const s = new Set<number | 'bar'>();
    for (const m of legal) s.add(m.from);
    return s;
  }, [legal]);

  const targetMap = useMemo(() => {
    const map = new Map<number | 'off', number>();
    if (selected === null) return map;
    for (const m of legal) {
      if (m.from !== selected) continue;
      const prev = map.get(m.to);
      if (prev === undefined || m.die > prev) map.set(m.to, m.die);
    }
    return map;
  }, [legal, selected]);

  const viewOf = (engineIdx: number) => (flip ? 23 - engineIdx : engineIdx);
  const toEngine = (v: number) => engineIndex(v, flip);

  const byLoc = useMemo(() => {
    const map = new Map<string, Piece[]>();
    for (const p of pieces) {
      const key = `${p.player}:${p.loc}`;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [pieces]);

  const rendered: Array<{ piece: Piece; x: number; y: number; d: number; z: number }> = [];

  for (let v = 0; v < 24; v++) {
    const engine = toEngine(v);
    const p = ownerOf(game.board.pts[engine]);
    if (p === null) continue;
    const list = byLoc.get(`${p}:p${engine}`) ?? [];
    list.forEach((piece, i) => {
      const pos = stackPos(v, i, list.length);
      rendered.push({ piece, x: pos.x, y: pos.y, d: PIECE, z: 10 + i });
    });
  }

  for (const p of [0, 1] as Player[]) {
    const bar = byLoc.get(`${p}:bar`) ?? [];
    const isBottom = p === bottomPlayer;
    bar.forEach((piece, i) => {
      const pos = barPos(isBottom, i, bar.length);
      rendered.push({ piece, x: pos.x, y: pos.y, d: 52, z: 60 + i });
    });
    const off = byLoc.get(`${p}:off`) ?? [];
    off.forEach((piece, i) => {
      const pos = trayPos(isBottom, i, off.length);
      rendered.push({ piece, x: pos.x, y: pos.y, d: 56, z: 5 + i });
    });
  }

  const triColors = (v: number) => (v + 12) % 2 === 0;
  const flashView = (loc: number | 'bar' | 'off') => {
    if (loc === 'bar') return null;
    if (loc === 'off') return null;
    return viewOf(loc);
  };

  return (
    <div
      className="board"
      style={{ width: BW * scale, height: BH * scale }}
      data-bottom={bottomPlayer}
      data-turn={game.turn}
    >
      <svg className="board-art" viewBox={`0 0 ${BW} ${BH}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="woodFrame" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#5a3a20" />
            <stop offset="18%" stopColor="#3d2514" />
            <stop offset="47%" stopColor="#4c2f1b" />
            <stop offset="72%" stopColor="#2e1b0d" />
            <stop offset="100%" stopColor="#1d1108" />
          </linearGradient>
          <linearGradient id="felt" x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0%" stopColor="#2a1a12" />
            <stop offset="52%" stopColor="#221410" />
            <stop offset="100%" stopColor="#180d09" />
          </linearGradient>
          <linearGradient id="pointLight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f2e3c1" />
            <stop offset="55%" stopColor="#e3cfa6" />
            <stop offset="100%" stopColor="#c5ac7d" />
          </linearGradient>
          <linearGradient id="pointDark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8e2b3c" />
            <stop offset="60%" stopColor="#6d1f2e" />
            <stop offset="100%" stopColor="#45121e" />
          </linearGradient>
          <linearGradient id="barMetal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1a0f09" />
            <stop offset="35%" stopColor="#40281a" />
            <stop offset="55%" stopColor="#573823" />
            <stop offset="75%" stopColor="#3a2416" />
            <stop offset="100%" stopColor="#160c07" />
          </linearGradient>
          <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f7e6b6" />
            <stop offset="45%" stopColor="#d9b877" />
            <stop offset="100%" stopColor="#a8823f" />
          </linearGradient>
          <radialGradient id="glow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#ffcf8a" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffcf8a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="tray" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#140c07" />
            <stop offset="50%" stopColor="#241610" />
            <stop offset="100%" stopColor="#0f0805" />
          </linearGradient>
          <filter id="innerShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.55" />
          </filter>
        </defs>

        <rect x="0" y="0" width={BW} height={BH} rx="20" fill="url(#woodFrame)" />
        <rect x="5" y="5" width={BW - 10} height={BH - 10} rx="16" fill="none" stroke="url(#gold)" strokeOpacity="0.42" strokeWidth="2" />
        <rect x="12" y="12" width={BW - 24} height={BH - 24} rx="12" fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="2" />

        <rect x={FRAME} y={FRAME} width={TRAY_X - FRAME} height={INNER_BOTTOM - INNER_TOP} rx="4" fill="url(#felt)" />
        <rect x={FRAME} y={FRAME} width={TRAY_X - FRAME} height={INNER_BOTTOM - INNER_TOP} rx="4" fill="url(#glow)" opacity="0.5" />

        {Array.from({ length: 24 }, (_, v) => {
          const g = pointGeom(v);
          const half = COL_W / 2 - 2.5;
          const pts = g.top
            ? `${g.x - half},${INNER_TOP} ${g.x + half},${INNER_TOP} ${g.x},${INNER_TOP + TRI_H}`
            : `${g.x - half},${INNER_BOTTOM} ${g.x + half},${INNER_BOTTOM} ${g.x},${INNER_BOTTOM - TRI_H}`;
          return (
            <polygon
              key={v}
              points={pts}
              fill={triColors(v) ? 'url(#pointLight)' : 'url(#pointDark)'}
              stroke={triColors(v) ? '#8d7448' : '#2a0a12'}
              strokeOpacity="0.55"
              strokeWidth="1"
            />
          );
        })}

        <rect x={BAR_X} y={FRAME} width={BAR_W} height={INNER_BOTTOM - INNER_TOP} fill="url(#barMetal)" />
        <line x1={BAR_X + 1} y1={FRAME} x2={BAR_X + 1} y2={INNER_BOTTOM} stroke="#000" strokeOpacity="0.7" />
        <line x1={BAR_X + BAR_W - 1} y1={FRAME} x2={BAR_X + BAR_W - 1} y2={INNER_BOTTOM} stroke="#000" strokeOpacity="0.7" />
        <line x1={BAR_X + 3.5} y1={FRAME} x2={BAR_X + 3.5} y2={INNER_BOTTOM} stroke="url(#gold)" strokeOpacity="0.22" />
        <line x1={BAR_X + BAR_W - 3.5} y1={FRAME} x2={BAR_X + BAR_W - 3.5} y2={INNER_BOTTOM} stroke="url(#gold)" strokeOpacity="0.22" />

        <rect x={TRAY_X} y={FRAME} width={TRAY_W} height={INNER_BOTTOM - INNER_TOP} fill="url(#tray)" />
        <line x1={TRAY_X + 1} y1={FRAME} x2={TRAY_X + 1} y2={INNER_BOTTOM} stroke="url(#gold)" strokeOpacity="0.3" />
        <line x1={TRAY_X + 3} y1={FRAME} x2={TRAY_X + 3} y2={INNER_BOTTOM} stroke="#000" strokeOpacity="0.45" />
        <line x1={TRAY_X + 1} y1={BH / 2} x2={TRAY_X + TRAY_W} y2={BH / 2} stroke="url(#gold)" strokeOpacity="0.3" />

        <line x1={FRAME} y1={BH / 2} x2={TRAY_X} y2={BH / 2} stroke="#000" strokeOpacity="0.35" strokeWidth="2" />
        <line x1={FRAME} y1={BH / 2} x2={TRAY_X} y2={BH / 2} stroke="url(#gold)" strokeOpacity="0.12" />

        {[FRAME + 14, TRAY_X - 14].map((cx) =>
          [FRAME + 12, INNER_BOTTOM - 12].map((cy) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.4" fill="url(#gold)" opacity="0.5" />
          )),
        )}

        {/* hareket eden taşın izi */}
        {flash && flashView(flash.from) !== null && (() => {
          const g = pointGeom(flashView(flash.from)!);
          return <circle cx={g.x} cy={g.baseY + g.dir * 26} r="30" fill="url(#glow)" />;
        })()}
        {flash && flash.to !== 'off' && flash.to !== 'bar' && (() => {
          const g = pointGeom(viewOf(flash.to as number));
          return <circle cx={g.x} cy={g.baseY + g.dir * 26} r="30" fill="url(#glow)" />;
        })()}

        <rect x={FRAME} y={FRAME} width={TRAY_X - FRAME} height={INNER_BOTTOM - INNER_TOP} rx="4" fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="2" filter="url(#innerShadow)" />
      </svg>

      {/* taşlar */}
      <div className="pieces">
        {rendered.map(({ piece, x, y, d, z }) => {
          const isSelected =
            (selected === 'bar' && piece.loc === 'bar' && piece.player === game.turn) ||
            (typeof selected === 'number' && piece.loc === `p${selected}` && piece.player === game.turn);
          return (
            <div
              key={piece.id}
              className={`piece ${piece.player === 0 ? 'ivory' : 'onyx'}${isSelected ? ' selected' : ''}${
                piece.loc === 'off' ? ' offed' : ''
              }`}
              style={{
                width: d * scale,
                height: d * scale,
                transform: `translate3d(${x * scale - (d * scale) / 2}px, ${y * scale - (d * scale) / 2}px, 0)`,
                zIndex: z,
              }}
            >
              <span className="sheen" />
            </div>
          );
        })}
      </div>

      {/* kep atılan taş sayıları */}
      <div className="tray-count top" style={{ top: FRAME * scale, right: (BW - TRAY_X - TRAY_W) * scale }}>
        <b>{game.board.off[topPlayer]}</b>
        <i>çıkan</i>
      </div>
      <div className="tray-count bottom" style={{ bottom: FRAME * scale, right: (BW - TRAY_X - TRAY_W) * scale }}>
        <b>{game.board.off[bottomPlayer]}</b>
        <i>çıkan</i>
      </div>

      {/* tıklama alanları */}
      {Array.from({ length: 24 }, (_, v) => {
        const g = pointGeom(v);
        const isTarget = targetMap.has(toEngine(v));
        const isMovable = movable.has(toEngine(v));
        return (
          <button
            key={`hit-${v}`}
            className={`point-hit${isTarget ? ' target' : ''}${isMovable ? ' movable' : ''}`}
            style={{
              left: (g.x - COL_W / 2) * scale,
              top: (g.top ? INNER_TOP : BH / 2) * scale,
              width: COL_W * scale,
              height: ROW_H * scale,
            }}
            aria-label={`${toEngine(v) + 1}. hane`}
            onClick={() => {
              if (isTarget) onMove(toEngine(v));
              else if (isMovable) onSelect(toEngine(v));
              else onSelect(null);
            }}
          >
            {isMovable && !isTarget && <span className="move-dot" />}
            {isTarget && (
              <span className="target-ring">
                <em>{targetMap.get(toEngine(v))}</em>
              </span>
            )}
          </button>
        );
      })}

      {/* kırık taş alanları */}
      {[0, 1].map((raw) => {
        const p = raw as Player;
        const isBottom = p === bottomPlayer;
        const count = game.board.bar[p];
        const canEnter = p === game.turn && movable.has('bar');
        const selectedHere = selected === 'bar' && game.turn === p;
        return (
          <button
            key={`bar-${p}`}
            className={`bar-hit${canEnter ? ' movable' : ''}${selectedHere ? ' active' : ''}`}
            style={{
              left: BAR_X * scale,
              top: (isBottom ? BH / 2 : FRAME) * scale,
              width: BAR_W * scale,
              height: ((INNER_BOTTOM - INNER_TOP) / 2) * scale,
            }}
            onClick={() => (canEnter ? onSelect('bar') : onSelect(null))}
            aria-label={p === bottomPlayer ? 'kırık taşların' : 'rakibin kırık taşları'}
          >
            {canEnter && count > 0 && !selectedHere && <span className="move-dot" />}
          </button>
        );
      })}

      {/* kep atış hedefi */}
      {targetMap.has('off') && (
        <button
          className="off-target"
          style={{ right: 6 * scale, top: (BH / 2 - ROW_H / 2) * scale, width: (TRAY_W + 6) * scale, height: ROW_H * scale }}
          onClick={() => onMove('off')}
          aria-label="taş çıkar"
        >
          <span className="target-ring">
            <em>{targetMap.get('off')}</em>
          </span>
        </button>
      )}

      <DicePanel
        dice={game.dice}
        rolled={game.rolled}
        phase={game.phase}
        canRoll={canRoll}
        onRoll={onRoll}
        scale={scale}
        thinking={thinking}
      />
    </div>
  );
}
