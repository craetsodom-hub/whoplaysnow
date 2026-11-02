const {chromium}=require('C:/Users/Mehdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const base=process.env.CHECK_ORIGIN||'http://localhost:3110';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const report={origin:base,checks:[],errors:[],pages:[]};
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'Europe/Paris'});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text()+' '+m.location().url)});
 const feed=await(await fetch(base+'/api/schedule')).json();
 const candidate=feed.events.find(e=>Date.parse(e.startsAt)>Date.now()&&e.broadcasts.some(b=>b.territory==='US'));
 assert(candidate,'Need future event with listings');
 const match='/matches/'+encodeURI(candidate.canonicalSlug)+'?country=US&countryMode=manual';
 const routes=['/','/sports/football','/competitions','/competitions/nba','/channels?country=US&countryMode=manual',match,'/about','/privacy','/terms'];
 for(const path of routes){
  const r=await page.goto(base+path);assert.equal(r.status(),200,path);await page.waitForLoadState('networkidle');
  await page.locator('img').evaluateAll(imgs=>imgs.forEach(i=>i.loading='eager'));
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
  assert.equal(await page.locator('h1').count(),1,path+' has one H1');
  assert.equal(await page.locator('link[rel=canonical]').count(),1,path+' canonical');
  const broken=await page.locator('img').evaluateAll(a=>a.filter(i=>!i.naturalWidth).map(i=>i.src));
  assert.deepEqual(broken,[],path+' images');
  const schemas=await page.locator('script[type="application/ld+json"]').allTextContents();schemas.forEach(s=>JSON.parse(s));
  report.pages.push({path,status:r.status(),images:await page.locator('img').count(),schemas:schemas.length});
  if(path==='/')await page.screenshot({path:'verification/refined-desktop.png'});
  if(path===match){assert(schemas.some(s=>JSON.parse(s)['@type']==='SportsEvent'));await page.screenshot({path:'verification/refined-event.png',fullPage:true});}
 }
 await page.goto(base+'/?country=US&countryMode=manual');await page.waitForLoadState('networkidle');const expandedRow=page.locator('.match-row').filter({has:page.locator('.more-channels')}).first();if(await expandedRow.count()){assert((await expandedRow.locator('.channel-preview .listed-channel').count())<=3);const extra=expandedRow.locator('.more-channels');assert.equal(await extra.evaluate(e=>e.open),false);await extra.locator('summary').click();assert.equal(await extra.evaluate(e=>e.open),true);assert(await extra.locator('.listed-channel').count()>0);report.checks.push('Only priority broadcasters in preview; more expands all remaining channels');}await page.goto(base+'/?country=US&countryMode=manual');await page.waitForFunction(()=>document.querySelector('#event-count').textContent.includes('event'));
 const first=page.locator('[data-save]').first();const id=await first.getAttribute('data-save');await first.click();assert.equal(await first.getAttribute('aria-pressed'),'true');
 await page.goto(base+'/?view=saved&country=US');await page.waitForFunction(()=>document.querySelector('#event-count').textContent.includes('event'));assert.equal(await page.locator('[data-save="'+id+'"]').count(),1);await page.locator('[data-save="'+id+'"]').click();assert.equal(await page.locator('.empty').count(),1);report.checks.push('Save, reload, saved list, remove');
 await page.goto(base+'/sports/football?country=US&countryMode=manual');await page.waitForFunction(()=>document.querySelector('#event-count').textContent.includes('event'));assert.equal(await page.locator('[data-sport=all]').count(),0);assert(await page.locator('#search-panel').isHidden());assert((await page.locator('[data-competition]').count())<=6);await page.locator('#search-toggle').click();await page.locator('#search').fill('impossible-team-search');assert.equal(await page.locator('.empty').count(),1);await page.locator('[data-reset]').click();assert((await page.locator('.match-row').count())>0);report.checks.push('Sport route, icon search, reset, no All sports category');await page.locator('#search-close').click();assert(await page.locator('#search-panel').isHidden());const tile=page.locator('[data-competition]').first();if(await tile.count()){const competition=await tile.getAttribute('data-competition');await tile.click();assert.equal(await page.locator('.competition-group').count(),1);assert((await page.locator('.competition-heading').innerText()).includes(competition));await page.locator('#competition-clear').click();}report.checks.push('Available competition tiles filter matches and can be cleared');
 await page.goto(base+match);await page.locator('#country').selectOption('FR');await page.waitForFunction(()=>!document.querySelector('#broadcasts').hasAttribute('aria-busy'));assert(page.url().includes('country=FR'));report.checks.push('Event country switch');
 for(const width of [320,390,768]){
  await page.setViewportSize({width,height:900});
  for(const path of ['/','/competitions','/competitions/nba','/channels?country=US&countryMode=manual',match]){
   await page.goto(base+path);await page.waitForTimeout(200);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert(!overflow,path+' overflows at '+width);
   if(width===390&&path==='/')await page.screenshot({path:'verification/refined-mobile.png'});
  }
 }
 report.checks.push('320, 390, 768 pixel layouts without horizontal overflow');
 await page.goto(base+'/');await page.waitForLoadState('networkidle');const detected=await page.evaluate(async()=>await(await fetch('/api/location')).json());assert.equal(await page.locator('#country').inputValue(),'auto');assert(!/automatic/i.test(await page.locator('#country option:checked').innerText()));assert.equal(await page.locator('#country').getAttribute('data-country'),detected.country);await page.evaluate(()=>localStorage.setItem('wpn:country',JSON.stringify('JP')));await page.goto(base+'/?country=US');await page.waitForLoadState('networkidle');assert.equal(await page.locator('#country').inputValue(),'auto');assert(!/automatic/i.test(await page.locator('#country option:checked').innerText()));assert.equal(await page.locator('#country').getAttribute('data-country'),detected.country);report.checks.push('Current location wins over legacy storage and old automatic country URLs');

 assert.deepEqual(report.errors,[],'Browser errors');report.passed=true;
 }finally{fs.writeFileSync('verification/browser-check.json',JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
