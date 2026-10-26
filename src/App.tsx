import { useCallback, useEffect, useRef, useState } from 'react';
import { legalFirstMoves, makeRng, pipCount, type GameState, type Move, type Player } from './game/engine';
import { LEVEL_LABEL, chooseSequence, type Level } from './game/ai';
import { newGame, nextGame, playMove, startRoll } from './game/state';
import { PeerGuest, PeerHost, createRoomCode, type Action, type NetMsg, type Transport } from './net/peer';
import { BleGuest, BleHost, bleSupported } from './net/ble';
import { Board, type LastMove } from './ui/Board';
import { Menu } from './ui/Menu';
import { Lobby, type LobbyState } from './ui/Lobby';
import { PlayerCard } from './ui/PlayerCard';
import { BluetoothInfo, ResultModal, RotateHint, Toast } from './ui/Overlays';
import { useStageFit, goFullscreen, useWakeLock } from './hooks/useStage';
import { haptic, setSoundEnabled, sfx, unlockAudio } from './audio/sfx';
import { loadSettings, saveSettings, type Settings } from './settings';

type Screen = 'menu' | 'game' | 'lobby';
type Mode = 'ai' | 'local' | 'online';
type NetKind = 'online' | 'ble';

interface Session {
  mode: Mode;
  level: Level;
  seat: Player;
  names: [string, string];
  role?: 'host' | 'guest';
  code?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [screen, setScreen] = useState<Screen>('menu');
  const [game, setGame] = useState<GameState>(() => newGame());
  const [session, setSession] = useState<Session | null>(null);
  const [selected, setSelected] = useState<number | 'bar' | null>(null);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [pending, setPending] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [bleInfo, setBleInfo] = useState(false);

  // Lobideki durum
  const [lobbyMode, setLobbyMode] = useState<'host' | 'join'>('host');
  const [lobbyState, setLobbyState] = useState<LobbyState>('idle');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [netKind, setNetKind] = useState<NetKind>('online');

  const { ref: stageRef, scale } = useStageFit();
  useWakeLock();

  const gameRef = useRef(game);
  const sessionRef = useRef<Session | null>(null);
  const hostRef = useRef<Transport | null>(null);
  const guestRef = useRef<Transport | null>(null);
  const moveSeq = useRef(0);
  const aiPlan = useRef<{ key: string; moves: Move[] } | null>(null);
  const rng = useRef(makeRng(Date.now() & 0x7fffffff));
  const pendingTimer = useRef<number | null>(null);

  gameRef.current = game;
  sessionRef.current = session;

