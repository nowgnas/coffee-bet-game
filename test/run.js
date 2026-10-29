const { chromium, devices } = require('playwright-core');
const path = require('path'), fs = require('fs');
const URL = process.env.URL || 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(URL); await page.waitForTimeout(800);
  const OUT = process.env.SCREENS_DIR || path.resolve(__dirname, 'screens');
  fs.mkdirSync(OUT, { recursive: true });
  const S = path.join(OUT, 'v2-');
  await page.screenshot({ path: S + '01-finger-idle.png' });
  const cdp = await ctx.newCDPSession(page);
  const box = await page.locator('#finger').boundingBox();
  const pts = [[0.27,0.28],[0.73,0.3],[0.3,0.72],[0.72,0.7]].map(([a,b],i)=>({x:box.x+box.width*a,y:box.y+box.height*b,id:i+1}));
  const touch = (type, list) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: list.map(p=>({x:p.x,y:p.y,id:p.id})) });
  const st = () => page.evaluate(() => ({ phase: finger.dataset.phase, count: +finger.dataset.count, r: +finger.dataset.r, winner: finger.dataset.winner || null }));
  const ok = (cond, msg) => console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  // 1명: 커지지만 결정 안 됨
  await touch('touchStart', pts.slice(0,1)); await page.waitForTimeout(300); const a1 = await st();
  await page.waitForTimeout(3700); const a2 = await st();
  ok(a2.phase==='growing' && a2.r > a1.r, `1 finger grows but no pick (r ${a1.r}->${a2.r}, phase ${a2.phase})`);
  await touch('touchEnd', []); await page.waitForTimeout(150);
  // 3명: 연속 성장 샘플
  await touch('touchStart', pts.slice(0,1)); await touch('touchStart', pts.slice(0,2)); await touch('touchStart', pts.slice(0,3));
  const rs = []; for (let i=0;i<5;i++){ await page.waitForTimeout(400); rs.push((await st()).r); }
  ok(rs.every((v,i)=>i===0||v>rs[i-1]), 'radius increases continuously (no plateau): '+rs.join(','));
  const noCount = await page.evaluate(()=>!/[0-9]…/.test(document.body.innerText));
  await page.screenshot({ path: S + '02-finger-growing.png' });
  // 4번째 손가락 → 리셋
  const before = (await st()).r;
  await touch('touchStart', pts); await page.waitForTimeout(120); const b1 = await st();
  ok(b1.r < before && b1.phase==='growing', `4th finger resets size (${before} -> ${b1.r})`);
  await page.waitForTimeout(2500); const b2 = await st();
  ok(b2.phase==='growing', '2.6s after reset still growing (no early pick), r='+b2.r);
  await page.screenshot({ path: S + '03-finger-growing-4.png' });
  await page.waitForTimeout(700); const b3 = await st();
  ok(b3.phase==='picked' && b3.winner, 'picked ~3s after last change, winner '+b3.winner);
  await page.waitForTimeout(250); await page.screenshot({ path: S + '04-finger-expanding.png' });
  await page.waitForTimeout(1100); await page.screenshot({ path: S + '05-finger-picked.png' });
  const full = await st(); ok(full.r > 400, 'winner circle fills screen r='+full.r);
  await touch('touchEnd', []); await page.waitForTimeout(300); const c1 = await st();
  ok(c1.phase==='picked' && c1.count===0, 'after lift, win screen kept');
  // 2손가락 반복 (공정성 대략)
  const wins = {}; let bad = 0;
  for (let r=0;r<12;r++){ await touch('touchStart', pts.slice(0,2)); await page.waitForTimeout(3300); const s=await st(); if(s.phase!=='picked')bad++; wins[s.winner]=(wins[s.winner]||0)+1; await touch('touchEnd', []); await page.waitForTimeout(80);}
  ok(bad===0, '12 two-finger rounds all picked; colors '+JSON.stringify(wins));
  // 룰렛
  await page.tap('.tab[data-mode=roulette]'); await page.waitForTimeout(500);
  await page.tap('#plus'); await page.fill('#names input >> nth=0', '상원');
  await page.screenshot({ path: S + '06-roulette.png', fullPage: true });
  await page.tap('#hub'); await page.waitForTimeout(1800);
  await page.screenshot({ path: S + '07-roulette-spinning.png' });
  await page.waitForTimeout(4000);
  const rw = await page.evaluate(()=>{ const r=document.querySelector('#result .who'); return r && r.textContent; });
  const check = await page.evaluate(()=>{ const m=/rotate\(([-\d.]+)deg/.exec(document.getElementById('wheel').style.transform); const R=+m[1]; const n=document.querySelectorAll('#names input').length; const top=((-R%360)+360)%360; const idx=Math.floor(top/(360/n)); const v=document.querySelectorAll('#names input')[idx]; return {n, idx, name:(v.value.trim()||v.placeholder)+'님!'}; });
  ok(rw && rw===check.name, `roulette winner ${rw} matches pointer slot ${check.idx} (${check.name})`);
  await page.waitForTimeout(500); await page.screenshot({ path: S + '08-roulette-result.png' });
  await page.tap('#closeR'); await page.waitForTimeout(200);
  // 사다리
  await page.tap('.tab[data-mode=ladder]'); await page.waitForTimeout(400);
  ok(await page.locator('#result').count()===0, 'mode switch closes result sheet');
  await page.screenshot({ path: S + '09-ladder.png', fullPage: true });
  const lb = await page.locator('#ladder').boundingBox();
  const info = await page.evaluate(()=>null);
  await page.locator('#ladder').tap({ position: { x: lb.width/5*0.5, y: 20 } }); await page.waitForTimeout(800);
  await page.screenshot({ path: S + '10-ladder-tracing.png' });
  await page.waitForTimeout(1400);
  const ls = await page.textContent('#lStatus'), lr = await page.locator('#result').count();
  ok(/통과/.test(ls) || lr===1, `single trace done: status "${ls}", sheet ${lr}`);
  if (lr) { await page.tap('#closeR'); await page.waitForTimeout(200); }
  await page.tap('#all'); await page.waitForTimeout(3300);
  const lw = await page.evaluate(()=>{const r=document.querySelector('#result .who');return r&&r.textContent;});
  ok(!!lw || lr===1, 'ladder all → winner '+(lw||'(already hit on single trace)'));
  if (lw) { await page.waitForTimeout(400); await page.screenshot({ path: S + '11-ladder-result.png' });
  await page.tap('#closeR'); await page.waitForTimeout(200); }
  await page.screenshot({ path: S + '12-ladder-all.png', fullPage: true });
  for (let i=0;i<7;i++) await page.tap('#plus');
  ok(await page.evaluate(()=>document.getElementById('plus').disabled) && (await page.textContent('#count'))==='12명', '12 max, plus disabled');
  await page.tap('#all'); await page.waitForTimeout(3200);
  ok(!!(await page.evaluate(()=>{const r=document.querySelector('#result .who');return r&&r.textContent;})), '12-person ladder winner');
  await page.tap('#closeR'); await page.waitForTimeout(200);
  await page.screenshot({ path: S + '13-ladder-12.png', fullPage: true });
  // 스핀 중 모드 전환 후 버튼 복구
  await page.tap('.tab[data-mode=roulette]'); await page.waitForTimeout(300); await page.tap('#spin'); await page.waitForTimeout(500);
  await page.tap('.tab[data-mode=ladder]'); await page.waitForTimeout(200);
  ok(!(await page.evaluate(()=>document.getElementById('minus').disabled)), 'stepper re-enabled after switching mid-spin');
  ok((await page.evaluate(()=>document.documentElement.scrollWidth - innerWidth))===0, 'no horizontal overflow');
  ok(await page.evaluate(()=>document.fonts.check('700 16px "Pretendard Variable"','가')), 'Pretendard loaded');
  ok(errors.length===0, 'console errors: '+JSON.stringify(errors));
  await browser.close();
})();
