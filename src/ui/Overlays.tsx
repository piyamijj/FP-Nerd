import type { GameResult } from '../game/engine';

const KIND_TEXT: Record<GameResult['kind'], string> = {
  tek: 'Tek oyun',
  mars: 'Mars!',
  'mars-ustu': 'Mars-üstü!',
};

export function ResultModal({
  result,
  names,
  match,
  localSeat,
  onAgain,
  onMenu,
}: {
  result: GameResult;
  names: [string, string];
  match: [number, number];
  localSeat: 0 | 1;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const youWon = result.winner === localSeat;
  return (
    <div className="overlay">
      <div className={`result-card ${youWon ? 'win' : 'lose'}`}>
        <span className="result-kicker">{KIND_TEXT[result.kind]}</span>
        <h2>{youWon ? 'Kazandın!' : `${names[result.winner]} kazandı`}</h2>
        <p className="result-sub">
          {result.points} puan · maç {match[0]} – {match[1]}
        </p>
        <div className="result-trophy" aria-hidden>
          {youWon ? '🏆' : '🎲'}
        </div>
        <div className="result-actions">
          <button className="primary-btn" onClick={onAgain}>
            Yeni Oyun
          </button>
          <button className="ghost-btn" onClick={onMenu}>
            Menü
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}

export function RotateHint() {
  return (
    <div className="rotate-hint">
      <div className="rotate-phone" aria-hidden>
        <span />
      </div>
      <h2>Telefonu yan çevir</h2>
      <p>Tahta yatay modda tam ekran ve çok daha keyifli.</p>
    </div>
  );
}

export function BluetoothInfo({ onClose, available }: { onClose: () => void; available: boolean }) {
  return (
    <div className="overlay">
      <div className="info-card">
        <span className="card-kicker">Yakın oyun</span>
        <h2>Bluetooth ile tavla</h2>
        {available ? (
          <p>Bluetooth modu bu cihazda hazır. Salonda “Bluetooth ile eşleş” seçeneğini kullan.</p>
        ) : (
          <>
            <p>
              Bluetooth, tarayıcıların izin verdiği bir özellik değil. Bu yüzden iki telefonun doğrudan
              eşleşmesi yalnızca <b>Android uygulamasında</b> çalışır.
            </p>
            <ul>
              <li>GitHub Releases sayfasından APK’yı indir.</li>
              <li>İki telefonda da uygulamayı aç.</li>
              <li>Salonda “Bluetooth” seç, kodu eşleştir.</li>
            </ul>
            <p className="muted">İnternet varken online oda, yoksa aynı cihazda iki kişilik mod her zaman hazır.</p>
          </>
        )}
        <div className="result-actions">
          <a className="primary-btn" href="https://github.com/piyamijj/FP-Nerd/releases/latest" target="_blank" rel="noreferrer">
            APK’yı indir
          </a>
          <button className="ghost-btn" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