  const me = settings.name.trim() || 'Sen';
  const netName = settings.name.trim() || 'Rakip';

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2400);
  }, []);

  /* ---------- ayarlar ---------- */
  useEffect(() => {
    saveSettings(settings);
    setSoundEnabled(settings.sound);
  }, [settings]);

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  /* ---------- tam ekran / ses kilidi ---------- */
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const enterGame = useCallback((nextGameState: GameState, nextSession: Session) => {
    gameRef.current = nextGameState;
    setGame(nextGameState);
    setSession(nextSession);
    setSelected(null);
    setLastMove(null);
    setPending(false);
    setResultOpen(false);
    setPauseOpen(false);
    setScreen('game');
    void goFullscreen();
  }, []);

  const commit = useCallback((next: GameState, broadcasts: Move[] = [], by: Player = 0) => {
    let out = next;
    if (broadcasts.length) {
      moveSeq.current += 1;
      const seq = moveSeq.current;
      setLastMove({ move: broadcasts[broadcasts.length - 1], player: by, seq });
      out = next;
    }
    gameRef.current = out;
    setGame(out);
    const s = sessionRef.current;
    if (s?.mode === 'online' && s.role === 'host') {
      hostRef.current?.send({ t: 'state', state: out, moves: broadcasts, by });
    }
    if (out.phase === 'over') {
      setSelected(null);
      window.setTimeout(() => setResultOpen(true), 780);
    }
  }, []);

  /* ---------- oyun başlatma ---------- */
  const startVsAI = useCallback(() => {
    const s: Session = { mode: 'ai', level: settings.level, seat: 0, names: [me, `FP-Nerd · ${LEVEL_LABEL[settings.level]}`] };
    aiPlan.current = null;
    enterGame(newGame(), s);
  }, [enterGame, me, settings.level]);

  const startLocal = useCallback(() => {
    enterGame(newGame(), { mode: 'local', level: 'normal', seat: 0, names: [me, 'Oyuncu 2'] });
  }, [enterGame, me]);

  /* ---------- online: oda kur ---------- */
  const cleanupNet = useCallback(() => {
    hostRef.current?.close();
    guestRef.current?.close();
    hostRef.current = null;
    guestRef.current = null;
    if (pendingTimer.current) window.clearTimeout(pendingTimer.current);
  }, []);

  const closeLobby = useCallback(() => {
    cleanupNet();
    setLobbyState('idle');
    setRoomCode('');
    setGuestName(null);
    setLobbyError(null);
    setScreen('menu');
    setSession(null);
  }, [cleanupNet]);

  const applyRemoteState = useCallback(
    (next: GameState, moves: Move[], by: Player) => {
      let out = next;
      if (moves.length) {
        moveSeq.current += 1;
        const seq = moveSeq.current;
        const mv = moves[moves.length - 1];
        setLastMove({ move: mv, player: by, seq });
        out = next;
        if (mv.hit) {
          sfx.hit();
          haptic(24);
        } else if (mv.to === 'off') {
          sfx.off();
        } else {
          sfx.move();
        }
      }
      gameRef.current = out;
      setGame(out);
      setPending(false);
      setSelected(null);
      if (out.phase === 'over') window.setTimeout(() => setResultOpen(true), 780);
    },
    [],
  );

  const hostIntent = useCallback(
    (action: Action) => {
      const cur = gameRef.current;
      if (cur.result || cur.turn !== 1) return;
      if (action.kind === 'roll') {
        const next = startRoll(cur, rng.current);
        commit(next, [], 1);
        return;
      }
      const next = playMove(cur, action.move);
      if (next === cur) return;
      if (action.move.hit) {
        sfx.hit();
      } else if (action.move.to === 'off') {
        sfx.off();
      } else {
        sfx.move();
      }
      commit(next, [action.move], 1);
    },
    [commit],
  );

  const hostRoom = useCallback(
    (kind: NetKind, attempt = 0) => {
      const code = createRoomCode();
      setRoomCode(code);
      setLobbyState('hosting');
      setLobbyError(null);
      setGuestName(null);
      const host: Transport = kind === 'ble' ? new BleHost(code) : new PeerHost(code);
      hostRef.current = host;
      host.onReady = () => setLobbyState('hosting');
      host.onOpen = () => {
        setLobbyState('joined');
        flash('Rakip bağlandı');
      };
      host.onMessage = (msg: NetMsg) => {
        if (msg.t === 'hello') {
          setGuestName(msg.name || 'Rakip');
          setLobbyState('joined');
        } else if (msg.t === 'intent') {
          hostIntent(msg.action);
        } else if (msg.t === 'rematch') {
          const fresh = nextGame(gameRef.current, 0);
          setLastMove(null);
          setResultOpen(false);
          commit(fresh, [], 0);
        }
      };
      host.onError = (message, fatal) => {
        if (fatal && attempt < 1 && kind === 'online') {
          host.close();
          hostRoom(kind, attempt + 1);
          return;
        }
        setLobbyError(message);
        setLobbyState('error');
      };
      host.onClose = () => {
        setGuestName(null);
        setLobbyState('hosting');
        flash('Rakip ayrıldı');
      };
    },
    [commit, flash, hostIntent],
  );

  const openHostLobby = useCallback(
    (kind: NetKind = 'online') => {
      cleanupNet();
      setNetKind(kind);
      setLobbyMode('host');
      setScreen('lobby');
      setGuestName(null);
      setLobbyError(null);
      hostRoom(kind);
    },
    [cleanupNet, hostRoom],
  );

  const joinRoom = useCallback(
    (rawCode: string, kind: NetKind) => {
      const code = rawCode.trim().toUpperCase();
      if (code.length !== 4) {
        setLobbyError('Oda kodu 4 karakter olmalı.');
        setLobbyState('error');
        return;
      }
      cleanupNet();
      setNetKind(kind);
      setLobbyMode('join');
      setScreen('lobby');
      setLobbyState('joining');
      setLobbyError(null);
      setJoinCode(code);

      const guest: Transport = kind === 'ble' ? new BleGuest(code) : new PeerGuest(code);
      guestRef.current = guest;
      guest.onOpen = () => {
        guest.send({ t: 'hello', name: netName });
        setLobbyState('joined');
      };
      guest.onMessage = (msg: NetMsg) => {
        if (msg.t === 'welcome') {
          setSession({
            mode: 'online',
            level: 'normal',
            seat: msg.seat,
            names: [msg.name || 'Rakip', me],
            role: 'guest',
            code,
          });
          setGuestName(msg.name || 'Rakip');
          setLobbyState('joined');
          enterGame(msg.state, {
            mode: 'online',
            level: 'normal',
            seat: msg.seat,
            names: [msg.name || 'Rakip', me],
            role: 'guest',
            code,
          });
        } else if (msg.t === 'state') {
          applyRemoteState(msg.state, msg.moves, msg.by);
        } else if (msg.t === 'full') {
          setLobbyError('Oda dolu. Başka bir oda kodu dene.');
          setLobbyState('error');
        } else if (msg.t === 'bye') {
          flash('Rakip ayrıldı');
        }
      };
      guest.onError = (message) => {
        setLobbyError(message);
        setLobbyState('error');
      };
      guest.onClose = () => {
        if (sessionRef.current?.mode === 'online') flash('Bağlantı koptu');
        else {
          setLobbyError('Bağlantı kurulamadı. Kodu kontrol et.');
          setLobbyState('error');
        }
      };
    },
    [applyRemoteState, cleanupNet, enterGame, flash, me, netName],
  );

  const startOnlineGame = useCallback(() => {
    if (!hostRef.current || !guestName) return;
    const fresh = newGame();
    hostRef.current.send({
      t: 'welcome',
      name: netName,
      seat: 1,
      state: fresh,
    });
    enterGame(fresh, {
      mode: 'online',
      level: 'normal',
      seat: 0,
      names: [me, guestName],
      role: 'host',
      code: roomCode,
    });
  }, [enterGame, guestName, netName, roomCode]);

  const changeNetKind = useCallback(
    (kind: NetKind) => {
      if (kind === netKind) return;
      cleanupNet();
      setNetKind(kind);
      setGuestName(null);
      setLobbyError(null);
      setLobbyState('idle');
      if (lobbyMode === 'host') hostRoom(kind);
    },
    [cleanupNet, hostRoom, lobbyMode, netKind],
  );

  const changeLobbyMode = useCallback(
    (mode: 'host' | 'join') => {
      if (mode === lobbyMode) return;
      cleanupNet();
      setGuestName(null);
      setLobbyError(null);
      setLobbyState('idle');
      setLobbyMode(mode);
      if (mode === 'host') {
        hostRoom(netKind);
      } else {
        setRoomCode('');
        setJoinCode('');
      }
    },
    [cleanupNet, hostRoom, lobbyMode, netKind],
  );

  /* davet linki ile gelen misafir */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('oda');
    if (code && /^[A-Za-z0-9]{4}$/.test(code)) {
      setJoinCode(code.toUpperCase());
      const t = window.setTimeout(() => joinRoom(code, 'online'), 350);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [joinRoom]);

  useEffect(() => () => cleanupNet(), [cleanupNet]);

  /* ---------- zar / hamle ---------- */
  const canAct = session
    ? session.mode === 'local' || (game.turn === session.seat && !pending && game.phase !== 'over')
    : false;

  const handleRoll = useCallback(() => {
    const cur = gameRef.current;
    const s = sessionRef.current;
    if (!s || cur.phase !== 'roll' || cur.result || pending) return;
    if (s.mode !== 'local' && cur.turn !== s.seat) return;
    unlockAudio();

    if (s.mode === 'online' && s.role === 'guest') {
      guestRef.current?.send({ t: 'intent', action: { kind: 'roll' } });
      setPending(true);
      if (pendingTimer.current) window.clearTimeout(pendingTimer.current);
      pendingTimer.current = window.setTimeout(() => setPending(false), 4000);
      sfx.dice();
      return;
    }

    const next = startRoll(cur, rng.current);
    sfx.dice();
    haptic(12);
    if (next.dance !== null) flash('Hamle yok — sıra geçti');
    commit(next, [], cur.turn);
  }, [commit, flash, pending]);

  const handleMove = useCallback(
    (to: number | 'off') => {
      const cur = gameRef.current;
      const s = sessionRef.current;
      if (!s || selected === null || cur.phase !== 'move') return;
      if (s.mode !== 'local' && cur.turn !== s.seat) return;
      const options = legalFirstMoves(cur.board, cur.turn, cur.dice).filter(
        (m) => m.from === selected && m.to === to,
      );
      if (options.length === 0) {
        setSelected(null);
        return;
      }
      options.sort((a, b) => b.die - a.die);
      const move = options[0];
      setSelected(null);

      if (s.mode === 'online' && s.role === 'guest') {
        guestRef.current?.send({ t: 'intent', action: { kind: 'move', move } });
        setPending(true);
        if (pendingTimer.current) window.clearTimeout(pendingTimer.current);
        pendingTimer.current = window.setTimeout(() => setPending(false), 4000);
        return;
      }

      const next = playMove(cur, move);
      if (next === cur) return;
      if (move.hit) {
        sfx.hit();
        haptic(26);
      } else if (move.to === 'off') {
        sfx.off();
        haptic(10);
      } else {
        sfx.move();
        haptic(8);
      }
      commit(next, [move], cur.turn);
    },
    [commit, selected],
  );

  const handleSelect = useCallback((loc: number | 'bar' | null) => {
    if (loc !== null) sfx.select();
    setSelected(loc);
  }, []);

  /* ---------- yapay zeka ---------- */
  useEffect(() => {
    if (!session || session.mode !== 'ai' || session.seat !== 0) return;
    if (game.result || game.turn !== 1) return;

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      const cur = gameRef.current;
      if (cur.turn !== 1 || cur.result) return;

      if (cur.phase === 'roll') {
        const next = startRoll(cur, rng.current);
        if (next.dance !== null) flash('FP-Nerd hamle bulamadı');
        commit(next, [], 1);
        return;
      }

      if (cur.phase === 'move') {
        setThinking(true);
        await sleep(220);
        if (cancelled) return;
        const key = `${cur.plies}:${cur.dice.join(',')}`;
        let plan = aiPlan.current;
        if (!plan || plan.key !== key) {
          const seq = chooseSequence(cur.board, 1, cur.dice, session.level, rng.current);
          plan = { key, moves: seq ? seq.moves.slice() : [] };
          aiPlan.current = plan;
        }
        const move = plan.moves.shift();
        setThinking(false);
        if (!move) return;
        const legal = legalFirstMoves(cur.board, 1, cur.dice);
        const chosen = legal.find((m) => m.from === move.from && m.to === move.to && m.die === move.die) ?? legal[0];
        if (!chosen) return;
        const next = playMove(cur, chosen);
        if (next === cur) return;
        if (chosen.hit) {
          sfx.hit();
        } else if (chosen.to === 'off') {
          sfx.off();
        } else {
          sfx.move();
        }
        commit(next, [chosen], 1);
      }
    }, game.phase === 'roll' ? 620 : 430);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setThinking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, session, commit, flash]);

  /* ---------- menü / yeni oyun ---------- */
  const backToMenu = useCallback(() => {
    cleanupNet();
    setScreen('menu');
    setSession(null);
    setPauseOpen(false);
    setResultOpen(false);
    setGame(newGame());
    setLastMove(null);
  }, [cleanupNet]);

  const playAgain = useCallback(() => {
    const cur = gameRef.current;
    const s = sessionRef.current;
    if (s?.mode === 'online') {
      if (s.role === 'host') {
        const fresh = nextGame(cur, cur.result?.winner === 0 ? 1 : 0);
        setResultOpen(false);
        setLastMove(null);
        setSelected(null);
        commit(fresh, [], 0);
      } else {
        guestRef.current?.send({ t: 'rematch' });
        flash('Yeni oyun başlatılıyor…');
      }
      return;
    }
    const starter: Player = cur.result?.winner === 0 ? 1 : 0;
    setResultOpen(false);
    setLastMove(null);
    setSelected(null);
    const fresh = nextGame(cur, starter);
    gameRef.current = fresh;
    setGame(fresh);
  }, [commit, flash]);

  const copyInvite = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?oda=${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      flash('Davet linki kopyalandı');
    } catch {
      flash(url);
    }
  }, [flash, roomCode]);

  /* ---------- türetilenler ---------- */
  const topPlayer: Player = session ? (session.seat === 0 ? 1 : 0) : 1;
  const viewerSeat: Player = session?.seat ?? 0;
  const canRoll = !!session && game.phase === 'roll' && !game.result && canAct;
  const interactive = canAct && game.phase === 'move';
  return (
    <div className={`app${screen === 'game' ? ' in-game' : ''}`}>
      {screen === 'menu' && (
        <Menu
          settings={settings}
          update={update}
          onStartAI={startVsAI}
          onStartLocal={startLocal}
          onHost={() => openHostLobby('online')}
          onJoin={() => {
            cleanupNet();
            setNetKind('online');
            setLobbyMode('join');
            setLobbyState('idle');
            setLobbyError(null);
            setJoinCode('');
            setScreen('lobby');
          }}
          onBluetooth={() => {
            if (bleSupported()) openHostLobby('ble');
            else setBleInfo(true);
          }}
          onFullscreen={() => void goFullscreen()}
          canInstall={false}
          installLabel="Uygulamayı yükle"
        />
      )}

      {screen === 'lobby' && (
        <Lobby
          mode={lobbyMode}
          state={lobbyState}
          code={roomCode}
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          status={lobbyState === 'joining' ? 'Odaya bağlanılıyor…' : 'Oda hazır'}
          error={lobbyError}
          guestName={guestName}
          onJoin={() => joinRoom(joinCode, netKind)}
          onStart={startOnlineGame}
          onBack={closeLobby}
          onCopy={copyInvite}
          netKind={netKind}
          bleAvailable={bleSupported()}
          onNetKind={changeNetKind}
          onSwitchMode={changeLobbyMode}
        />
      )}

      {screen === 'game' && session && (
        <div className="stage">
          <aside className="rail">
            <PlayerCard
              name={session.names[topPlayer]}
              seat={topPlayer}
              you={false}
              score={game.match[topPlayer]}
              pips={pipCount(game.board, topPlayer)}
              bar={game.board.bar[topPlayer]}
              off={game.board.off[topPlayer]}
              active={game.turn === topPlayer && !game.result}
              thinking={thinking && game.turn === topPlayer}
            />
            <div className="rail-mid">
              <button className="rail-btn" onClick={() => setPauseOpen(true)} aria-label="menü">
                ☰
              </button>
              <button
                className="rail-btn"
                onClick={() => update({ sound: !settings.sound })}
                aria-label="ses aç kapa"
              >
                {settings.sound ? '🔊' : '🔇'}
              </button>
              <button className="rail-btn" onClick={() => void goFullscreen()} aria-label="tam ekran">
                ⛶
              </button>
            </div>
            <PlayerCard
              name={session.names[viewerSeat]}
              seat={viewerSeat}
              you
              score={game.match[viewerSeat]}
              pips={pipCount(game.board, viewerSeat)}
              bar={game.board.bar[viewerSeat]}
              off={game.board.off[viewerSeat]}
              active={game.turn === viewerSeat && !game.result}
            />
          </aside>

          <div className="board-slot" ref={stageRef}>
            <Board
              game={game}
              flip={session.seat === 1}
              bottomPlayer={session.seat}
              selected={selected}
              onSelect={handleSelect}
              onMove={handleMove}
              onRoll={handleRoll}
              canRoll={canRoll}
              lastMove={lastMove}
              scale={scale}
              interactive={interactive}
              thinking={thinking && game.turn === topPlayer}
            />
            {pending && <div className="net-wait">rakibin onayı…</div>}
          </div>

          {toast && <Toast message={toast} />}

          {pauseOpen && (
            <div className="overlay">
              <div className="info-card">
                <span className="card-kicker">Mola</span>
                <h2>Oyun duraklatıldı</h2>
                <p className="muted">
                  {session.mode === 'ai'
                    ? `Seviye: ${LEVEL_LABEL[session.level]} · Maç ${game.match[0]} – ${game.match[1]}`
                    : session.mode === 'online'
                      ? `Oda ${session.code} · Maç ${game.match[0]} – ${game.match[1]}`
                      : `Aynı cihaz · Maç ${game.match[0]} – ${game.match[1]}`}
                </p>
                <div className="result-actions">
                  <button className="primary-btn" onClick={() => setPauseOpen(false)}>
                    Devam
                  </button>
                  <button
                    className="ghost-btn"
                    onClick={() => {
                      const cur = gameRef.current;
                      const fresh = nextGame(cur, 0);
                      setPauseOpen(false);
                      setResultOpen(false);
                      setLastMove(null);
                      setSelected(null);
                      gameRef.current = fresh;
                      setGame(fresh);
                      if (session.mode === 'online' && session.role === 'host') {
                        hostRef.current?.send({ t: 'state', state: fresh, moves: [], by: 0 });
                      }
                    }}
                  >
                    Yeni Oyun
                  </button>
                  <button className="ghost-btn" onClick={backToMenu}>
                    Menü
                  </button>
                </div>
              </div>
            </div>
          )}

          {resultOpen && game.result && (
            <ResultModal
              result={game.result}
              names={session.names}
              match={game.match}
              localSeat={session.seat}
              onAgain={playAgain}
              onMenu={backToMenu}
            />
          )}
        </div>
      )}

      {bleInfo && <BluetoothInfo onClose={() => setBleInfo(false)} available={false} />}
      <RotateHint />
    </div>
  );
}
