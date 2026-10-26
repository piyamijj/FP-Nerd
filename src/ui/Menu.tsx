import type { Level } from '../game/ai';
import type { Settings } from '../settings';

interface MenuProps {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onStartAI: () => void;
  onStartLocal: () => void;
  onHost: () => void;
  onJoin: () => void;
  onBluetooth: () => void;
  onFullscreen: () => void;
  onInstall?: () => void;
  canInstall: boolean;
  installLabel: string;
}

const LEVELS: Array<{ key: Level; label: string; note: string }> = [
  { key: 'kolay', label: 'Kolay', note: 'Rahat ısınma' },
  { key: 'normal', label: 'Normal', note: 'Dengeli rakip' },
  { key: 'zor', label: 'Zor', note: 'Hesapçı usta' },
];

function Mark() {
  return (
    <svg viewBox="0 0 64 64" className="mark" aria-hidden="true">
      <defs>
        <linearGradient id="mg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8e9bd" />
          <stop offset="55%" stopColor="#d6b472" />
          <stop offset="100%" stopColor="#9c7635" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#1a100a" stroke="url(#mg)" strokeWidth="2" />
      <path d="M12 16h16l-8 14z" fill="url(#mg)" opacity="0.9" />
      <path d="M36 16h16l-8 14z" fill="#7d2331" />
      <path d="M12 48h16l-8-14z" fill="#7d2331" />
      <path d="M36 48h16l-8-14z" fill="url(#mg)" opacity="0.9" />
      <circle cx="32" cy="32" r="9" fill="#f7ecd4" />
      <circle cx="32" cy="32" r="9" fill="none" stroke="#b9975f" strokeWidth="1.5" />
      <circle cx="29" cy="29" r="2.6" fill="#fffdf5" opacity="0.85" />
    </svg>
  );
}

export function Menu({
  settings,
  update,
  onStartAI,
  onStartLocal,
  onHost,
  onJoin,
  onBluetooth,
  onFullscreen,
  onInstall,
  canInstall,
  installLabel,
}: MenuProps) {
  return (
    <div className="menu-screen">
      <div className="menu-aurora" aria-hidden="true" />
      <div className="menu-inner">
        <header className="brand">
          <Mark />
          <div className="brand-text">
            <span className="brand-top">FP · NERD</span>
            <h1>TAVLA</h1>
            <span className="brand-sub">ahşap tahta · iri taşlar · gerçek tavla keyfi</span>
          </div>
          <div className="brand-actions">
            <button className="icon-btn" onClick={() => update({ sound: !settings.sound })} aria-label="ses">
              {settings.sound ? '🔊' : '🔇'}
            </button>
            <button className="icon-btn" onClick={onFullscreen} aria-label="tam ekran">
              ⛶
            </button>
          </div>
        </header>

        <div className="mode-grid">
          <section className="mode-card featured">
            <div className="card-head">
              <span className="card-kicker">Tek başına</span>
              <h2>Bilgisayara Karşı</h2>
            </div>
            <div className="level-row" role="group" aria-label="zorluk">
              {LEVELS.map((l) => (
                <button
                  key={l.key}
                  className={`level-pill${settings.level === l.key ? ' active' : ''}`}
                  onClick={() => update({ level: l.key })}
                >
                  <b>{l.label}</b>
                  <i>{l.note}</i>
                </button>
              ))}
            </div>
            <button className="primary-btn" onClick={onStartAI}>
              Oyna
            </button>
          </section>

          <section className="mode-card">
            <div className="card-head">
              <span className="card-kicker">Aynı cihaz</span>
              <h2>İki Kişilik</h2>
            </div>
            <p className="card-note">Telefonu arkadaşına uzat, sırayla oynayın. Aynı tahtada, aynı heyecan.</p>
            <button className="ghost-btn" onClick={onStartLocal}>
              2 Kişi Oyna
            </button>
          </section>

          <section className="mode-card">
            <div className="card-head">
              <span className="card-kicker">İnternet</span>
              <h2>Online Tavla</h2>
            </div>
            <p className="card-note">Oda kur, davet linkini gönder. Bekleme salonunda buluşun, dilediğin yerde oynayın.</p>
            <div className="btn-row">
              <button className="primary-btn small" onClick={onHost}>
                Oda Kur
              </button>
              <button className="ghost-btn small" onClick={onJoin}>
                Koda Katıl
              </button>
            </div>
          </section>

          <section className="mode-card dim">
            <div className="card-head">
              <span className="card-kicker">
                Yakın oyun <em className="tag">APK</em>
              </span>
              <h2>Bluetooth</h2>
            </div>
            <p className="card-note">İnternet olmadan, yanındaki telefonla eşleş. Android uygulamasında kullanılabilir.</p>
            <button className="ghost-btn" onClick={onBluetooth}>
              Nasıl Çalışır?
            </button>
          </section>
        </div>

        <footer className="menu-foot">
          <span>15 taş · 24 hane · mars 2 · mars-üstü 3</span>
          <div className="foot-actions">
            {canInstall && (
              <button className="link-btn" onClick={onInstall}>
                {installLabel}
              </button>
            )}
            <a
              className="link-btn"
              href="https://github.com/piyamijj/FP-Nerd/releases/latest"
              target="_blank"
              rel="noreferrer"
            >
              APK indir
            </a>
            <a className="link-btn" href="https://github.com/piyamijj/FP-Nerd" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
