import Peer, { type DataConnection } from 'peerjs';
import type { GameState, Move, Player } from '../game/engine';

export type Action = { kind: 'roll' } | { kind: 'move'; move: Move };

export type NetMsg =
  | { t: 'hello'; name: string }
  | { t: 'welcome'; name: string; seat: Player; state: GameState }
  | { t: 'state'; state: GameState; moves: Move[]; by: Player }
  | { t: 'intent'; action: Action }
  | { t: 'emote'; emoji: string }
  | { t: 'full' }
  | { t: 'bye' }
  | { t: 'rematch' };

export interface Transport {
  send(msg: NetMsg): void;
  close(): void;
  onMessage?: (msg: NetMsg) => void;
  onOpen?: () => void;
  onClose?: (reason: string) => void;
  onError?: (message: string, fatal?: boolean) => void;
  onReady?: () => void;
}

const PREFIX = 'fpnerd-v1-';
const ICE: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createRoomCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function peerId(code: string) {
  return PREFIX + code.trim().toLowerCase();
}

function describeError(err: { type?: string; message?: string }): { message: string; fatal: boolean } {
  switch (err.type) {
    case 'unavailable-id':
      return { message: 'Bu oda kodu şu an kullanımda. Yeni bir kod oluştur.', fatal: true };
    case 'peer-unavailable':
      return { message: 'Oda bulunamadı. Kodu kontrol et veya yeni bir oda kur.', fatal: true };
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return { message: 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.', fatal: true };
    case 'browser-incompatible':
      return { message: 'Tarayıcı bu oyun modunu desteklemiyor.', fatal: true };
    default:
      return { message: err.message ?? 'Bağlantı hatası oluştu.', fatal: false };
  }
}

function parse(data: unknown): NetMsg | null {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as NetMsg;
    } catch {
      return null;
    }
  }
  if (data && typeof data === 'object' && 't' in data) return data as NetMsg;
  return null;
}

/** PeerJS (WebRTC) üzerinden oda sahibi bağlantısı. */
export class PeerHost implements Transport {
  onMessage?: (msg: NetMsg) => void;
  onOpen?: () => void;
  onClose?: (reason: string) => void;
  onError?: (message: string, fatal?: boolean) => void;
  onReady?: () => void;

  private peer: Peer;
  private conn: DataConnection | null = null;
  private disposed = false;

  constructor(code: string) {
    this.peer = new Peer(peerId(code), { debug: 0, config: ICE });
    this.peer.on('open', () => this.onReady?.());
    this.peer.on('error', (err) => {
      const { message, fatal } = describeError(err as { type?: string; message?: string });
      this.onError?.(message, fatal);
    });
    this.peer.on('connection', (conn) => {
      if (this.conn) {
        conn.on('open', () => {
          conn.send(JSON.stringify({ t: 'full' }));
          setTimeout(() => conn.close(), 500);
        });
        return;
      }
      this.conn = conn;
      conn.on('open', () => this.onOpen?.());
      conn.on('data', (d) => {
        const msg = parse(d);
        if (msg) this.onMessage?.(msg);
      });
      conn.on('close', () => {
        if (this.conn === conn) this.conn = null;
        if (!this.disposed) this.onClose?.('peer-closed');
      });
      conn.on('error', (e) => this.onError?.(String(e)));
    });
    this.peer.on('disconnected', () => {
      if (!this.disposed) this.peer.reconnect();
    });
  }

  send(msg: NetMsg) {
    if (this.conn?.open) this.conn.send(JSON.stringify(msg));
  }

  close() {
    this.disposed = true;
    try {
      this.conn?.close();
      this.peer.destroy();
    } catch {
      /* yok say */
    }
  }
}

/** PeerJS üzerinden odaya katılan taraf. */
export class PeerGuest implements Transport {
  onMessage?: (msg: NetMsg) => void;
  onOpen?: () => void;
  onClose?: (reason: string) => void;
  onError?: (message: string, fatal?: boolean) => void;
  onReady?: () => void;

  private peer: Peer;
  private conn: DataConnection | null = null;
  private disposed = false;
  private timeout: number;

  constructor(code: string) {
    this.peer = new Peer({ debug: 0, config: ICE });

    this.timeout = window.setTimeout(() => {
      if (!this.conn?.open) this.onError?.('Odaya ulaşılamadı. Kodu kontrol et.', true);
    }, 14000);

    this.peer.on('open', () => {
      const conn = this.peer.connect(peerId(code), { reliable: true });
      this.conn = conn;
      conn.on('open', () => {
        clearTimeout(this.timeout);
        this.onOpen?.();
      });
      conn.on('data', (d) => {
        const msg = parse(d);
        if (msg) this.onMessage?.(msg);
      });
      conn.on('close', () => {
        if (!this.disposed) this.onClose?.('peer-closed');
      });
      conn.on('error', (e) => this.onError?.(String(e)));
    });
    this.peer.on('error', (err) => {
      clearTimeout(this.timeout);
      const { message, fatal } = describeError(err as { type?: string; message?: string });
      this.onError?.(message, fatal);
    });
  }

  send(msg: NetMsg) {
    if (this.conn?.open) this.conn.send(JSON.stringify(msg));
  }

  close() {
    this.disposed = true;
    clearTimeout(this.timeout);
    try {
      this.conn?.close();
      this.peer.destroy();
    } catch {
      /* yok say */
    }
  }
}
