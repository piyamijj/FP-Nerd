import { useEffect, useRef, useState } from 'react';

/**
 * Tahtayı kapsayıcıya sığdıran ölçeği hesaplar.
 * Callback ref kullanır: ekran değiştiğinde (menü -> oyun) yeniden bağlanır.
 */
export function useStageFit() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.5);
  const raf = useRef(0);

  useEffect(() => {
    if (!el) return;

    const compute = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const next = Math.min(r.width / 1000, r.height / 460) * 0.99;
      setScale((prev) => (Math.abs(prev - next) < 0.0005 ? prev : next));
    };

    compute();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(compute);
    });
    ro.observe(el);
    window.addEventListener('orientationchange', compute);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.current);
      window.removeEventListener('orientationchange', compute);
    };
  }, [el]);

  return { ref: setEl, scale };
}

export async function goFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  } catch {
    /* desteklenmiyor */
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.('landscape');
  } catch {
    /* desteklenmiyor */
  }
}

export async function exitFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* yok say */
  }
}

export function useWakeLock() {
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
        };
        if (!nav.wakeLock) return;
        sentinel = await nav.wakeLock.request('screen');
        if (cancelled) await sentinel.release();
      } catch {
        /* yok say */
      }
    };

    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, []);
}
