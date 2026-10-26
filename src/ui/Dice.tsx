import { useEffect, useRef, useState } from 'react';
import { BH, BW } from './geometry';

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [30, 30],
    [70, 70],
  ],
  3: [
    [30, 30],
    [50, 50],
    [70, 70],
  ],
  4: [
    [30, 30],
    [70, 30],
    [30, 70],
    [70, 70],
  ],
  5: [
    [30, 30],
    [70, 30],
    [50, 50],
    [30, 70],
    [70, 70],
  ],
  6: [
    [30, 26],
    [70, 26],
    [30, 50],
    [70, 50],
    [30, 74],
    [70, 74],
  ],
};

function Die({ value, size, dim }: { value: number; size: number; dim?: boolean }) {
  return (
    <div className={`die${dim ? ' dim' : ''}`} style={{ width: size, height: size, borderRadius: size * 0.24 }}>
      {PIPS[value]?.map(([x, y], i) => (
        <span
          key={i}
          className="pip"
          style={{
            width: size * 0.16,
            height: size * 0.16,
            left: `${x}%`,
            top: `${y}%`,
          }}
        />
      ))}
    </div>
  );
}

interface DicePanelProps {
  dice: number[];
  rolled: number[];
  phase: string;
  canRoll: boolean;
  onRoll: () => void;
  scale: number;
  thinking?: boolean;
}

export function DicePanel({ dice, rolled, phase, canRoll, onRoll, scale, thinking }: DicePanelProps) {
  const [faces, setFaces] = useState<[number, number]>([1, 1]);
  const [rolling, setRolling] = useState(false);
  const keyRef = useRef('');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const key = rolled.join('-');
    if (!rolled.length) {
      keyRef.current = '';
      setFaces([1, 1]);
      return;
    }
    if (key === keyRef.current) return;
    keyRef.current = key;

    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRolling(true);
    const spin = window.setInterval(() => {
      setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    }, 62);
    const done = window.setTimeout(() => {
      clearInterval(spin);
      setFaces([rolled[0], rolled[1]]);
      setRolling(false);
    }, 430);
    timers.current.push(done);
    return () => {
      clearInterval(spin);
      clearTimeout(done);
    };
  }, [rolled]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const idle = phase === 'roll';
  const dbl = rolled.length === 2 && rolled[0] === rolled[1];
  const usedOut = dice.length === 0;
  const label = thinking
    ? 'DÜŞÜNÜYOR'
    : idle
      ? canRoll
        ? 'ZAR AT'
        : 'SIRA RAKİPTE'
      : phase === 'over'
        ? 'OYUN BİTTİ'
        : dice.length === 0
          ? 'SIRA GEÇTİ'
          : `${dice.length} hamle`;

  const dieSize = 46 * scale;
  const w = 150 * scale;
  const h = 104 * scale;
  const cx = (BW / 2) * scale;
  const cy = (BH / 2) * scale;

  return (
    <div
      className={`dice-panel${canRoll ? ' can-roll' : ''}${rolling ? ' rolling' : ''}${idle && !canRoll ? ' waiting' : ''}`}
      style={{
        width: w,
        height: h,
        transform: `translate3d(${cx - w / 2}px, ${cy - h / 2}px, 0)`,
      }}
    >
      <button className="dice-hit" onClick={() => canRoll && onRoll()} aria-label="zar at" disabled={!canRoll} />
      <div className="dice-row" style={{ gap: 10 * scale }}>
        {idle && !rolled.length && !rolling ? (
          <>
            <div className="die ghost" style={{ width: dieSize, height: dieSize, borderRadius: dieSize * 0.24 }}>
              <span>?</span>
            </div>
            <div className="die ghost" style={{ width: dieSize, height: dieSize, borderRadius: dieSize * 0.24 }}>
              <span>?</span>
            </div>
          </>
        ) : (
          <>
            <Die value={rolling ? faces[0] : rolled[0] ?? 1} size={dieSize} dim={!rolling && usedOut} />
            <Die value={rolling ? faces[1] : rolled[1] ?? 1} size={dieSize} dim={!rolling && usedOut} />
            {dbl && !rolling && dice.length > 0 && (
              <span className="dbl-badge" style={{ fontSize: 11 * scale, padding: `${2 * scale}px ${5 * scale}px` }}>
                ×{dice.length}
              </span>
            )}
          </>
        )}
      </div>
      <div className="dice-label" style={{ fontSize: 10 * scale, letterSpacing: 1.4 * scale }}>
        {label}
      </div>
    </div>
  );
}
