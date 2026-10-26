import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { NetMsg, Transport } from './peer';

interface BleTavlaPlugin {
  host(options: { code: string }): Promise<void>;
  join(options: { code: string }): Promise<void>;
  send(options: { data: string }): Promise<void>;
  disconnect(): Promise<void>;
  addListener(eventName: string, listenerFunc: (event: Record<string, unknown>) => void): Promise<PluginListenerHandle>;
}

const BleTavla = registerPlugin<BleTavlaPlugin>('BleTavla');

/** Bluetooth yalnızca Android kabuğunda (APK) kullanılabilir. */
export function bleSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function describe(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return 'Bluetooth bağlantısı kurulamadı.';
}

abstract class BleTransport implements Transport {
  onMessage?: (msg: NetMsg) => void;
  onOpen?: () => void;
  onClose?: (reason: string) => void;
  onError?: (message: string, fatal?: boolean) => void;
  onReady?: () => void;

  private handles: PluginListenerHandle[] = [];
  protected disposed = false;
  private opened = false;

  protected async bind(): Promise<void> {
    this.handles.push(
      await BleTavla.addListener('message', (event) => {
        if (this.disposed) return;
        const raw = event.data;
        if (typeof raw !== 'string') return;
        try {
          this.onMessage?.(JSON.parse(raw) as NetMsg);
        } catch {
          // bozuk mesajı yoksay
        }
      }),
    );
    this.handles.push(
      await BleTavla.addListener('peer', () => {
        if (this.disposed || this.opened) return;
        this.opened = true;
        this.onOpen?.();
      }),
    );
    this.handles.push(
      await BleTavla.addListener('ready', () => {
        if (!this.disposed) this.onReady?.();
      }),
    );
    this.handles.push(
      await BleTavla.addListener('closed', () => {
        if (!this.disposed) this.onClose?.('peer-closed');
      }),
    );
    this.handles.push(
      await BleTavla.addListener('error', (event) => {
        if (!this.disposed) this.onError?.(String(event.message ?? 'Bluetooth hatası'), true);
      }),
    );
  }

  send(msg: NetMsg): void {
    if (this.disposed) return;
    void BleTavla.send({ data: JSON.stringify(msg) }).catch((err) => this.onError?.(describe(err)));
  }

  close(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const handle of this.handles) void handle.remove();
    this.handles = [];
    void BleTavla.disconnect().catch(() => undefined);
  }
}

/** Bluetooth üzerinden oda kuran telefon. */
export class BleHost extends BleTransport {
  constructor(code: string) {
    super();
    void (async () => {
      try {
        await this.bind();
        await BleTavla.host({ code });
      } catch (err) {
        if (!this.disposed) this.onError?.(describe(err), true);
      }
    })();
  }
}

/** Bluetooth üzerinden odaya katılan telefon. */
export class BleGuest extends BleTransport {
  constructor(code: string) {
    super();
    void (async () => {
      try {
        await this.bind();
        await BleTavla.join({ code });
      } catch (err) {
        if (!this.disposed) this.onError?.(describe(err), true);
      }
    })();
  }
}
