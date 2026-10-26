import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath:'/snap/bin/chromium', headless:'new', args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'] });
const p = await b.newPage();
p.on('pageerror', e=>console.log('ERR', String(e).slice(0,200)));
p.on('error', e=>console.log('PAGE ERR', String(e).slice(0,200)));
try {
  await p.goto('data:text/html,<h1>merhaba</h1>', {waitUntil:'domcontentloaded'});
  console.log('data ok', await p.$eval('h1', e=>e.textContent));
  await p.goto('http://127.0.0.1:4173/', {waitUntil:'domcontentloaded', timeout: 20000});
  console.log('app ok');
  for (let i=0;i<8;i++){ await new Promise(r=>setTimeout(r,500)); console.log(i, await p.evaluate(()=>document.readyState + ' ' + document.querySelectorAll('.mode-card').length).catch(e=>'ERR '+e.message)); }
} catch(e) { console.log('FAIL', e.message); }
await b.close().catch(()=>{});
