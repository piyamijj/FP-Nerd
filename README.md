# 🎲 FP-Nerd Tavla

Ahşap tahtası, iri taşları ve akıcı animasyonlarıyla modern bir tavla oyunu.
Tarayıcıda (PWA) ve Android APK olarak çalışır.

## Özellikler

- **Bilgisayara karşı** — Kolay / Normal / Zor seviyeler (2 katmanlı beklenen değer araması)
- **İki kişilik** — aynı cihazda sırayla
- **Online** — oda kodu ve davet linkiyle, WebRTC (PeerJS) üzerinden
- **Yatay tam ekran** — telefonda yan çevirince tahta ekranı doldurur
- **Gerçek tavla kuralları** — kapalı hane, kırık taş, kep atışı, iki zar zorunluluğu, dans
- **Mars / mars-üstü** puanlaması (1 / 2 / 3), maç skoru
- Ses efektleri (WebAudio, dosyasız), titreşim, uyandırma kilidi
- Çevrimdışı çalışan PWA kabuğu

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # motor testleri (20 test)
npm run build
```

## Yayın

- **Web:** Vercel (`vercel.json` hazır, statik Vite çıktısı)
- **Android:** GitHub Actions, her `v*` etiketinde APK üretip Release'e ekler.

## Kurallar ve puanlama

| Durum | Puan |
| --- | --- |
| Rakip en az 1 taş çıkardı | 1 |
| Mars (rakip hiç taş çıkaramadı) | 2 |
| Mars-üstü (kırıkta taşı var / kazananın evinde taşı kaldı) | 3 |

## Teknoloji

React 18 · TypeScript · Vite · PeerJS · Capacitor (Android) · saf CSS/SVG tahta

## Lisans

MIT
