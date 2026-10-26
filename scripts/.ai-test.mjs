import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/snap/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-gpu','--hide-scrollbars','--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 844, height: 390 });
page.on('pageerror', e => console.log('PAGEERROR', String(e)));
page.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text()); });
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
await new Promise(r=>setTimeout(r,800));
await page.evaluate(() => document.querySelector('.mode-card.featured .primary-btn')?.click());
await new Promise(r=>setTimeout(r,800));
console.log('rolled clicking');
await page.click('.dice-hit');
await new Promise(r=>setTimeout(r,900));
const dice = await page.$$eval('.dice-row .die', els=>els.map(e=>e.textContent).join(','));
console.log('dice faces:', JSON.stringify(dice), 'label:', await page.$eval('.dice-label', e=>e.textContent));
const movable = await page.$$eval('.point-hit.movable', els=>els.length);
console.log('movable sources:', movable, 'targets now:', await page.$$eval('.point-hit.target', els=>els.length));
if (movable>0) {
  await page.evaluate(()=>document.querySelector('.point-hit.movable')?.click());
  await new Promise(r=>setTimeout(r,300));
  console.log('targets after select:', await page.$$eval('.point-hit.target', els=>els.length));
  await page.evaluate(()=>document.querySelector('.point-hit.target')?.click());
}
// kalan zarları da oyna
for (let k=0;k<5;k++) {
  const mv = await page.$$eval('.point-hit.movable', els=>els.length);
  if (!mv) break;
  await page.evaluate(()=>document.querySelector('.point-hit.movable')?.click());
  await new Promise(r=>setTimeout(r,250));
  const tg = await page.$$eval('.point-hit.target', els=>els.length);
  if (!tg) { await page.evaluate(()=>document.querySelector('.point-hit.movable')?.click()); break; }
  await page.evaluate(()=>document.querySelector('.point-hit.target')?.click());
  await new Promise(r=>setTimeout(r,350));
}
const before = await page.$$eval('.piece', els=>els.map(e=>e.style.transform).join('|'));
console.log('turn before wait:', await page.$$eval('.player-card.active .pc-name', els=>els.map(e=>e.textContent)));
await new Promise(r=>setTimeout(r,6000));
const after = await page.$$eval('.piece', els=>els.map(e=>e.style.transform).join('|'));
console.log('pieces changed:', before !== after, 'count:', await page.$$eval('.piece', els=>els.length));
console.log('turn after:', await page.$$eval('.player-card.active .pc-name', els=>els.map(e=>e.textContent)), 'label:', await page.$eval('.dice-label', e=>e.textContent).catch(()=>'-'));
await page.screenshot({path:'/home/ubuntu/shots/ai-debug.png'});
await browser.close();
