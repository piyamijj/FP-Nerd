# 🎲 FP-Nerd Tavla

Ahşap tahtası, iri taşları ve akıcı animasyonlarıyla modern bir tavla oyunu.
Tarayıcıda (PWA) ve Android APK olarak çalışır.

- **Web:** https://fp-nerd.vercel.app
- **Android APK:** https://github.com/piyamijj/FP-Nerd/releases/latest

## Özellikler

- **Bilgisayara karşı** — Kolay / Normal / Zor seviyeler (2 katmanlı beklenen değer araması)
- **İki kişilik** — aynı cihazda sırayla
- **Online** — oda kodu ve davet linkiyle, WebRTC (PeerJS) üzerinden
- **Bluetooth** — APK'da internet olmadan iki telefon arasında (native BLE GATT, deneysel)
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
- **Android:** GitHub Actions, `main` dalına yapılan her itmede APK üretip Release'e ekler.

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
