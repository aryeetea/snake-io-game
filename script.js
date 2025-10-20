// Snake.io — JavaScript by Aileen
// Features: Title screen, pause menu, speeds (1/2/3), moving foods w/ slower defaults
// & live tuning via [ and ], surprise spawns, grapes/grass/bomb art, explosion,
// random snake color on eat, SFX (M to mute), score + high score (+ DOM "Best" badge).

(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');

  const AUTHOR = 'JavaScript by Aileen';
  const HS_KEY = 'snake_high_score_v3';

  // Grid
  const TILE = 20;
  const COLS = Math.floor(canvas.width / TILE);
  const ROWS = Math.floor(canvas.height / TILE);

  // Colors (game rendering — UI colors come from CSS)
  const COLORS = {
    bg: '#111',
    grid: '#1b1b1b',
    snake: '#39ff14',
    snakeHead: '#b6ff00',
    text: '#f7f7f7',
    shadow: 'rgba(0,0,0,0.45)',
    outline: 'rgba(0,0,0,0.5)',
    panel: 'rgba(0,0,0,0.65)',
    panelBorder: 'rgba(255,255,255,0.15)',
    highlight: '#ffd54a',
    grape: '#a64dff',
    grapeStem: '#6b4f2a',
    grass: '#3bff5b',
    bombBody: '#101319',
    bombFuse: '#e6d7a7',
    bombSpark1: '#ffea6e',
    bombSpark2: '#ff7b2f',
    explosionCore: '#fff4d2',
    explosionRing: '#ffb84d',
  };

  // Food types (scoring)
  const FOOD_TYPES = [
    { name: 'green',  color: COLORS.grass,  points: 1, weight: 0.70, bomb: false },
    { name: 'purple', color: COLORS.grape,  points: 5, weight: 0.22, bomb: false },
    { name: 'red',    color: '#ff3030',     points: 0, weight: 0.08, bomb: true  },
  ];

  // Snake movement speeds (ms per step)
  const SPEEDS = { slow: 160, medium: 120, fast: 80 };
  let speedPreset = 'medium';
  let tickMs = SPEEDS[speedPreset];
  const MIN_TICK = 55;

  // --- Wandering speed controls (default slower) ---
  const FOOD_WANDER = {
    baseMoveEvery: 10,        // higher = slower; older builds used ~6
    typeSpeed: {
      green: 12,              // slowest
      purple: 10,             // medium
      red: 11                 // slightly jittery but not too fast
    },
    jitterChance: 0.18        // random direction changes
  };
  // Live tuner: '[' slower (increase moveEvery), ']' faster (decrease)
  let foodSpeedFactor = 1.0;               // 1.0 default; >1 slower, <1 faster
  const FOOD_SPEED_FACTOR_MIN = 0.6;
  const FOOD_SPEED_FACTOR_MAX = 1.8;
  const FOOD_SPEED_FACTOR_STEP = 0.1;

  // Food system (simultaneous + periodic shuffle + surprise spawns)
  const BASE_FOOD_COUNT = 2;
  const MAX_FOODS = 4;
  const FOOD_SHUFFLE_MS = 4500;
  let lastFoodShuffleAt = 0;
  const SURPRISE_SPAWN_PER_SEC = 0.28;

  // Modes: 'title' | 'playing' | 'paused' | 'exploding' | 'gameover'
  let mode = 'title';

  // Game state
  let snake, dir, nextDir, foods, score, timerId, playing, justAte;
  let animTick = 0;
  let highScore = +localStorage.getItem(HS_KEY) || 0;
  let newBestFlashTicks = 0;

  // Explosion state
  let explosion = null; // {x,y,frame,particles,maxFrames}

  // ---------- Audio ----------
  let audioCtx = null, masterGain = null, isMuted = false, audioReady = false;
  function ensureAudio() {
    if (audioReady || isMuted) return;
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.16;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    audioReady = true;
  }
  function setMuted(m) {
    isMuted = m;
    if (!masterGain || !audioCtx) return;
    masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
    masterGain.gain.setValueAtTime(isMuted ? 0 : 0.16, audioCtx.currentTime);
  }
  function blip(freq=520,dur=0.08,type='square',vol=0.25){
    if (isMuted||!audioCtx) return;
    const t0=audioCtx.currentTime, o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t0);
    g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(vol,t0+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+Math.max(0.02,dur));
    o.connect(g).connect(masterGain); o.start(t0); o.stop(t0+dur+0.02);
  }
  function chirp(from=800,to=300,dur=0.35,type='triangle',vol=0.22){
    if (isMuted||!audioCtx) return;
    const t0=audioCtx.currentTime, o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type=type; o.frequency.setValueAtTime(from,t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(40,to),t0+dur);
    g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(vol,t0+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    o.connect(g).connect(masterGain); o.start(t0); o.stop(t0+dur+0.02);
  }
  function noiseBurst(dur=0.2,vol=0.4,lowpassHz=1800){
    if (isMuted||!audioCtx) return;
    const bs=Math.floor(audioCtx.sampleRate*dur);
    const buf=audioCtx.createBuffer(1,bs,audioCtx.sampleRate);
    const data=buf.getChannelData(0);
    for(let i=0;i<bs;i++) data[i]=(Math.random()*2-1)*(1-i/bs);
    const src=audioCtx.createBufferSource(); src.buffer=buf;
    const filter=audioCtx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=lowpassHz;
    const g=audioCtx.createGain(); g.gain.value=vol;
    src.connect(filter).connect(g).connect(masterGain); src.start();
  }
  function sfxEat(points){ensureAudio(); if(points>=5){blip(760,0.07,'square',0.3);setTimeout(()=>blip(900,0.07,'square',0.28),60);}else{blip(540,0.06,'square',0.25);}}
  function sfxBomb(){ensureAudio(); noiseBurst(0.18,0.45,1600); setTimeout(()=>{ if(!audioCtx||isMuted) return; const t0=audioCtx.currentTime,o=audioCtx.createOscillator(),g=audioCtx.createGain(); o.type='sine'; o.frequency.setValueAtTime(220,t0); o.frequency.exponentialRampToValueAtTime(70,t0+0.35); g.gain.setValueAtTime(0.35,t0); g.gain.exponentialRampToValueAtTime(0.0001,t0+0.4); o.connect(g).connect(masterGain); o.start(t0); o.stop(t0+0.42); },20); setTimeout(()=>noiseBurst(0.12,0.28,1200),120);}
  function sfxGameOver(){ensureAudio(); chirp(600,140,0.45,'sawtooth',0.22);}
  function sfxPause(){ensureAudio(); blip(420,0.05,'triangle',0.18);}
  function sfxNewBest(){ensureAudio(); blip(660,0.06,'square',0.28); setTimeout(()=>blip(830,0.06,'square',0.26),70); setTimeout(()=>blip(990,0.08,'square',0.24),140);}
  function sfxStart(){ensureAudio(); blip(520,0.06,'square',0.22); setTimeout(()=>blip(680,0.06,'square',0.20),60);}

  // ---------- Color helpers ----------
  function setSnakeColor(hex){COLORS.snake=hex; COLORS.snakeHead=lightenHex(hex,0.35);}
  function lightenHex(hex,amt){
    const c=hex.replace('#',''); const full=c.length===3?c.split('').map(ch=>ch+ch).join(''):c;
    const num=parseInt(full,16); let r=(num>>16)&255,g=(num>>8)&255,b=num&255;
    r=Math.min(255,Math.round(r+(255-r)*amt)); g=Math.min(255,Math.round(g+(255-g)*amt));
    b=Math.min(255,Math.round(b+(255-b)*amt));
    return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  function randomSnakeColor(){
    let h; const r=Math.random();
    if(r<0.8){const ranges=[[20,140],[160,340]]; const pick=ranges[Math.random()<0.5?0:1]; h=pick[0]+Math.random()*(pick[1]-pick[0]);}
    else{h=(Math.random()*40+300)%360;}
    return hslToHex(h,90,55);
  }
  function hslToHex(h,s,l){
    s/=100; l/=100; const k=n=>(n+h/30)%12; const a=s*Math.min(l,1-l);
    const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
    const toHex=x=>Math.round(255*x).toString(16).padStart(2,'0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }
  function weightedPick(types){const total=types.reduce((s,t)=>s+t.weight,0); let r=Math.random()*total; for(const t of types){if((r-=t.weight)<=0) return t;} return types[0];}

  // ---------- Init & Start ----------
  function init(){
    const startX=Math.floor(COLS/2), startY=Math.floor(ROWS/2);
    snake=[{x:startX,y:startY},{x:startX-1,y:startY},{x:startX-2,y:startY}];
    dir={x:1,y:0}; nextDir={x:1,y:0};
    score=0; updateScore();
    playing=true; justAte=false; animTick=0; newBestFlashTicks=0; explosion=null;
    setSnakeColor('#39ff14');
    foods=[]; for(let i=0;i<BASE_FOOD_COUNT;i++) foods.push(spawnFood(true));
    lastFoodShuffleAt=performance.now();
  }
  function startGame(){
    init(); mode='playing';
    tickMs=SPEEDS[speedPreset]||SPEEDS.medium;
    clearInterval(timerId); timerId=setInterval(gameTick,tickMs);
    sfxStart(); draw();
  }
  function updateScore(){
    if(scoreEl) scoreEl.textContent=`Score: ${score}`;
    // also update optional "Best" badge in DOM if present
    const bestEl = document.getElementById('best');
    if (bestEl) bestEl.textContent = `Best: ${highScore}`;
    if(score>highScore){highScore=score; localStorage.setItem(HS_KEY,String(highScore)); newBestFlashTicks=60; sfxNewBest();}
  }

  // ---------- Food helpers ----------
  function isCellFree(x,y){
    if(snake && snake.some(s=>s.x===x && s.y===y)) return false;
    if(foods && foods.some(f=>f.x===x && f.y===y)) return false;
    return true;
  }
  function spawnFood(withDrift=false){
    const kind=weightedPick(FOOD_TYPES);
    let cell, tries=0;
    do{cell={x:Math.floor(Math.random()*COLS), y:Math.floor(Math.random()*ROWS)}; tries++;}while(!isCellFree(cell.x,cell.y)&&tries<50);
    const drift=withDrift?randomDrift():{vx:0,vy:0};
    return {
      ...cell,
      color: kind.color, points: kind.points, name: kind.name, bomb: kind.bomb,
      vx: drift.vx, vy: drift.vy,
      moveEvery: Math.max(3, Math.round((FOOD_WANDER.typeSpeed[kind.name] ?? FOOD_WANDER.baseMoveEvery) * foodSpeedFactor)),
      moveCounter: 0
    };
  }
  function randomDrift(){const c=[-1,0,1]; let vx=0,vy=0; while(vx===0&&vy===0){vx=c[Math.floor(Math.random()*3)]; vy=c[Math.floor(Math.random()*3)];} return {vx,vy};}
  function nudgeFood(f){
    f.moveCounter++; if(f.moveCounter < f.moveEvery) return;
    f.moveCounter = 0;

    // small chance to idle this tick (adds organic feel)
    if (Math.random() < 0.12) return;

    if(Math.random() < FOOD_WANDER.jitterChance){ const d=randomDrift(); f.vx=d.vx; f.vy=d.vy; }

    let nx=f.x+f.vx, ny=f.y+f.vy;
    if(nx<0||nx>=COLS){f.vx*=-1; nx=f.x+f.vx;} if(ny<0||ny>=ROWS){f.vy*=-1; ny=f.y+f.vy;}
    let tries=0;
    while(!isCellFree(nx,ny) && !(nx===f.x && ny===f.y) && tries<5){
      const d=randomDrift(); f.vx=d.vx; f.vy=d.vy;
      nx=f.x+f.vx; ny=f.y+f.vy;
      if(nx<0||nx>=COLS){f.vx*=-1; nx=f.x+f.vx;} if(ny<0||ny>=ROWS){f.vy*=-1; ny=f.y+f.vy;}
      tries++;
    }
    if(nx>=0&&nx<COLS&&ny>=0&&ny<ROWS&&isCellFree(nx,ny)){f.x=nx; f.y=ny;}
  }
  function nudgeFoods(){for(const f of foods) nudgeFood(f);}
  function maybeShuffleFoods(nowMs){
    if(nowMs-lastFoodShuffleAt>=FOOD_SHUFFLE_MS){
      lastFoodShuffleAt=nowMs;
      const count=Math.min(foods.length, 1+(Math.random()<0.5?1:0));
      for(let i=0;i<count;i++){ const idx=Math.floor(Math.random()*foods.length); foods[idx]=spawnFood(true); }
      while(foods.length<BASE_FOOD_COUNT) foods.push(spawnFood(true));
      if(foods.length<MAX_FOODS && Math.random()<0.6) foods.push(spawnFood(true));
    }
    if(foods.length<MAX_FOODS){
      const perTickChance = SURPRISE_SPAWN_PER_SEC * (tickMs/1000);
      if(Math.random() < perTickChance) foods.push(spawnFood(true));
    }
  }

  // ---------- Input ----------
  window.addEventListener('keydown', (e) => {
    ensureAudio();
    const k = e.key.toLowerCase();

    // Global food-speed tuning: '[' slower, ']' faster
    if (k === '[') {
      foodSpeedFactor = Math.min(FOOD_SPEED_FACTOR_MAX, +(foodSpeedFactor + FOOD_SPEED_FACTOR_STEP).toFixed(2));
      if (Array.isArray(foods)) for (const f of foods) {
        const base = FOOD_WANDER.typeSpeed[f.name] ?? FOOD_WANDER.baseMoveEvery;
        f.moveEvery = Math.max(3, Math.round(base * foodSpeedFactor));
      }
      blip(320, 0.05, 'triangle', 0.14);
      if (mode === 'paused') drawPause();
    }
    if (k === ']') {
      foodSpeedFactor = Math.max(FOOD_SPEED_FACTOR_MIN, +(foodSpeedFactor - FOOD_SPEED_FACTOR_STEP).toFixed(2));
      if (Array.isArray(foods)) for (const f of foods) {
        const base = FOOD_WANDER.typeSpeed[f.name] ?? FOOD_WANDER.baseMoveEvery;
        f.moveEvery = Math.max(3, Math.round(base * foodSpeedFactor));
      }
      blip(380, 0.05, 'triangle', 0.14);
      if (mode === 'paused') drawPause();
    }

    if (mode === 'title') {
      if (k === '1') { speedPreset='slow'; blip(300,0.05,'triangle',0.15); draw(); return; }
      if (k === '2') { speedPreset='medium'; blip(380,0.05,'triangle',0.15); draw(); return; }
      if (k === '3') { speedPreset='fast'; blip(460,0.05,'triangle',0.15); draw(); return; }
      if (k === 'm') { setMuted(!isMuted); draw(); return; }
      startGame(); return;
    }

    if (mode === 'exploding') { if (k === 'm') setMuted(!isMuted); return; }

    if (mode === 'gameover') {
      if (k === 'm') { setMuted(!isMuted); draw(); return; }
      if (k === 'enter' || k === 'return' || k === ' ') { startGame(); }
      return;
    }

    if (mode === 'paused') {
      if (k === 'm') { setMuted(!isMuted); drawPause(); return; }
      if (k === '1') { applySpeed('slow'); drawPause(); return; }
      if (k === '2') { applySpeed('medium'); drawPause(); return; }
      if (k === '3') { applySpeed('fast'); drawPause(); return; }
      if (k === 'enter' || k === 'return') { startGame(); return; }
      if (k === ' ') {
        clearInterval(timerId); timerId=setInterval(gameTick,tickMs);
        mode='playing'; sfxPause(); return;
      }
      return;
    }

    // playing
    if (k === 'arrowup' || k === 'w') queueDir(0,-1);
    else if (k === 'arrowdown' || k === 's') queueDir(0,1);
    else if (k === 'arrowleft' || k === 'a') queueDir(-1,0);
    else if (k === 'arrowright' || k === 'd') queueDir(1,0);
    else if (k === ' ') { togglePause(); }
    else if (k === '1') { applySpeed('slow'); }
    else if (k === '2') { applySpeed('medium'); }
    else if (k === '3') { applySpeed('fast'); }
    else if (k === 'm') { setMuted(!isMuted); }
  });

  function applySpeed(preset){
    speedPreset=preset; tickMs=SPEEDS[preset]||SPEEDS.medium;
    if(mode==='playing'){ clearInterval(timerId); timerId=setInterval(gameTick,tickMs); }
  }
  function queueDir(x,y){ if(x===-dir.x && y===-dir.y) return; nextDir={x,y}; }
  function togglePause(){
    if(mode!=='playing') return;
    clearInterval(timerId); timerId=null; sfxPause(); mode='paused'; drawPause();
  }

  // ---------- Tick ----------
  function gameTick(){
    nudgeFoods();
    maybeShuffleFoods(performance.now());

    dir = nextDir;
    const head=snake[0];
    const newHead={x:head.x+dir.x, y:head.y+dir.y};

    if(newHead.x<0||newHead.x>=COLS||newHead.y<0||newHead.y>=ROWS){ sfxGameOver(); return setGameOver(); }
    if(snake.some(seg=>seg.x===newHead.x && seg.y===newHead.y)){ sfxGameOver(); return setGameOver(); }

    snake.unshift(newHead);

    const idx=foods.findIndex(f=>f.x===newHead.x && f.y===newHead.y);
    if(idx!==-1){
      const f=foods[idx];
      if(f.bomb){ triggerExplosion(newHead.x,newHead.y); return; }
      score += f.points; sfxEat(f.points);
      setSnakeColor(randomSnakeColor()); updateScore();
      foods.splice(idx,1); justAte=true;
      while(foods.length<BASE_FOOD_COUNT) foods.push(spawnFood(true));
      if(score%5===0 && tickMs>MIN_TICK){
        tickMs=Math.max(MIN_TICK, tickMs-6); clearInterval(timerId); timerId=setInterval(gameTick,tickMs);
      }
    } else { justAte=false; snake.pop(); }

    if(newBestFlashTicks>0) newBestFlashTicks--;
    animTick++; draw();
  }

  // -------- Explosion handling --------
  function triggerExplosion(cx,cy){
    clearInterval(timerId); timerId=null; mode='exploding'; sfxBomb();
    const px=cx*TILE+TILE/2, py=cy*TILE+TILE/2;
    const particles=[]; const count=40;
    for(let i=0;i<count;i++){
      const ang=Math.random()*Math.PI*2, spd=1.5+Math.random()*3.5;
      particles.push({x:px,y:py,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,life:20+Math.floor(Math.random()*10)});
    }
    explosion={x:px,y:py,frame:0,particles,maxFrames:26};
    const step=()=>{ if(mode!=='exploding') return; draw(); explosion.frame++;
      for(const p of explosion.particles){ if(p.life<=0) continue; p.x+=p.vx; p.y+=p.vy; p.vy+=0.08; p.life--; }
      if(explosion.frame<=explosion.maxFrames){ requestAnimationFrame(step);} else { setGameOver('BOOM! Red bomb'); }
    };
    requestAnimationFrame(step);
  }
  function setGameOver(reason){ mode='gameover'; playing=false; draw(); drawGameOver(reason); }

  // ---------- Render ----------
  function draw(){
    ctx.fillStyle=COLORS.bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    if(mode==='title'){ drawTitle(); return; }

    ctx.strokeStyle=COLORS.grid; ctx.lineWidth=1;
    for(let x=TILE;x<canvas.width;x+=TILE){ ctx.beginPath(); ctx.moveTo(x+0.5,0); ctx.lineTo(x+0.5,canvas.height); ctx.stroke(); }
    for(let y=TILE;y<canvas.height;y+=TILE){ ctx.beginPath(); ctx.moveTo(0,y+0.5); ctx.lineTo(canvas.width,y+0.5); ctx.stroke(); }

    for(const f of foods) drawFood(f);

    drawSnake();
    if(justAte){ const h=snake[0]; drawEatPulse(h.x,h.y); }

    drawScoreHUD();
    drawAttribution();

    // IMPORTANT CHANGE: removed auto-call to drawPause() here to avoid recursion.
    if(mode==='exploding' && explosion) drawExplosionOverlay();
  }

  function drawFood(f){
    const px=f.x*TILE, py=f.y*TILE;
    if(f.bomb){ drawBomb(px,py); return; }
    if(f.points===5){ drawGrapes(px,py); return; }
    drawGrass(px,py); // green +1
  }

  // --- Food art ---
  function drawGrapes(px,py){
    const cx=px+TILE/2, cy=py+TILE/2+3;
    ctx.strokeStyle=COLORS.grapeStem; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(cx,py+3); ctx.quadraticCurveTo(cx-3,py+0,cx-5,py+6); ctx.stroke();
    const r=4, offs=[{dx:-5,dy:0},{dx:0,dy:-2},{dx:5,dy:0},{dx:-3,dy:6},{dx:2,dy:6},{dx:-1,dy:10}];
    ctx.fillStyle=COLORS.grape; ctx.strokeStyle='rgba(0,0,0,0.4)';
    for(const o of offs){ ctx.beginPath(); ctx.arc(cx+o.dx,cy+o.dy,r,0,Math.PI*2); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(cx+2,cy-3,2,0,Math.PI*2); ctx.fill();
  }
  function drawGrass(px,py){
    const baseY=py+TILE-3; ctx.strokeStyle=COLORS.grass; ctx.lineWidth=2;
    const blades=[{x:px+4,h:10,tilt:-0.7},{x:px+8,h:12,tilt:0.3},{x:px+12,h:9,tilt:-0.2},{x:px+6,h:13,tilt:0.6},{x:px+14,h:8,tilt:0.1}];
    for(const b of blades){ ctx.beginPath(); ctx.moveTo(b.x,baseY); ctx.quadraticCurveTo(b.x+b.tilt*4,baseY-b.h*0.6,b.x+b.tilt*8,baseY-b.h); ctx.stroke(); }
    ctx.fillStyle='rgba(59,255,91,0.25)'; ctx.beginPath(); ctx.ellipse(px+TILE/2,baseY,8,3,0,0,Math.PI*2); ctx.fill();
  }
  function drawBomb(px,py){
    const cx=px+TILE/2, cy=py+TILE/2+2;
    ctx.fillStyle=COLORS.bombBody; ctx.beginPath(); ctx.arc(cx,cy,7,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='#0b0d12'; ctx.beginPath(); ctx.arc(cx+4,cy-5,3,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=COLORS.bombFuse; ctx.lineWidth=2; ctx.beginPath();
    ctx.moveTo(cx+4,cy-5); ctx.quadraticCurveTo(cx+8,cy-12,cx+2,cy-14); ctx.stroke();
    const s=(Math.sin(animTick*0.4)+1)/2;
    ctx.fillStyle = s>0.5 ? COLORS.bombSpark1 : COLORS.bombSpark2;
    ctx.beginPath(); ctx.arc(cx+2,cy-14,2+s*1.2,0,Math.PI*2); ctx.fill();
  }
  function drawExplosionOverlay(){
    if(!explosion) return;
    const t=explosion.frame/explosion.maxFrames; // 0..1
    const alpha=0.8*(1-t);
    ctx.fillStyle=`rgba(255,180,80,${alpha*0.6})`; ctx.fillRect(0,0,canvas.width,canvas.height);
    const r=6+t*28;
    ctx.fillStyle=COLORS.explosionCore; ctx.beginPath(); ctx.arc(explosion.x,explosion.y,r*0.5,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=COLORS.explosionRing; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(explosion.x,explosion.y,r,0,Math.PI*2); ctx.stroke();
    for(const p of explosion.particles){ if(p.life<=0) continue; const a=Math.max(0,Math.min(1,p.life/20));
      ctx.fillStyle=`rgba(255,${180+Math.floor(60*(1-a))},80,${0.9*a})`;
      ctx.beginPath(); ctx.arc(p.x,p.y,2.2*a+0.5,0,Math.PI*2); ctx.fill();
    }
  }

  // --- Snake drawing ---
  function drawSnake(){
    const baseR=Math.floor(TILE/2)-1, len=snake.length;
    for(let i=len-1;i>=1;i--){ const seg=snake[i]; const r=segmentRadius(i,len,baseR); drawSegmentCircle(seg,r,COLORS.snake); }
    const head=snake[0]; const headR=Math.min(baseR+1, baseR*1.15);
    drawSegmentCircle(head,headR,COLORS.snakeHead,true); drawEyes(head,headR);
    if((animTick%40)<6) drawTongue(head,headR);
  }
  function segmentRadius(index,total,baseR){ if(total<=2) return baseR; const t=index/(total-1); return Math.max(4, baseR*(0.65+0.35*(1-t))); }
  function drawSegmentCircle(seg,radius,color,outlineThick=false){
    const cx=seg.x*TILE+TILE/2, cy=seg.y*TILE+TILE/2;
    ctx.fillStyle=color; ctx.beginPath(); ctx.arc(cx,cy,radius,0,Math.PI*2); ctx.fill();
    ctx.lineWidth=outlineThick?2:1; ctx.strokeStyle=COLORS.outline; ctx.beginPath(); ctx.arc(cx,cy,radius,0,Math.PI*2); ctx.stroke();
  }
  function drawEyes(head,r){
    const cx=head.x*TILE+TILE/2, cy=head.y*TILE+TILE/2;
    let ex=0,ey=0; if(dir.x!==0) ex=Math.sign(dir.x)*(r*0.45); if(dir.y!==0) ey=Math.sign(dir.y)*(r*0.45);
    let px=0,py=0; if(dir.x!==0) py=r*0.35; else px=r*0.35;
    const eyeR=Math.max(2,Math.floor(r*0.28)), pupilR=Math.max(1,Math.floor(eyeR*0.45));
    const eye1={x:cx+ex-px,y:cy+ey-py}, eye2={x:cx+ex+px,y:cy+ey+py};
    ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.arc(eye1.x,eye1.y,eyeR,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(eye2.x,eye2.y,eyeR,0,Math.PI*2); ctx.fill();
    const pupShift=0.45*eyeR; const p1={x:eye1.x+pupShift*Math.sign(dir.x), y:eye1.y+pupShift*Math.sign(dir.y)};
    const p2={x:eye2.x+pupShift*Math.sign(dir.x), y:eye2.y+pupShift*Math.sign(dir.y)};
    ctx.fillStyle='#000000'; ctx.beginPath(); ctx.arc(p1.x,p1.y,pupilR,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(p2.x,p2.y,pupilR,0,Math.PI*2); ctx.fill();
  }
  function drawTongue(head,r){
    const cx=head.x*TILE+TILE/2, cy=head.y*TILE+TILE/2, len=r*0.9;
    const tip={x:cx+len*dir.x, y:cy+len*dir.y}, side=r*0.45;
    const f1={x:tip.x+(dir.y*side), y:tip.y+(-dir.x*side)}, f2={x:tip.x-(dir.y*side), y:tip.y-(-dir.x*side)};
    ctx.strokeStyle='#ff4d4d'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(tip.x,tip.y); ctx.lineTo(f1.x,f1.y);
    ctx.moveTo(tip.x,tip.y); ctx.lineTo(f2.x,f2.y); ctx.stroke();
  }

  // --- HUDs ---
  function drawEatPulse(cxCell,cyCell){
    const px=cxCell*TILE+TILE/2, py=cyCell*TILE+TILE/2;
    ctx.beginPath(); ctx.arc(px,py,7,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,0.16)'; ctx.fill();
  }
  function drawScoreHUD(){
    const txt=`Score: ${score}   Best: ${highScore}`;
    ctx.save(); ctx.font='12px "Press Start 2P", monospace'; ctx.textAlign='left'; ctx.textBaseline='top';
    const padX=8,padY=6; const w=ctx.measureText(txt).width+padX*2, h=20+padY*2, x=8,y=8;
    ctx.fillStyle='rgba(0,0,0,0.45)';
    const r=8; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.fillText(txt, x+padX, y+padY+4);
    if(newBestFlashTicks>0){ const a=Math.max(0,Math.min(1,newBestFlashTicks/60)); ctx.fillStyle=`rgba(255,213,74,${a})`;
      ctx.textAlign='center'; ctx.fillText('NEW BEST!', x+w/2, y+h+6); }
    ctx.restore();
  }
  function drawAttribution(){ ctx.save(); ctx.font='10px "Press Start 2P", monospace'; ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.textAlign='right'; ctx.textBaseline='bottom'; ctx.fillText(AUTHOR, canvas.width-6, canvas.height-6); ctx.restore(); }

  // --- Title / Pause / Game Over ---
  function drawTitle(){
    ctx.fillStyle=COLORS.bg; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle=COLORS.text; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='24px "Press Start 2P", monospace'; ctx.fillText('SNAKE.IO', canvas.width/2, canvas.height/2-60);
    ctx.font='12px "Press Start 2P", monospace';
    ctx.fillText(`Best: ${highScore}`, canvas.width/2, canvas.height/2-24);
    ctx.fillText(`Current Speed: ${speedPreset.toUpperCase()}  (1/2/3 to change)`, canvas.width/2, canvas.height/2+6);
    ctx.fillText(`M: Mute/Unmute   •   [ / ]: Food wander`, canvas.width/2, canvas.height/2+28);
    ctx.font='14px "Press Start 2P", monospace'; ctx.fillText('Press ANY key to start', canvas.width/2, canvas.height/2+64);
  }
  function drawPause(){
    // NOTE: no call to draw() here; pause is drawn only when explicitly invoked
    ctx.save(); ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    const pw=Math.min(520,canvas.width-40), ph=320, px=(canvas.width-pw)/2, py=(canvas.height-ph)/2;
    roundRect(ctx,px,py,pw,ph,12,true,false); ctx.fillStyle=COLORS.panel; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=COLORS.panelBorder; ctx.stroke();
    ctx.fillStyle=COLORS.text; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.font='20px "Press Start 2P", monospace'; ctx.fillText('PAUSED', canvas.width/2, py+14);
    ctx.font='12px "Press Start 2P", monospace'; ctx.fillText(`Score: ${score}    Best: ${highScore}`, canvas.width/2, py+48);
    drawPauseLegend(px+22, py+76);
    ctx.textAlign='left';
    ctx.fillText('Foods shuffle and can spawn unexpectedly.', px+22, py+ph-96);
    ctx.fillText(`Food wander: ${foodSpeedFactor.toFixed(1)}x   ([ slower, ] faster)`, px+22, py+ph-76);
    ctx.fillText('Speed: 1 = Slow   2 = Medium   3 = Fast', px+22, py+ph-56);
    ctx.fillText('Controls: Arrow Keys / WASD • Space: Resume • Enter: Restart • M: Mute', px+22, py+ph-36);
    ctx.restore();
  }
  function drawPauseLegend(x,y){
    ctx.fillStyle=COLORS.grass; ctx.fillRect(x,y+2,12,12);
    ctx.fillStyle=COLORS.text; ctx.font='12px "Press Start 2P", monospace'; ctx.textAlign='left'; ctx.fillText('+1  (Green Food)', x+18, y);
    ctx.fillStyle=COLORS.grape; ctx.fillRect(x,y+26,12,12);
    ctx.fillStyle=COLORS.text; ctx.fillText('+5  (Purple Food)', x+18, y+24);
    ctx.fillStyle='#ff3030'; ctx.fillRect(x,y+50,12,12);
    ctx.fillStyle=COLORS.text; ctx.fillText('KO  (Red Bomb)', x+18, y+48);
  }
  function drawGameOver(reason){
    const title=reason||'GAME OVER', tip='Enter: restart • Space: pause menu';
    ctx.save(); ctx.fillStyle=COLORS.shadow; ctx.fillRect(0,0,canvas.width,canvas.height);
    const pw=Math.min(480,canvas.width-40), ph=240, px=(canvas.width-pw)/2, py=(canvas.height-ph)/2;
    roundRect(ctx,px,py,pw,ph,12,true,false); ctx.fillStyle=COLORS.panel; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=COLORS.panelBorder; ctx.stroke();
    ctx.fillStyle=COLORS.text; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.font='18px "Press Start 2P", monospace'; ctx.fillText(title, canvas.width/2, py+18);
    ctx.font='12px "Press Start 2P", monospace'; ctx.fillText(`Final Score: ${score}    Best: ${highScore}`, canvas.width/2, py+58); ctx.fillText(tip, canvas.width / 2, py+84);
    drawPauseLegend(px+22, py+112); ctx.restore();
  }

  // Helpers
  function roundRect(ctx,x,y,w,h,r,fill,stroke){
    if(w<2*r) r=w/2; if(h<2*r) r=h/2;
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
    if(fill) ctx.fill(); if(stroke) ctx.stroke();
  }

  // --- Boot: show title screen
  (function boot(){ snake=[{x:0,y:0}]; foods=[spawnFood(false)]; drawTitle(); })();
})();
