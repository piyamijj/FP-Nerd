import puppeteer from 'puppeteer-core';
const URL = 'http://127.0.0.1:4173/';
const browser = await puppeteer.launch({
  executablePath: '/snap/bin/chromium',
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-extensions', '--mute-audio',
    '--no-first-run', '--disable-background-networking', '--disable-sync', '--disable-default-apps',
    '--disable-translate', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=192',
  ],
});
const problems = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = async () => {
  const p = await browser.newPage();
  await p.setViewport({ width: 844, height: 390 });
  p.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 160)));
  return p;
};
try {
  const host = await mk();
  await host.goto(URL, { waitUntil: 'domcontentloaded' });
  await wait(700);
  await host.evaluate(() => {
    const c = [...document.querySelectorAll('.mode-card')].find((x) => x.textContent?.includes('Online'));
    c?.querySelector('.primary-btn')?.click();
  });
  await wait(4000);
  const code = await host.$$eval('.room-code span', (els) => els.map((e) => e.textContent).join(''));
  if (!/^[A-Z0-9]{4}$/.test(code)) problems.push(`oda kodu yok: "${code}"`);

  const guest = await mk();
  await guest.goto(`${URL}?oda=${code}`, { waitUntil: 'domcontentloaded' });
  let joined = false;
  for (let i = 0; i < 14 && !joined; i++) {
    await wait(1000);
    joined = await host.$$eval('.lobby-status.ok', (e) => e.length > 0);
  }
  if (!joined) problems.push('misafir salona katılmadı');

  await host.evaluate(() => document.querySelector('.lobby-card .primary-btn')?.click());
  await wait(3000);
  const inGame = { host: !!(await host.$('.board')), guest: !!(await guest.$('.board')) };
  if (!inGame.host || !inGame.guest) problems.push(`oyun başlamadı ${JSON.stringify(inGame)}`);

  if (inGame.host && inGame.guest) {
    const counts = await Promise.all([host, guest].map((p) => p.$$eval('.piece', (e) => e.length)));
    if (counts.some((c) => c !== 30)) problems.push(`taş sayısı ${counts}`);

    await host.click('.dice-hit');
    await wait(2000);
    const states = await Promise.all(
      [host, guest].map(async (p) => ({
        dice: await p.$$eval('.dice-row .die', (els) => els.length),
        label: await p.$eval('.dice-label', (e) => e.textContent?.trim()),
        turn: await p.$$eval('.player-card.active .pc-name', (els) => els.map((e) => e.textContent?.trim())),
      })),
    );
    if (states[0].dice !== states[1].dice) problems.push(`zar senkronu yok: ${JSON.stringify(states)}`);
    if (states[1].label !== '2 hamle') problems.push(`misafir kalan hamleyi görmüyor: ${states[1].label}`);

    // sıra misafire geçsin diye ev sahibi tüm zarlarını oynasın
    for (let k = 0; k < 8; k++) {
      const mv = await host.$$eval('.point-hit.movable', (e) => e.length);
      if (!mv) break;
      await host.evaluate(() => document.querySelector('.point-hit.movable')?.click());
      await wait(220);
      const tg = await host.$$eval('.point-hit.target', (e) => e.length);
      if (!tg) break;
      await host.evaluate(() => document.querySelector('.point-hit.target')?.click());
      await wait(320);
    }
    await wait(1200);
    const guestTurn = await guest.$$eval('.player-card.active .pc-name', (els) => els.map((e) => e.textContent?.trim()));
    const guestCanRoll = await guest.$eval('.dice-panel', (e) => e.classList.contains('can-roll'));
    if (!guestCanRoll) problems.push(`misafir sırası gelmedi (aktif: ${guestTurn})`);

    if (guestCanRoll) {
      await guest.click('.dice-hit');
      await wait(1800);
      const guestDice = await guest.$eval('.dice-label', (e) => e.textContent?.trim());
      const hostLabel = await host.$eval('.dice-label', (e) => e.textContent?.trim());
      if (guestDice !== hostLabel) problems.push(`misafir zarı ev sahibine yansımadı: ${guestDice} / ${hostLabel}`);
      const guestPieces = await guest.$$eval('.piece', (e) => e.length);
      if (guestPieces !== 30) problems.push(`misafir taş sayısı ${guestPieces}`);
    }
  }
} catch (e) {
  problems.push('çalışma hatası: ' + e.message);
}
await browser.close().catch(() => {});
if (problems.length) {
  console.log('SORUNLAR:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log('Online akış testi geçti.');
