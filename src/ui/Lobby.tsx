import { useState } from 'react';

export type LobbyState = 'idle' | 'hosting' | 'joining' | 'joined' | 'error';

interface LobbyProps {
  mode: 'host' | 'join';
  state: LobbyState;
  code: string;
  joinCode: string;
  setJoinCode: (v: string) => void;
  status: string;
  error: string | null;
  guestName: string | null;
  onJoin: () => void;
  onStart: () => void;
  onBack: () => void;
  onCopy: () => void;
  onEmote?: (e: string) => void;
  netKind: 'online' | 'ble';
  bleAvailable: boolean;
  onNetKind: (kind: 'online' | 'ble') => void;
  onSwitchMode: (mode: 'host' | 'join') => void;
}

export function Lobby({
  mode,
  state,
  code,
  joinCode,
  setJoinCode,
  status,
  error,
  guestName,
  onJoin,
  onStart,
  onBack,
  onCopy,
  netKind,
  bleAvailable,
  onNetKind,
  onSwitchMode,
}: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const ble = netKind === 'ble';

  const copy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="lobby-screen">
      <button className="back-btn" onClick={onBack}>
        ‹ Geri
      </button>

      <div className="lobby-card">
        <div className="net-switch" role="tablist" aria-label="bağlantı türü">
          <button
            role="tab"
            aria-selected={!ble}
            className={`net-tab${!ble ? ' active' : ''}`}
            onClick={() => onNetKind('online')}
          >
            🌐 İnternet
          </button>
          <button
            role="tab"
            aria-selected={ble}
            className={`net-tab${ble ? ' active' : ''}`}
            onClick={() => {
              if (bleAvailable) onNetKind('ble');
            }}
            disabled={!bleAvailable}
            title={bleAvailable ? 'İnternet gerekmez' : 'Bluetooth yalnızca Android uygulamasında çalışır'}
          >
            📶 Bluetooth
          </button>
        </div>

        <span className="card-kicker">{ble ? 'Yakın oyun · internet yok' : 'Bekleme salonu'}</span>
        <h2>{mode === 'host' ? (ble ? 'Bluetooth Odası' : 'Oda Kur') : 'Odaya Katıl'}</h2>

        {mode === 'host' ? (
          <>
            {code ? (
              <>
                <div className="room-code" aria-label={`oda kodu ${code}`}>
                  {code.split('').map((c, i) => (
                    <span key={i}>{c}</span>
                  ))}
                </div>
                <button className="ghost-btn small copy-btn" onClick={copy} hidden={ble}>
                  {copied ? '✓ Kopyalandı' : 'Davet linkini kopyala'}
                </button>

                <div className={`lobby-status ${guestName ? 'ok' : 'wait'}`}>
                  {guestName ? (
                    <>
                      <span className="dot live" /> <b>{guestName}</b> odaya katıldı
                    </>
                  ) : (
                    <>
                      <span className="dot pulse" /> Rakip bekleniyor…
                    </>
                  )}
                </div>

                <button className="primary-btn" onClick={onStart} disabled={!guestName}>
                  Oyunu Başlat
                </button>
                <p className="hint">
                  {ble
                    ? 'Diğer telefon da Bluetooth sekmesinden bu kodu girsin. İki cihazı yakın tut; internet gerekmez.'
                    : 'İpucu: linki gönderdiğin kişi oyunu açtığında oda otomatik dolar. Kodu elle de girebilir.'}
                </p>
              </>
            ) : (
              <div className="lobby-loading">
                <span className="dot pulse" /> Oda hazırlanıyor…
              </div>
            )}
          </>
        ) : (
          <>
            <label className="field-label" htmlFor="code">
              Oda kodu
            </label>
            <input
              id="code"
              className="code-input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
              placeholder="ABCD"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="primary-btn" onClick={onJoin} disabled={joinCode.length < 4 || state === 'joining'}>
              {state === 'joining' ? 'Bağlanıyor…' : ble ? 'Bluetooth ile bağlan' : 'Katıl'}
            </button>
            <div className={`lobby-status ${state === 'error' ? 'err' : 'wait'}`}>
              <span className="dot pulse" /> {error ?? status}
            </div>
          </>
        )}

        {error && mode === 'host' && <div className="lobby-status err">{error}</div>}

        <button className="mode-switch" onClick={() => onSwitchMode(mode === 'host' ? 'join' : 'host')}>
          {mode === 'host' ? 'Odaya katılacak mısın? Koda katıl ›' : 'Oda mı kuracaksın? Oda kur ›'}
        </button>
      </div>

      <div className="lobby-side">
        <div className="lobby-tip">
          <b>Nasıl oynanır?</b>
          <ol>
            {ble ? (
              <>
                <li>İki telefonda da Bluetooth’u aç.</li>
                <li>Oda kur, 4 harflik kodu diğer telefona gir.</li>
                <li>“Oyunu Başlat”a bas, internet olmadan oynayın.</li>
              </>
            ) : (
              <>
                <li>Odayı kur, 4 harflik kodu paylaş.</li>
                <li>Rakip kodu girip salona gelir.</li>
                <li>“Oyunu Başlat”a bas, zar senin olsun.</li>
              </>
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}
