(function () {
  'use strict';

  // ── 서버 연결 ──────────────────────────────────────────────────
  const urlParams  = new URLSearchParams(window.location.search);
  const alpToken   = urlParams.get('token') || '';
  const platformApi = window.__ALP_PLATFORM_API__ || '';

  // ── 상수 ───────────────────────────────────────────────────────
  const DW = 32, DH = 32;  // 던전 격자 크기
  const TS = 32;            // 타일 픽셀 크기
  let VW = 11, VH = 15;    // 뷰포트 타일 수 (resizeCanvas에서 재계산)
  let CW = VW * TS, CH = VH * TS;

  const MOVE_BASE_MS = 220;  // 기본 이동 쿨다운 (ms)
  const TELEGRAPH_MS = 700;  // 적 공격 예고 시간 (ms)
  const CTR_START    = 140;  // 반격 가능 시작 (ms)
  const CTR_END      = 570;  // 반격 가능 종료 (ms)
  const PERF_END     = 390;  // 완벽 반격 종료 (ms) — CTR_START~PERF_END

  // 타일 종류
  const T = { WALL: 0, FLOOR: 1, STAIRS: 2, CHEST: 3 };

  // ── 적 정의 ────────────────────────────────────────────────────
  const EDEFS = [
    { id:'slime',    name:'슬라임',    emoji:'🟢', hp:12,  atk:5,  def:0,  mvMs:700,  xp:5,  minF:1,  maxF:4  },
    { id:'goblin',   name:'고블린',    emoji:'👺', hp:22,  atk:9,  def:1,  mvMs:540,  xp:10, minF:1,  maxF:7  },
    { id:'skeleton', name:'해골',      emoji:'💀', hp:30,  atk:13, def:3,  mvMs:740,  xp:16, minF:3,  maxF:99 },
    { id:'orc',      name:'오크',      emoji:'👹', hp:48,  atk:20, def:6,  mvMs:840,  xp:26, minF:5,  maxF:99 },
    { id:'demon',    name:'악마',      emoji:'😈', hp:65,  atk:28, def:9,  mvMs:600,  xp:40, minF:8,  maxF:99 },
    // 보스 (5층마다)
    { id:'bslime', name:'대왕슬라임', emoji:'💚', hp:90,  atk:16, def:5,  mvMs:900,  xp:60,  minF:5,  maxF:5,  isBoss:true },
    { id:'bdemon', name:'암흑군주',   emoji:'👿', hp:160, atk:35, def:14, mvMs:1050, xp:120, minF:10, maxF:10, isBoss:true },
  ];

  // ── 아이템 정의 ────────────────────────────────────────────────
  const IDEF = {
    potion: { name:'회복 포션',     emoji:'🧪', desc:'HP 30% 회복',       action:'heal'   },
    repair: { name:'수리 키트',     emoji:'🔧', desc:'내구도 +20 회복',    action:'repair' },
    power:  { name:'힘의 결정',     emoji:'💠', desc:'이번 층 공격력 +8',  action:'power'  },
    shield: { name:'방어 두루마리', emoji:'📜', desc:'다음 피해 1회 무효', action:'shield' },
  };

  // ── 게임 상태 변수 ─────────────────────────────────────────────
  let canvas, ctx, animId;
  let gameState = 'equip_select'; // equip_select | playing | dead
  let floor, dungeon, effects, frameCount;
  let camX, camY, lastFrameAt, hudDirty;

  const player = {
    gx: 0, gy: 0,   // 격자 위치
    px: 0, py: 0,   // 픽셀 위치 (부드러운 이동용)
    hp: 0, maxHp: 0,
    baseAtk: 5, baseDef: 0,
    moveDelay: MOVE_BASE_MS,
    lastMoveAt: 0,
    equipment: null,
    durability: 0, durabilityMax: 0,
    durBroken: false,
    inventory: [],
    shieldActive: false,
    powerBonus: 0,
    xp: 0, kills: 0,
  };

  // ── DOM 참조 ───────────────────────────────────────────────────
  let $screenEquip, $screenGame, $screenDead;
  let $equipList, $equipStatus, $btnBare;
  let $hpBar, $hpText, $durBar, $durText;
  let $floorLbl, $equipNameHud, $itemSlots;
  let $rpPrompt, $rpBar, $rpCounter, $toast;
  let $btnCounter, $dpad, $deadStats, $btnRestart;

  // ── 입력 ───────────────────────────────────────────────────────
  const keys = {};

  // ══════════════════════════════════════════════════════════════
  // 던전 생성
  // ══════════════════════════════════════════════════════════════
  function generateDungeon(f) {
    // 격자 초기화 (전부 벽)
    const grid = [];
    const revealed = [];
    for (let y = 0; y < DH; y++) {
      grid.push(new Array(DW).fill(T.WALL));
      revealed.push(new Uint8Array(DW));
    }

    const rooms = [];

    // 방 배치 (최대 10개 시도)
    for (let attempt = 0; attempt < 80 && rooms.length < 10; attempt++) {
      const rw = 4 + Math.floor(Math.random() * 5);
      const rh = 4 + Math.floor(Math.random() * 4);
      const rx = 1 + Math.floor(Math.random() * (DW - rw - 2));
      const ry = 1 + Math.floor(Math.random() * (DH - rh - 2));

      let ok = true;
      for (const r of rooms) {
        if (rx < r.x+r.w+2 && rx+rw > r.x-2 && ry < r.y+r.h+2 && ry+rh > r.y-2) {
          ok = false; break;
        }
      }
      if (!ok) continue;

      rooms.push({ x:rx, y:ry, w:rw, h:rh, cx:rx+Math.floor(rw/2), cy:ry+Math.floor(rh/2) });
      for (let y = ry; y < ry+rh; y++)
        for (let x = rx; x < rx+rw; x++)
          grid[y][x] = T.FLOOR;
    }

    // 방이 너무 적으면 재생성
    if (rooms.length < 4) return generateDungeon(f);

    // L자 복도로 방 연결
    for (let i = 1; i < rooms.length; i++) {
      const a = rooms[i-1], b = rooms[i];
      const minX = Math.min(a.cx,b.cx), maxX = Math.max(a.cx,b.cx);
      const minY = Math.min(a.cy,b.cy), maxY = Math.max(a.cy,b.cy);
      for (let x = minX; x <= maxX; x++) grid[a.cy][x] = T.FLOOR;
      for (let y = minY; y <= maxY; y++) grid[y][b.cx] = T.FLOOR;
    }

    // 마지막 방에 계단
    const lastR = rooms[rooms.length-1];
    grid[lastR.cy][lastR.cx] = T.STAIRS;

    // 중간 방에 상자
    if (rooms.length >= 3) {
      const ri = 1 + Math.floor(Math.random() * (rooms.length-2));
      const r  = rooms[ri];
      const cx = r.x + 1 + Math.floor(Math.random() * Math.max(1, r.w-2));
      const cy = r.y + 1 + Math.floor(Math.random() * Math.max(1, r.h-2));
      if (grid[cy][cx] === T.FLOOR) grid[cy][cx] = T.CHEST;
    }

    // 플레이어 시작 위치 (첫 방 중앙)
    player.gx = rooms[0].cx; player.gy = rooms[0].cy;
    player.px = player.gx * TS; player.py = player.gy * TS;

    // 적 스폰
    const scale   = 1 + (f-1) * 0.15;
    const valid   = EDEFS.filter(d => !d.isBoss && f >= d.minF && f <= d.maxF);
    const enemies = [];

    for (let i = 1; i < rooms.length; i++) {
      const r = rooms[i];
      if (grid[r.cy][r.cx] === T.STAIRS) continue;

      const count = Math.min(3, 1 + Math.floor(Math.random()*2) + (f >= 5 ? 1 : 0));
      for (let n = 0; n < count && valid.length; n++) {
        const def = valid[Math.floor(Math.random() * valid.length)];
        let ex, ey, tries = 0;
        do {
          ex = r.x+1+Math.floor(Math.random()*Math.max(1,r.w-2));
          ey = r.y+1+Math.floor(Math.random()*Math.max(1,r.h-2));
          tries++;
        } while (tries < 20 && (grid[ey][ex] !== T.FLOOR || enemies.some(e=>e.gx===ex&&e.gy===ey)));
        if (tries >= 20) continue;
        enemies.push(makeEnemy(def, ex, ey, scale));
      }
    }

    // 보스 (5의 배수 층)
    if (f % 5 === 0) {
      const bd = EDEFS.find(d => d.isBoss && f >= d.minF && f <= d.maxF)
              || EDEFS.find(d => d.isBoss);
      if (bd) {
        const mr = rooms[Math.floor(rooms.length/2)];
        enemies.push(makeEnemy(bd, mr.cx, mr.cy, scale));
      }
    }

    // 바닥 아이템 (1~2개)
    const items   = [];
    const iTypes  = Object.keys(IDEF);
    const iCount  = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let n = 0; n < iCount; n++) {
      const r = rooms[1 + Math.floor(Math.random()*(rooms.length-1))];
      let ix, iy, tries = 0;
      do {
        ix = r.x+1+Math.floor(Math.random()*Math.max(1,r.w-2));
        iy = r.y+1+Math.floor(Math.random()*Math.max(1,r.h-2));
        tries++;
      } while (tries < 15 && grid[iy][ix] !== T.FLOOR);
      if (tries < 15) {
        const t = iTypes[Math.floor(Math.random()*iTypes.length)];
        items.push({ type:t, def:IDEF[t], gx:ix, gy:iy, id:randId() });
      }
    }

    return { grid, rooms, enemies, items, revealed };
  }

  function makeEnemy(def, gx, gy, scale) {
    const hp = Math.round(def.hp * scale);
    return {
      def, gx, gy, px: gx*TS, py: gy*TS,
      hp, maxHp: hp,
      atk: Math.round(def.atk * scale),
      def_: Math.round(def.def * scale),
      state: 'patrol',                // patrol | chase | telegraph | attack | stunned | cooldown
      nextMoveAt: performance.now() + Math.random()*1200,
      telegraphStart: 0,
      atkTgx: 0, atkTgy: 0,          // 공격 예정 격자
      stunnedUntil: 0,
      dead: false,
      id: randId(),
    };
  }

  function randId() { return Math.random().toString(36).slice(2); }

  // ══════════════════════════════════════════════════════════════
  // 시야 / 카메라
  // ══════════════════════════════════════════════════════════════
  function updateFog() {
    const R = 5;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx*dx + dy*dy > R*R) continue;
        const nx = player.gx+dx, ny = player.gy+dy;
        if (nx>=0 && nx<DW && ny>=0 && ny<DH) dungeon.revealed[ny][nx] = 1;
      }
    }
  }

  function updateCamera() {
    const tx = player.px - VW*0.5*TS + TS*0.5;
    const ty = player.py - VH*0.5*TS + TS*0.5;
    camX = Math.round(Math.max(0, Math.min(DW*TS - CW, tx)));
    camY = Math.round(Math.max(0, Math.min(DH*TS - CH, ty)));
  }

  // ══════════════════════════════════════════════════════════════
  // 플레이어 행동
  // ══════════════════════════════════════════════════════════════
  function tryMove(dx, dy) {
    if (gameState !== 'playing') return;
    const now = performance.now();
    if (now - player.lastMoveAt < player.moveDelay) return;

    const nx = player.gx + dx, ny = player.gy + dy;
    if (nx < 0 || nx >= DW || ny < 0 || ny >= DH) return;

    const tile = dungeon.grid[ny][nx];
    if (tile === T.WALL) return;

    // 적이 있으면 근접 공격
    const enemy = dungeon.enemies.find(e => !e.dead && e.gx===nx && e.gy===ny);
    if (enemy) { bumpAttack(enemy); player.lastMoveAt = now; return; }

    // 이동
    player.gx = nx; player.gy = ny;
    player.lastMoveAt = now;
    hudDirty = true;

    // 아이템 습득
    const ii = dungeon.items.findIndex(it => it.gx===nx && it.gy===ny);
    if (ii !== -1) { pickupItem(dungeon.items[ii]); dungeon.items.splice(ii,1); }

    if (tile === T.STAIRS) { enterNextFloor(); return; }
    if (tile === T.CHEST)  { openChest(nx, ny); }
  }

  function bumpAttack(enemy) {
    const dmg = Math.max(1, (player.baseAtk + player.powerBonus) - enemy.def_);
    enemy.hp -= dmg;
    spawnFx(enemy.px + TS/2, enemy.py, `-${dmg}`, '#ff5722');
    if (enemy.hp <= 0) killEnemy(enemy);
    hudDirty = true;
  }

  function killEnemy(enemy) {
    enemy.dead = true;
    player.kills++;
    player.xp += enemy.def.xp;
    spawnFx(enemy.px+TS/2, enemy.py-10, `+${enemy.def.xp}XP`, '#ffeb3b', 1200);
    hudDirty = true;
  }

  function pickupItem(item) {
    player.inventory.push({ type:item.type, def:item.def });
    toast(`${item.def.emoji} ${item.def.name} 획득!`);
    hudDirty = true;
  }

  function openChest(x, y) {
    dungeon.grid[y][x] = T.FLOOR;
    const t = Math.random() < 0.55 ? 'potion' : 'repair';
    player.inventory.push({ type:t, def:IDEF[t] });
    toast(`📦 ${IDEF[t].emoji} ${IDEF[t].name} 발견!`);
    hudDirty = true;
  }

  // 아이템 사용
  function useItem(type) {
    if (gameState !== 'playing') return;
    const idx = player.inventory.findIndex(it => it.type === type);
    if (idx === -1) return;
    const item = player.inventory[idx];

    switch (item.def.action) {
      case 'heal': {
        const h = Math.round(player.maxHp * 0.30);
        player.hp = Math.min(player.maxHp, player.hp + h);
        spawnFx(player.px+TS/2, player.py, `+${h} HP`, '#4caf50');
        toast('🧪 HP 30% 회복!');
        break;
      }
      case 'repair': {
        const rep = Math.min(20, player.durabilityMax - player.durability);
        player.durability = Math.min(player.durabilityMax, player.durability + 20);
        if (player.durBroken && player.durability > 0) {
          player.durBroken = false;
          restoreEquipStats();
          toast('🔧 장비 수리 완료! 능력치 복구');
        } else {
          toast(`🔧 내구도 +${Math.max(0,rep)} 회복`);
        }
        spawnFx(player.px+TS/2, player.py, `수리 +${Math.max(0,rep)}`, '#2196f3');
        break;
      }
      case 'power': {
        player.powerBonus += 8;
        toast('💠 공격력 +8 (이번 층)');
        spawnFx(player.px+TS/2, player.py, '공격력 +8!', '#7c4dff');
        break;
      }
      case 'shield': {
        player.shieldActive = true;
        toast('📜 다음 피해 무효 준비!');
        spawnFx(player.px+TS/2, player.py, '방어막!', '#2196f3');
        break;
      }
    }

    player.inventory.splice(idx, 1);
    hudDirty = true;
  }

  // ══════════════════════════════════════════════════════════════
  // 반격 시스템
  // ══════════════════════════════════════════════════════════════
  function tryCounter() {
    if (gameState !== 'playing') return;
    const now = performance.now();

    const telegraphing = dungeon.enemies.filter(e => e.state==='telegraph' && !e.dead);
    if (!telegraphing.length) {
      spawnFx(player.px+TS/2, player.py-10, '공격 없음', '#606090', 600);
      return;
    }

    // 가장 임박한 적 (경과 시간이 가장 긴 것)
    const target = telegraphing.reduce((a,b) =>
      (now - b.telegraphStart) > (now - a.telegraphStart) ? b : a
    );
    const elapsed = now - target.telegraphStart;

    if (elapsed < CTR_START) {
      spawnFx(player.px+TS/2, player.py-10, '너무 이르다!', '#9e9e9e', 650);
      return;
    }
    if (elapsed > CTR_END) {
      spawnFx(player.px+TS/2, player.py-10, '타이밍 놓침', '#9e9e9e', 650);
      return;
    }

    const perfect = elapsed <= PERF_END;
    const mul     = perfect ? 1.8 : 1.0;
    const dmg     = Math.max(1, Math.round((player.baseAtk + player.powerBonus) * mul) - target.def_);

    target.hp -= dmg;
    target.state       = 'stunned';
    target.stunnedUntil = now + (perfect ? 1100 : 550);

    const label = perfect ? `완벽 반격! -${dmg}` : `반격! -${dmg}`;
    const color = perfect ? '#f5c518' : '#ff9800';
    spawnFx(target.px+TS/2, target.py-10, label, color, 1100);
    spawnFx(player.px+TS/2, player.py-10, perfect ? '⚡ 완벽!' : '⚡', color, 800);

    if (target.hp <= 0) killEnemy(target);
    hudDirty = true;
  }

  // ══════════════════════════════════════════════════════════════
  // 적 AI 업데이트
  // ══════════════════════════════════════════════════════════════
  function updateEnemies() {
    const now = performance.now();
    let anyTelegraph = false;

    for (const e of dungeon.enemies) {
      if (e.dead) continue;

      // 픽셀 위치 보간 (부드러운 이동)
      e.px += (e.gx*TS - e.px) * 0.28;
      e.py += (e.gy*TS - e.py) * 0.28;

      // ── 기절 ─────────────────────────────────────────────────
      if (e.state === 'stunned') {
        if (now >= e.stunnedUntil) { e.state='patrol'; e.nextMoveAt = now+400; }
        continue;
      }

      // ── 쿨다운 ───────────────────────────────────────────────
      if (e.state === 'cooldown') {
        if (now >= e.nextMoveAt) e.state = 'patrol';
        continue;
      }

      // ── 공격 예고 (텔레그래프) ───────────────────────────────
      if (e.state === 'telegraph') {
        anyTelegraph = true;
        if (now >= e.telegraphStart + TELEGRAPH_MS) {
          // 공격 실행
          if (player.gx===e.atkTgx && player.gy===e.atkTgy) {
            hitPlayer(e);  // 피하지 못함
          } else {
            // 회피 성공
            spawnFx(player.px+TS/2, player.py-10, '회피!', '#00bcd4');
            e.state       = 'stunned';
            e.stunnedUntil = now + 380;
          }
          if (e.state === 'telegraph') { e.state='cooldown'; e.nextMoveAt=now+500; }
        }
        continue;
      }

      // ── 순찰 / 추격 ──────────────────────────────────────────
      if (now < e.nextMoveAt) continue;

      const dist = Math.abs(e.gx-player.gx) + Math.abs(e.gy-player.gy);

      if (dist === 1) {
        // 인접 → 공격 예고 시작
        e.state          = 'telegraph';
        e.telegraphStart = now;
        e.atkTgx         = player.gx;
        e.atkTgy         = player.gy;
        anyTelegraph     = true;
      } else if (dist <= 8 && dungeon.revealed[e.gy]?.[e.gx]) {
        // 추격
        moveToward(e, player.gx, player.gy);
        e.state       = 'chase';
        e.nextMoveAt  = now + e.def.mvMs;
      } else {
        // 순찰
        moveRandom(e);
        e.state       = 'patrol';
        e.nextMoveAt  = now + e.def.mvMs * 1.6;
      }
    }

    // 반응 프롬프트 갱신
    if (anyTelegraph) renderRpPrompt();
    else hideRpPrompt();
  }

  // 플레이어가 공격 맞음
  function hitPlayer(enemy) {
    // 방어막 있으면 무효
    if (player.shieldActive) {
      player.shieldActive = false;
      spawnFx(player.px+TS/2, player.py-10, '차단!', '#2196f3');
      enemy.state='cooldown'; enemy.nextMoveAt = performance.now()+500;
      hudDirty = true;
      return;
    }

    const dmg = Math.max(1, enemy.atk - player.baseDef);
    player.hp -= dmg;
    spawnFx(player.px+TS/2, player.py-10, `-${dmg}`, '#f44336');

    // 내구도 감소
    if (player.durabilityMax > 0 && !player.durBroken) {
      player.durability = Math.max(0, player.durability - 1);
      if (player.durability === 0) {
        player.durBroken = true;
        // 스탯 절반
        player.baseAtk = Math.max(1, Math.floor(player.baseAtk / 2));
        player.baseDef = Math.max(0, Math.floor(player.baseDef / 2));
        toast('⚠️ 장비 파손! 능력치 절반 감소');
      }
    }

    enemy.state='cooldown'; enemy.nextMoveAt = performance.now()+500;
    hudDirty = true;

    if (player.hp <= 0) { player.hp=0; setGameState('dead'); }
  }

  // 적 → 목표 방향으로 이동
  function moveToward(e, tx, ty) {
    const opts = [];
    const dx = Math.sign(tx - e.gx), dy = Math.sign(ty - e.gy);
    if (dx !== 0) opts.push([dx, 0]);
    if (dy !== 0) opts.push([0, dy]);
    if (opts.length === 2 && Math.random() < 0.2) opts.reverse(); // 약간의 무작위성
    for (const [ox, oy] of opts) {
      const nx = e.gx+ox, ny = e.gy+oy;
      if (!inBounds(nx,ny) || dungeon.grid[ny][nx]===T.WALL) continue;
      if (dungeon.enemies.some(o => !o.dead && o!==e && o.gx===nx && o.gy===ny)) continue;
      if (nx===player.gx && ny===player.gy) continue;
      e.gx=nx; e.gy=ny; return;
    }
  }

  // 적 무작위 이동
  function moveRandom(e) {
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    shuffle(dirs);
    for (const [dx,dy] of dirs) {
      const nx=e.gx+dx, ny=e.gy+dy;
      if (!inBounds(nx,ny) || dungeon.grid[ny][nx]===T.WALL) continue;
      if (dungeon.enemies.some(o => !o.dead && o!==e && o.gx===nx && o.gy===ny)) continue;
      if (nx===player.gx && ny===player.gy) continue;
      e.gx=nx; e.gy=ny; return;
    }
  }

  function inBounds(x,y) { return x>=0&&x<DW&&y>=0&&y<DH; }
  function shuffle(arr) {
    for (let i=arr.length-1; i>0; i--) {
      const j=Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 층 이동 / 게임 흐름
  // ══════════════════════════════════════════════════════════════
  function enterNextFloor() {
    floor++;
    player.powerBonus = 0;
    // 층 이동 시 HP 25% 회복
    player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.25));
    dungeon = generateDungeon(floor);
    updateFog();
    updateCamera();
    toast(`🏰 B${floor}F 도착! HP 25% 회복`);
    hudDirty = true;
  }

  function restoreEquipStats() {
    if (!player.equipment) return;
    const s = player.equipment.stats || {};
    player.baseAtk = 5 + (s.attackBonus  || 0);
    player.baseDef =     (s.defenseBonus || 0);
  }

  // ══════════════════════════════════════════════════════════════
  // 플로팅 이펙트
  // ══════════════════════════════════════════════════════════════
  function spawnFx(x, y, text, color, life=800) {
    effects.push({ x, y, text, color, life, maxLife:life });
  }

  function updateEffects(dt) {
    for (const ef of effects) ef.life -= dt;
    effects = effects.filter(ef => ef.life > 0);
  }

  // ══════════════════════════════════════════════════════════════
  // 렌더링
  // ══════════════════════════════════════════════════════════════
  function render() {
    ctx.clearRect(0, 0, CW, CH);
    const now = performance.now();

    // ── 타일 ──────────────────────────────────────────────────
    for (let ty=0; ty<DH; ty++) {
      for (let tx=0; tx<DW; tx++) {
        const sx=tx*TS-camX, sy=ty*TS-camY;
        if (sx>CW||sy>CH||sx<-TS||sy<-TS) continue;

        if (!dungeon.revealed[ty][tx]) {
          ctx.fillStyle='#030308'; ctx.fillRect(sx,sy,TS,TS);
          continue;
        }

        const t = dungeon.grid[ty][tx];
        if (t === T.WALL) {
          ctx.fillStyle='#0d0d1a'; ctx.fillRect(sx,sy,TS,TS);
          ctx.fillStyle='#060610'; ctx.fillRect(sx+3,sy+3,TS-6,TS-6);
        } else {
          ctx.fillStyle='#161626'; ctx.fillRect(sx,sy,TS,TS);
          ctx.strokeStyle='#0e0e22'; ctx.lineWidth=0.5;
          ctx.strokeRect(sx+0.5,sy+0.5,TS-1,TS-1);
          if (t===T.STAIRS) {
            ctx.fillStyle='#f5c518';
            ctx.font='20px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText('▼',sx+TS/2,sy+TS/2+1);
          } else if (t===T.CHEST) {
            ctx.font='20px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText('📦',sx+TS/2,sy+TS/2+1);
          }
        }
      }
    }

    // ── 바닥 아이템 ───────────────────────────────────────────
    for (const item of dungeon.items) {
      if (!dungeon.revealed[item.gy]?.[item.gx]) continue;
      const sx=item.gx*TS-camX, sy=item.gy*TS-camY;
      const pulse = 0.85 + Math.sin(frameCount*0.08)*0.15;
      ctx.globalAlpha = pulse;
      ctx.font='18px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(item.def.emoji,sx+TS/2,sy+TS/2+1);
      ctx.globalAlpha=1;
    }

    // ── 텔레그래프 하이라이트 ────────────────────────────────
    for (const e of dungeon.enemies) {
      if (e.dead || e.state!=='telegraph') continue;
      const pct = Math.min(1,(now-e.telegraphStart)/TELEGRAPH_MS);

      // 공격 예정 칸 붉게 표시
      const sx=e.atkTgx*TS-camX, sy=e.atkTgy*TS-camY;
      ctx.fillStyle=`rgba(255,${Math.round(60*(1-pct))},0,${0.22+pct*0.50})`;
      ctx.fillRect(sx,sy,TS,TS);

      // 적 주변 경고 링
      const ex=e.px-camX+TS/2, ey=e.py-camY+TS/2;
      const rPulse=Math.sin(now*0.016)*2;
      ctx.strokeStyle=`rgba(255,${Math.round(180*(1-pct))},0,0.9)`;
      ctx.lineWidth=2+pct*2;
      ctx.beginPath(); ctx.arc(ex,ey,TS/2-2+rPulse,0,Math.PI*2); ctx.stroke();
    }

    // ── 적 ────────────────────────────────────────────────────
    for (const e of dungeon.enemies) {
      if (e.dead) continue;
      // 시야 밖이고 플레이어와 멀면 렌더 스킵
      if (!dungeon.revealed[e.gy]?.[e.gx] &&
          Math.abs(e.gx-player.gx)+Math.abs(e.gy-player.gy)>7) continue;

      const sx=e.px-camX, sy=e.py-camY;

      // 배경 원
      ctx.fillStyle = e.state==='stunned' ? '#1e3040' : '#0d0d1a';
      ctx.beginPath(); ctx.arc(sx+TS/2,sy+TS/2,TS/2-3,0,Math.PI*2); ctx.fill();

      // 이모지
      ctx.font='19px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(e.def.emoji,sx+TS/2,sy+TS/2+1);

      // HP 바
      const hp_pct=e.hp/e.maxHp;
      ctx.fillStyle='#1a1a1a'; ctx.fillRect(sx+2,sy+TS-5,TS-4,3);
      ctx.fillStyle=hp_pct>0.5?'#4caf50':hp_pct>0.25?'#ff9800':'#f44336';
      ctx.fillRect(sx+2,sy+TS-5,Math.round((TS-4)*hp_pct),3);

      // 기절 표시
      if (e.state==='stunned') {
        ctx.font='11px serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
        ctx.fillText('💫',sx+TS/2,sy+2);
      }
    }

    // ── 플레이어 ─────────────────────────────────────────────
    {
      const sx=player.px-camX, sy=player.py-camY;

      // 방어막 글로우
      if (player.shieldActive) {
        ctx.strokeStyle='#42a5f5'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(sx+TS/2,sy+TS/2,TS/2,0,Math.PI*2); ctx.stroke();
      }

      // 몸체 원
      ctx.fillStyle = player.durBroken ? '#200808' : '#0f0f2a';
      ctx.beginPath(); ctx.arc(sx+TS/2,sy+TS/2,TS/2-3,0,Math.PI*2); ctx.fill();

      // 이모지
      ctx.font='20px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('🧙',sx+TS/2,sy+TS/2+1);
    }

    // ── 플로팅 이펙트 ─────────────────────────────────────────
    for (const ef of effects) {
      const alpha  = ef.life/ef.maxLife;
      const rise   = (1-alpha)*30;
      ctx.globalAlpha=alpha;
      ctx.fillStyle=ef.color;
      ctx.font='bold 12px "Jua",monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(ef.text, ef.x-camX, ef.y-camY-rise);
      ctx.globalAlpha=1;
    }

    // ── 조작 힌트 (좌하단) ───────────────────────────────────
    ctx.fillStyle='rgba(80,80,120,0.55)';
    ctx.font='10px monospace'; ctx.textAlign='left'; ctx.textBaseline='bottom';
    const isTouchDevice = navigator.maxTouchPoints > 0;
    ctx.fillText(isTouchDevice
      ? 'D패드: 이동  ⚡버튼: 반격  슬롯 탭: 아이템'
      : 'WASD/방향키: 이동  Space: 반격  F: 아이템', 6, CH-4);
  }

  // ══════════════════════════════════════════════════════════════
  // HUD 업데이트
  // ══════════════════════════════════════════════════════════════
  function updateHud() {
    if (!hudDirty) return;
    hudDirty = false;

    // HP 바
    const hpPct = player.hp / player.maxHp * 100;
    $hpBar.style.width = hpPct + '%';
    $hpBar.style.background = hpPct>50 ? '#4caf50' : hpPct>25 ? '#ff9800' : '#f44336';
    $hpText.textContent = `${player.hp}/${player.maxHp}`;

    // 내구도 바
    if (player.durabilityMax > 0) {
      const dp = player.durability / player.durabilityMax * 100;
      $durBar.style.width = dp + '%';
      $durBar.style.background = dp>50 ? '#2196f3' : dp>20 ? '#ff9800' : '#f44336';
      $durText.textContent = `${player.durability}/${player.durabilityMax}`;
    } else {
      $durBar.style.width = '0%';
      $durText.textContent = '없음';
    }

    $floorLbl.textContent = `B${floor}F`;

    // 아이템 슬롯 (종류별 묶음)
    $itemSlots.innerHTML = '';
    const grouped = {};
    for (const it of player.inventory) {
      if (!grouped[it.type]) grouped[it.type] = { def:it.def, count:0 };
      grouped[it.type].count++;
    }
    for (const [type, g] of Object.entries(grouped)) {
      const btn = document.createElement('button');
      btn.className = 'item-btn';
      btn.title = `${g.def.name} — ${g.def.desc}`;
      btn.innerHTML = `${g.def.emoji}<span class="item-count">${g.count>1?g.count:''}</span>`;
      btn.addEventListener('click', () => useItem(type));
      btn.addEventListener('touchstart', (ev) => { ev.preventDefault(); useItem(type); }, { passive:false });
      $itemSlots.appendChild(btn);
    }
  }

  // ── 반응 프롬프트 렌더 ───────────────────────────────────────
  function renderRpPrompt() {
    const now = performance.now();
    const telegraphing = dungeon.enemies.filter(e => e.state==='telegraph' && !e.dead);
    if (!telegraphing.length) { hideRpPrompt(); return; }

    const most = telegraphing.reduce((a,b) =>
      (now-b.telegraphStart)>(now-a.telegraphStart)?b:a
    );
    const elapsed = now - most.telegraphStart;
    const pct     = Math.max(0, (1 - elapsed/TELEGRAPH_MS) * 100);

    $rpBar.style.width = pct + '%';

    const inWin  = elapsed>=CTR_START && elapsed<=CTR_END;
    const inPerf = elapsed>=CTR_START && elapsed<=PERF_END;
    $rpCounter.className = 'rp-counter-btn' + (inPerf ? ' perfect' : '');
    $rpCounter.style.opacity = inWin ? '1' : '0.35';
    $rpCounter.textContent   = inPerf ? '⚡ Space 완벽 반격!' : '⚡ Space 반격';

    $rpPrompt.classList.remove('hidden');
  }

  function hideRpPrompt() { $rpPrompt.classList.add('hidden'); }

  let _toastTimer;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.remove('hidden');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(()=>$toast.classList.add('hidden'), 1900);
  }

  // ══════════════════════════════════════════════════════════════
  // 게임 루프
  // ══════════════════════════════════════════════════════════════
  function loop(ts) {
    animId = requestAnimationFrame(loop);
    const dt = Math.min(50, ts - (lastFrameAt || ts));
    lastFrameAt = ts;
    frameCount  = (frameCount||0) + 1;
    if (gameState !== 'playing') return;

    // 키 입력 처리 (홀드 이동)
    if      (keys['ArrowUp']   ||keys['w']||keys['W']) tryMove( 0,-1);
    else if (keys['ArrowDown'] ||keys['s']||keys['S']) tryMove( 0, 1);
    else if (keys['ArrowLeft'] ||keys['a']||keys['A']) tryMove(-1, 0);
    else if (keys['ArrowRight']||keys['d']||keys['D']) tryMove( 1, 0);

    // 플레이어 픽셀 위치 보간
    player.px += (player.gx*TS - player.px) * 0.35;
    player.py += (player.gy*TS - player.py) * 0.35;

    updateEnemies();
    updateEffects(dt);
    updateFog();
    updateCamera();
    render();
    updateHud();
  }

  // ══════════════════════════════════════════════════════════════
  // 화면 전환
  // ══════════════════════════════════════════════════════════════
  function setGameState(s) {
    gameState = s;
    $screenEquip.classList.toggle('hidden', s!=='equip_select');
    $screenGame.classList.toggle ('hidden', s!=='playing');
    $screenDead.classList.toggle ('hidden', s!=='dead');

    if (s === 'dead') {
      if (animId) { cancelAnimationFrame(animId); animId=null; }
      $deadStats.textContent =
        `B${floor}F 에서 전투 불능\n처치 ${player.kills}마리  ·  경험치 ${player.xp}`;
    }
    if (s === 'playing') {
      resizeCanvas(); // screen-game이 visible 된 직후 정확한 크기 측정
      updateCamera();
      if (!animId) {
        lastFrameAt = 0; frameCount = 0;
        animId = requestAnimationFrame(loop);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 게임 시작
  // ══════════════════════════════════════════════════════════════
  function startGame(equip) {
    if (animId) { cancelAnimationFrame(animId); animId=null; }
    floor = 1; effects = [];

    player.equipment = equip;
    if (equip) {
      const s = equip.stats || {};
      player.baseAtk      = 5 + (s.attackBonus  || 0);
      player.baseDef      =     (s.defenseBonus  || 0);
      player.moveDelay    = Math.round(MOVE_BASE_MS * (1 - Math.min(0.5, s.speedBonus||0)));
      player.durabilityMax = s.durabilityMax || equip.durability || 100;
      player.durability    = Math.min(player.durabilityMax, equip.durability ?? player.durabilityMax);
      $equipNameHud.textContent = equip.name || '장비';
    } else {
      player.baseAtk=5; player.baseDef=0;
      player.moveDelay=MOVE_BASE_MS;
      player.durability=0; player.durabilityMax=0;
      $equipNameHud.textContent='맨손';
    }

    player.maxHp       = 100 + player.baseDef * 5; // 방어력이 높을수록 HP↑
    player.hp          = player.maxHp;
    player.durBroken   = false;
    player.shieldActive = false;
    player.powerBonus  = 0;
    player.inventory   = [];
    player.xp=0; player.kills=0;
    player.lastMoveAt=0;

    dungeon = generateDungeon(1);
    updateFog();
    camX=0; camY=0; updateCamera();
    hudDirty = true;

    setGameState('playing');
  }

  // ══════════════════════════════════════════════════════════════
  // 장비 로딩 (서버 API)
  // ══════════════════════════════════════════════════════════════
  async function loadEquipment() {
    if (!alpToken || !platformApi) {
      $equipStatus.textContent = '연결 없음 — 맨손으로 입장하거나 게임에서 열어 주세요.';
      return;
    }
    try {
      $equipStatus.textContent = '장비 불러오는 중…';
      const res = await fetch(`${platformApi}/api/craft/equipment?limit=20`, {
        headers: { Authorization:`Bearer ${alpToken}` },
      });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const list = (data.equipment || []).filter(e => e && e.stats);
      renderEquipList(list);
      $equipStatus.textContent = list.length
        ? `장비 ${list.length}개 · 하나를 선택하세요`
        : '장비가 없습니다. 대장간에서 만들어 오세요!';
    } catch {
      $equipStatus.textContent = '장비 불러오기 실패 — 맨손으로 입장합니다.';
    }
  }

  function renderEquipList(list) {
    $equipList.innerHTML = '';
    for (const eq of list) {
      const s   = eq.stats || {};
      const card = document.createElement('div');
      card.className = 'equip-card';
      card.setAttribute('role','button'); card.tabIndex=0;

      // 썸네일
      const thumb = document.createElement('div');
      thumb.className='equip-thumb';
      const pa = eq.pixelArt || eq.pixel_art;
      if (pa && pa.imageDataUrl) {
        const img=document.createElement('img');
        img.src=pa.imageDataUrl; img.width=52; img.height=52;
        thumb.appendChild(img);
      } else {
        thumb.textContent = eq.itemEmoji || '⚔️';
      }

      // 정보
      const info = document.createElement('div');
      info.className = 'equip-info';
      const spdPct = ((s.speedBonus||0)*100).toFixed(0);
      const tier   = String(eq.tier||'common').toLowerCase();
      const rarityClass = {legendary:'rarity-legendary',epic:'rarity-epic',rare:'rarity-rare'}[tier]||'rarity-common';
      info.innerHTML = `
        <div class="equip-card-name ${rarityClass}">${escHtml(eq.name||'장비')}</div>
        <div class="equip-card-stats">
          공격 <span>+${s.attackBonus||0}</span> ·
          방어 <span>+${s.defenseBonus||0}</span> ·
          속도 <span>+${spdPct}%</span> ·
          내구 <span>${eq.durability??s.durabilityMax??'-'}</span>
        </div>`;

      card.appendChild(thumb); card.appendChild(info);

      const choose=()=>startGame(eq);
      card.onclick=choose;
      card.onkeydown=(ev)=>{ if(ev.key==='Enter'||ev.key===' ') choose(); };
      $equipList.appendChild(card);
    }
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ══════════════════════════════════════════════════════════════
  // 입력 설정
  // ══════════════════════════════════════════════════════════════
  function setupInput() {
    // 키보드
    document.addEventListener('keydown', (ev) => {
      keys[ev.key] = true;
      if (ev.key==='ArrowUp'||ev.key==='ArrowDown'||
          ev.key==='ArrowLeft'||ev.key==='ArrowRight') ev.preventDefault();
      if (ev.key===' '||ev.key==='z'||ev.key==='Z') { ev.preventDefault(); tryCounter(); }
      if (ev.key==='f'||ev.key==='F') {
        // F키: 포션 우선 사용, 없으면 첫 번째 아이템
        const t = player.inventory.find(it=>it.type==='potion')?.type
                || player.inventory[0]?.type;
        if (t) useItem(t);
      }
    });
    document.addEventListener('keyup', (ev) => { keys[ev.key]=false; });

    // 모바일 D패드 (이동 버튼)
    $dpad.querySelectorAll('[data-dx]').forEach(btn => {
      const dx=parseInt(btn.dataset.dx), dy=parseInt(btn.dataset.dy);
      let holdTimer=null;

      const start=(ev)=>{
        ev.preventDefault();
        tryMove(dx,dy);
        holdTimer=setInterval(()=>{ if(gameState==='playing') tryMove(dx,dy); }, 80);
      };
      const stop=()=>{ clearInterval(holdTimer); holdTimer=null; };

      btn.addEventListener('touchstart', start, { passive:false });
      btn.addEventListener('touchend',   stop,  { passive:false });
      btn.addEventListener('touchcancel',stop,  { passive:false });
      btn.addEventListener('mousedown',  start);
      btn.addEventListener('mouseup',    stop);
      btn.addEventListener('mouseleave', stop);
    });

    // 반격 버튼
    $btnCounter.addEventListener('click', tryCounter);
    $btnCounter.addEventListener('touchstart',(ev)=>{ ev.preventDefault(); tryCounter(); },{ passive:false });

    // 시작 버튼들
    $btnBare.addEventListener('click', ()=>startGame(null));
    $btnRestart.addEventListener('click', ()=>{
      if(animId){ cancelAnimationFrame(animId); animId=null; }
      setGameState('equip_select');
      loadEquipment();
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 캔버스 동적 리사이즈
  // ══════════════════════════════════════════════════════════════
  function resizeCanvas() {
    const wrap = document.querySelector('.canvas-wrap');
    if (!wrap || !canvas) return;
    const maxW = wrap.clientWidth;
    const maxH = wrap.clientHeight;
    VW = Math.min(DW, Math.max(7, Math.floor(maxW / TS)));
    VH = Math.min(DH, Math.max(7, Math.floor(maxH / TS)));
    CW = VW * TS;
    CH = VH * TS;
    canvas.width  = CW;
    canvas.height = CH;
    // canvas-wrap 전체를 채우도록 CSS 크기 조정
    canvas.style.width  = maxW + 'px';
    canvas.style.height = maxH + 'px';
    if (ctx) ctx.imageSmoothingEnabled = false;
  }

  // ══════════════════════════════════════════════════════════════
  // 초기화
  // ══════════════════════════════════════════════════════════════
  function init() {
    $screenEquip  = document.getElementById('screen-equip');
    $screenGame   = document.getElementById('screen-game');
    $screenDead   = document.getElementById('screen-dead');
    $equipList    = document.getElementById('equip-list');
    $equipStatus  = document.getElementById('equip-status');
    $btnBare      = document.getElementById('btn-bare');
    $hpBar        = document.getElementById('hp-bar');
    $hpText       = document.getElementById('hp-text');
    $durBar       = document.getElementById('dur-bar');
    $durText      = document.getElementById('dur-text');
    $floorLbl     = document.getElementById('floor-lbl');
    $equipNameHud = document.getElementById('equip-name-hud');
    $itemSlots    = document.getElementById('item-slots');
    $rpPrompt     = document.getElementById('reaction-prompt');
    $rpBar        = document.getElementById('rp-bar');
    $rpCounter    = document.getElementById('rp-counter');
    $toast        = document.getElementById('toast');
    $btnCounter   = document.getElementById('btn-counter');
    $dpad         = document.querySelector('.dpad');
    $deadStats    = document.getElementById('dead-stats');
    $btnRestart   = document.getElementById('btn-restart');

    canvas = document.getElementById('canvas');
    ctx    = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // 주소창·갤럭시 UI 가림 방지: 실제 보이는 높이를 CSS 변수로 주입
    function updateVh() {
      document.documentElement.style.setProperty('--vh', window.innerHeight + 'px');
    }
    updateVh();
    window.addEventListener('resize', () => { updateVh(); resizeCanvas(); });
    // visualViewport: 키보드 등으로 viewport 크기 변화 시 추가 대응
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => { updateVh(); resizeCanvas(); });
    }

    setupInput();
    loadEquipment();
    setGameState('equip_select');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
