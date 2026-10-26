import type { Player } from '../game/engine';

interface PlayerCardProps {
  name: string;
  seat: Player;
  you: boolean;
  score: number;
  pips: number;
  bar: number;
  off: number;
  active: boolean;
  thinking?: boolean;
}

export function PlayerCard({ name, seat, you, score, pips, bar, off, active, thinking }: PlayerCardProps) {
  return (
    <div className={`player-card seat-${seat}${active ? ' active' : ''}${you ? ' you' : ''}`}>
      <div className={`avatar ${seat === 0 ? 'ivory' : 'onyx'}`}>
        <span>{name.trim().slice(0, 1).toUpperCase() || '?'}</span>
      </div>
      <div className="pc-body">
        <div className="pc-name">
          {name}
          {you && <em>sen</em>}
        </div>
        <div className="pc-stats">
          <span title="pip">◈ {pips}</span>
          <span title="kırık">⚑ {bar}</span>
          <span title="çıkan">✓ {off}</span>
        </div>
      </div>
      <div className="pc-score" title="maç puanı">
        {score}
      </div>
      {active && <span className="pc-turn">{thinking ? '…' : 'SIRA'}</span>}
    </div>
  );
}
