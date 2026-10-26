import puppeteer from 'puppeteer-core';
const URL='http://127.0.0.1:4173/';
const browser = await puppeteer.launch({ executablePath: '/snap/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-gpu','--hide-scrollbars','--disable-dev-shm-usage'] });
const mk = async (label) => {
  const p = await browser.newPage();
  await p.setViewport({width:844,height:390});
  p.on('pageerror', e => console.log(label,'PAGEERROR',String(e)));
  p.on('console', m => { if (m.type()==='error') console.log(label,'CONSOLE',m.text()); });
  return p;
};
const host = await mk('HOST');
await host.goto(URL,{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,700));
await host.evaluate(()=>{const c=[...document.querySelectorAll('.mode-card')].find(c=>c.textContent?.includes('Online')); c?.querySelector('.primary-btn')?.click();});
await new Promise(r=>setTimeout(r,4000));
const code = await host.$$eval('.room-code span', els=>els.map(e=>e.textContent).join(''));
const hs = await host.$$eval('.lobby-status', els=>els.map(e=>e.textContent?.trim()));
console.log('code=',code,'hostStatus=',JSON.stringify(hs));
const guest = await mk('GUEST');
await guest.goto(URL+'?oda='+code,{waitUntil:'domcontentloaded'});
for (let i=0;i<12;i++){
  await new Promise(r=>setTimeout(r,1000));
  const gs = await guest.$$eval('.lobby-status', els=>els.map(e=>e.textContent?.trim())).catch(()=>['?']);
  const hs2 = await host.$$eval('.lobby-status', els=>els.map(e=>e.textContent?.trim())).catch(()=>['?']);
  console.log(i, 'H:',JSON.stringify(hs2),'G:',JSON.stringify(gs), 'board:', !!(await guest.$('.board')));
  if (await guest.$('.board')) break;
}
console.log('start button:', !!(await host.$('.lobby-card .primary-btn')));
await host.evaluate(()=>document.querySelector('.lobby-card .primary-btn')?.click());
await new Promise(r=>setTimeout(r,2500));
const inGame = { host: !!(await host.$('.board')), guest: !!(await guest.$('.board')) };
console.log('inGame', inGame);
if (inGame.host && inGame.guest) {
  const counts = await Promise.all([host,guest].map(p=>p.$$eval('.piece',els=>els.length)));
  console.log('pieces', counts);
  await host.click('.dice-hit');
  await new Promise(r=>setTimeout(r,1800));
  console.log('dice host', await host.$$eval('.dice-row .die',els=>els.length), 'guest', await guest.$$eval('.dice-row .die',els=>els.length));
  const lbl = await Promise.all([host,guest].map(p=>p.$eval('.dice-label',e=>e.textContent)));
  console.log('labels', lbl);
  await host.screenshot({path:'/home/ubuntu/shots/online-host.png'});
  await guest.screenshot({path:'/home/ubuntu/shots/online-guest.png'});
}
await browser.close();
