import puppeteer from 'puppeteer-core';

const URL = process.env.URL || 'http://127.0.0.1:4173/';
const browser = await puppeteer.launch({
  executablePath: '/snap/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-dev-shm-usage'],
});

const shot = async (page, name) => {
  await page.screenshot({ path: `/home/ubuntu/shots/${name}.png` });
};

const problems = [];
const check = (cond, msg) => {
  if (!cond) problems.push(msg);
};

async function audit(page, label) {
  const box = await page.evaluate(() => {
    const de = document.documentElement;
    return {
      scrollW: de.scrollWidth,
      clientW: de.clientWidth,
      scrollH: de.scrollHeight,
      clientH: de.clientHeight,
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
  if (box.scrollW > box.clientW + 1) problems.push(`${label}: yatay taşma ${box.scrollW} > ${box.clientW}`);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  return errs;
}

// ---------- Yatay telefon (844x390) menü
{
  const page = await browser.newPage();
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 600));
  await shot(page, 'phone-menu');
  await audit(page, 'menü-844');
  const cards = await page.$$eval('.mode-card', (els) => els.length);
  check(cards === 4, `menüde 4 mod kartı bekleniyordu, ${cards} bulundu`);
  const menuH = await page.$eval('.menu-inner', (el) => el.getBoundingClientRect().height);
  check(menuH < 390, `menü 390px yüksekliğe sığmıyor: ${Math.round(menuH)}`);

  // AI oyunu başlat
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.mode-card.featured .primary-btn')];
    btns[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 900));
  await shot(page, 'phone-game-start');

  const board = await page.$eval('.board', (el) => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, top: r.top, left: r.left };
  });
  check(board.w <= 844 && board.h <= 390, `tahta ekrana sığmıyor: ${Math.round(board.w)}x${Math.round(board.h)}`);
  check(board.h >= 330, `tahta çok küçük: ${Math.round(board.h)}`);
  const pieces = await page.$$eval('.piece', (els) => els.length);
  check(pieces === 30, `30 taş bekleniyordu, ${pieces} bulundu`);
  const dicePanel = await page.$eval('.dice-panel', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  check(dicePanel.w < board.w * 0.25, 'zar paneli çok geniş');

  // zar at
  await page.click('.dice-hit');
  await new Promise((r) => setTimeout(r, 800));
  await shot(page, 'phone-game-rolled');
  const rolledDice = await page.$$eval('.dice-row .die:not(.ghost)', (els) => els.length);
  check(rolledDice >= 2, `zar sayısı hatalı: ${rolledDice}`);

  const movable = await page.$$eval('.point-hit.movable', (els) => els.length);
  check(movable > 0, 'zar atıldıktan sonra oynanabilir hane bulunamadı');

  if (movable > 0) {
    await page.evaluate(() => document.querySelector('.point-hit.movable')?.click());
    await new Promise((r) => setTimeout(r, 350));
    const targets = await page.$$eval('.point-hit.target', (els) => els.length);
    check(targets > 0, 'taş seçildiğinde hedef hane gösterilmedi');
    await shot(page, 'phone-game-selected');
    if (targets > 0) {
      await page.evaluate(() => document.querySelector('.point-hit.target')?.click());
      await new Promise((r) => setTimeout(r, 700));
      const piecesAfter = await page.$$eval('.piece', (els) => els.length);
      check(piecesAfter === 30, `hamle sonrası taş sayısı bozuldu: ${piecesAfter}`);
    }
  }

  const railInfo = await page.$$eval('.player-card', (els) =>
    els.map((e) => ({ h: e.getBoundingClientRect().height, top: e.getBoundingClientRect().top })),
  );
  check(railInfo.every((c) => c.h > 50), 'oyuncu kartı çok küçük');
  check(errors.length === 0, `konsol hataları: ${errors.join(' | ')}`);
  await page.close();
}

// ---------- Masaüstü (1440x900)
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 500));
  await shot(page, 'desktop-menu');
  await page.evaluate(() => document.querySelector('.mode-card:not(.featured) .ghost-btn')?.click());
  await new Promise((r) => setTimeout(r, 700));
  await shot(page, 'desktop-game');
  const board = await page.$eval('.board', (el) => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  check(board.w > 700, `masaüstünde tahta çok küçük: ${Math.round(board.w)}`);
  await page.click('.dice-hit');
  await new Promise((r) => setTimeout(r, 700));
  const live = await page.$eval('.player-card.active .pc-turn', (el) => el.textContent).catch(() => null);
  check(live !== null, 'sıra göstergesi yok');
  await shot(page, 'desktop-game-rolled');
  check(errors.length === 0, `konsol hataları (masaüstü): ${errors.join(' | ')}`);
  await page.close();
}

// ---------- Dikey (390x844): çevir uyarısı
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, 'portrait');
  const hint = await page.$eval('.rotate-hint', (el) => getComputedStyle(el).display);
  check(hint === 'flex', `dikey modda çevir uyarısı görünmüyor (display: ${hint})`);
  await page.close();
}

await browser.close();
if (problems.length) {
  console.log('SORUNLAR:\n' + problems.map((p) => ` - ${p}`).join('\n'));
  process.exit(1);
}
console.log('Tüm arayüz kontrolleri geçti.');
