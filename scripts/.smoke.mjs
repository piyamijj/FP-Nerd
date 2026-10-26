import puppeteer from 'puppeteer-core';
try {
  const b = await puppeteer.launch({ executablePath:'/snap/bin/chromium', headless:'new', args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--renderer-process-limit=1'] });
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:4173/', {waitUntil:'domcontentloaded'});
  console.log('title:', await p.title());
  console.log('cards:', await p.$$eval('.mode-card', e=>e.length));
  await b.close();
  console.log('ok');
} catch (e) { console.error('FAIL', e.message); process.exit(2); }
