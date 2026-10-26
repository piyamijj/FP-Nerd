import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

const URL = process.env.URL || 'http://127.0.0.1:4173/';
const OUT = '/home/ubuntu/shots';
const browser = await puppeteer.launch({
  executablePath: '/snap/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-dev-shm-usage'],
});

const problems = [];
const ok = (cond, msg) => {
  if (!cond) problems.push(msg);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function pixelStats(file, region) {
  const png = PNG.sync.read(readFileSync(file));
  const { width, height, data } = png;
  let ivory = 0;
  let onyx = 0;
  let sum = 0;
  let n = 0;
  const x0 = Math.max(0, Math.round(region.x));
  const y0 = Math.max(0, Math.round(region.y));
  const x1 = Math.min(width, Math.round(region.x + region.w));
  const y1 = Math.min(height, Math.round(region.y + region.h));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      sum += (r + g + b) / 3;
      n++;
      if (r > 225 && g > 208 && b > 165) ivory++;
      if (r > 20 && r < 95 && g > 20 && g < 95 && b > 25 && b < 105) onyx++;
    }
  }
  return { avg: sum / Math.max(n, 1), ivory, onyx, pixels: n };
}

// ---------------- 1) yapay zekâ turu
{
  const page = await browser.newPage();
  await page.setViewport({ width: 844, height: 390 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.querySelector('.mode-card.featured .primary-btn')?.click());
  await wait(700);
  await page.screenshot({ path: `${OUT}/ai-1-start.png` });

  const boardBox = await page.$eval('.board', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const stats = await pixelStats(`${OUT}/ai-1-start.png`, boardBox);
  ok(stats.ivory > 400, `fildişi taş pikselleri az: ${stats.ivory}`);
  ok(stats.onyx > 250, `oniks taş pikselleri az: ${stats.onyx}`);
  ok(stats.avg > 25 && stats.avg < 120, `tahta ortalama parlaklığı tuhaf: ${stats.avg.toFixed(1)}`);

  // zar at, insan hamlesi yap, yapay zekâ hamlesini bekle
  await page.click('.dice-hit');
  await wait(800);
  const before = await page.$$eval('.piece', (els) => els.map((e) => e.style.transform).join('|'));
  const movable = await page.$$eval('.point-hit.movable', (els) => els.length);
  if (movable > 0) {
    await page.evaluate(() => document.querySelector('.point-hit.movable')?.click());
    await wait(300);
    await page.evaluate(() => document.querySelector('.point-hit.target')?.click());
  }
  await wait(7000);
  await page.screenshot({ path: `${OUT}/ai-2-after-turn.png` });
  const after = await page.$$eval('.piece', (els) => els.map((e) => e.style.transform).join('|'));
  const turn = await page.$$eval('.player-card.active .pc-name', (els) => els.map((e) => e.textContent));
  const pieces = await page.$$eval('.piece', (els) => els.length);
  ok(pieces === 30, `taş sayısı bozuldu: ${pieces}`);
  ok(before !== after, 'yapay zekâ hamle yapmadı (taşlar hiç oynamadı)');
  ok(turn.length === 1, `tek aktif oyuncu beklenirken: ${turn}`);
  ok(errors.length === 0, `konsol hatası: ${errors.join(' | ')}`);
  await page.close();
}

// ---------------- 2) online oda: iki sekme
{
  const host = await browser.newPage();
  await host.setViewport({ width: 844, height: 390 });
  const hostErrors = [];
  host.on('pageerror', (e) => hostErrors.push(String(e)));
  await host.goto(URL, { waitUntil: 'networkidle0' });

  // "Oda Kur"
  await host.evaluate(() => {
    const cards = [...document.querySelectorAll('.mode-card')];
    const online = cards.find((c) => c.textContent?.includes('Online'));
    online?.querySelector('.primary-btn')?.click();
  });
  await wait(3000);
  const code = await host.$$eval('.room-code span', (els) => els.map((e) => e.textContent).join(''));
  await host.screenshot({ path: `${OUT}/online-host-lobby.png` });
  ok(/^[A-Z0-9]{4}$/.test(code), `oda kodu üretilemedi: "${code}"`);

  if (code) {
    const guest = await browser.newPage();
    await guest.setViewport({ width: 844, height: 390 });
    const guestErrors = [];
    guest.on('pageerror', (e) => guestErrors.push(String(e)));
    await guest.goto(`${URL}?oda=${code}`, { waitUntil: 'networkidle0' });
    await wait(9000);
    await guest.screenshot({ path: `${OUT}/online-guest-wait.png` });
    const hostStatus = await host.$$eval('.lobby-status', (els) => els.map((e) => e.textContent?.trim()));
    const guestStatus = await guest.$$eval('.lobby-status', (els) => els.map((e) => e.textContent?.trim()));
    console.log('host salon:', JSON.stringify(hostStatus), '| misafir salon:', JSON.stringify(guestStatus));
    if (await host.$('.lobby-status.ok')) {
      await host.evaluate(() => document.querySelector('.lobby-card .primary-btn')?.click());
      await wait(3500);
    }
    const guestInGame = await guest.$('.board');
    const hostJoined = await host.$$eval('.lobby-status.ok', (els) => els.length);

    if (guestInGame) {
      await wait(1200);
      const seats = await Promise.all(
        [host, guest].map(async (p) => {
          const cards = await p.$$eval('.player-card', (els) =>
            els.map((e) => ({ name: e.querySelector('.pc-name')?.textContent?.trim(), you: e.classList.contains('you') })),
          );
          const pieces = await p.$$eval('.piece', (els) => els.length);
          return { cards, pieces };
        }),
      );
      ok(seats[0].pieces === 30 && seats[1].pieces === 30, `online taş sayıları: ${JSON.stringify(seats.map((s) => s.pieces))}`);
      ok(seats[0].cards.find((c) => c.you)?.name?.startsWith('Sen'), 'sunucuda "sen" kartı yok');
      await host.click('.dice-hit').catch(() => problems.push('host zar atamadı'));
      await wait(1800);
      await host.screenshot({ path: `${OUT}/online-host-rolled.png` });
      await guest.screenshot({ path: `${OUT}/online-guest-rolled.png` });
      const hostDice = await host.$$eval('.dice-row .die', (els) => els.length);
      const guestDice = await guest.$$eval('.dice-row .die', (els) => els.length);
      ok(hostDice === 2 && guestDice === 2, `zar senkronu yok: host ${hostDice}, guest ${guestDice}`);
    } else {
      const status = await guest.$eval('.lobby-status', (el) => el.textContent);
      problems.push(`misafir oyuna giremedi; durum: ${status}`);
      ok(hostJoined > 0, 'host tarafında "katıldı" bilgisi yok');
    }
    ok(guestErrors.length === 0, `misafir konsol hatası: ${guestErrors.join(' | ')}`);
    await guest.close();
  }
  ok(hostErrors.length === 0, `host konsol hatası: ${hostErrors.join(' | ')}`);
  await host.close();
}

await browser.close();
if (problems.length) {
  console.log('SORUNLAR:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log('Akış testleri geçti.');
