(function () {
  'use strict';

  // ── 서버 연결 ──────────────────────────────────────────────────
  const urlParams  = new URLSearchParams(window.location.search);
  const alpToken   = urlParams.get('token') || '';
  const platformApi = window.__ALP_PLATFORM_API__ || '';

  // ── 상수 ───────────────────────────────────────────────────────
  const DW = 32, DH = 32;  // 던전 격자 크기
  const TS = 32;            // 타일 픽셀 크기
  const ZOOM = 1.15;         // 카메라 확대 배율 (클수록 타일이 크게 보임)
  let VW = 7, VH = 11;     // 뷰포트 타일 수 (resizeCanvas에서 재계산)
  let CW = VW * TS, CH = VH * TS;

  // 스태미나 상수
  const STA_MAX      = 100;
  const STA_ATK_COST = 10;   // 공격 시 소모
  const STA_CTR_COST = 13;   // 반격 시 소모
  const STA_REGEN    = 15;   // 초당 회복량

  const MOVE_BASE_MS = 220;  // 기본 이동 쿨다운 (ms)
  const TELEGRAPH_MS = 700;  // 적 공격 예고 시간 (ms)
  const CTR_START    = 140;  // 반격 가능 시작 (ms)
  const CTR_END      = 570;  // 반격 가능 종료 (ms)
  const PERF_END     = 390;  // 완벽 반격 종료 (ms) — CTR_START~PERF_END

  // 타일 종류
  const T = { WALL: 0, FLOOR: 1, STAIRS: 2, CHEST: 3, PORTAL: 4 };

  // ── 장비 슬롯 정의 ─────────────────────────────────────────────
  const SLOT_DEFS = [
    { id: 'weapon',    emoji: '⚔️', label: '무기',    weapon: true  },
    { id: 'head',      emoji: '🪖', label: '머리',    weapon: false },
    { id: 'chest',     emoji: '🧥', label: '상의',    weapon: false },
    { id: 'pants',     emoji: '👖', label: '하의',    weapon: false },
    { id: 'gloves',    emoji: '🧤', label: '손',      weapon: false },
    { id: 'boots',     emoji: '👢', label: '다리',    weapon: false },
    { id: 'accessory', emoji: '💍', label: '악세서리', weapon: false },
  ];

  // ── 적/아이템 정의 (enemies.json / items.json 에서 로드) ──────
  let EDEFS = [];
  let IDEF  = {};

  // ── 모듈 시스템 ───────────────────────────────────────────────
  // Offensive module types (durability decreases on attack)
  const OFFENSIVE_MODULE_TYPES = new Set(['barrel','scope','grip','muzzle','gem']);
  // Defensive module types (durability decreases on damage taken)
  const DEFENSIVE_MODULE_TYPES = new Set(['padding','reinforcement','visor','lining','sole','enchant']);
  // Buffer module types (absorb equipment durability damage instead of the equipment)
  const BUFFER_MODULE_TYPES = new Set(['buffer']);
  // equippedTo → [module, ...] map (populated on load)
  let modulesByEquip = {};

  // ── 게임 상태 변수 ─────────────────────────────────────────────
  let canvas, ctx, animId;
  let gameState = 'equip_select'; // equip_select | playing | dead
  let floor, dungeon, effects, frameCount, isRestFloor;
  let camX, camY, camTX, camTY, lastFrameAt, hudDirty;

  const player = {
    gx: 0, gy: 0,   // 격자 위치
    px: 0, py: 0,   // 픽셀 위치 (부드러운 이동용)
    hp: 0, maxHp: 0,
    baseAtk: 5, baseDef: 0,
    moveDelay: MOVE_BASE_MS,
    lastMoveAt: 0,
    equipment: null,
    equippedSlots: {},
    durability: 0, durabilityMax: 0,
    durBroken: false,
    inventory: [],
    shieldActive: false,
    powerBonus: 0,
    xp: 0, kills: 0,
    stamina: STA_MAX,
    // Module durability tracking: moduleId → current durability
    moduleDurabilities: {},
    // Synergy-derived decay multiplier (1.0 = normal)
    moduleDecayMul: 1.0,
  };

  // ── DOM 참조 ───────────────────────────────────────────────────
  let $screenEquip, $screenGame, $screenDead;
  let $equipList, $equipStatus, $btnBare, $btnContinue;
  let $hpBar, $hpText, $durBar, $durText, $staBar, $staText;
  let $floorLbl, $equipNameHud, $armorNameHud, $itemSlots;
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

      const count = Math.min(10, 4 + Math.floor(Math.random()*4) + Math.floor(f/3));
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

  function generateRestFloor() {
    const grid = [];
    const revealed = [];
    for (let y = 0; y < DH; y++) {
      grid.push(new Array(DW).fill(T.WALL));
      revealed.push(new Uint8Array(DW).fill(1)); // 휴식층은 안개 없이 전체 공개
    }

    // 넓은 방 (22×14, 격자 중앙)
    const rw = 22, rh = 14;
    const rx = Math.floor((DW - rw) / 2);
    const ry = Math.floor((DH - rh) / 2);
    for (let y = ry; y < ry + rh; y++)
      for (let x = rx; x < rx + rw; x++)
        grid[y][x] = T.FLOOR;

    // 포털 (다음 층 입구) — 상단 중앙
    const portalX = Math.floor(DW / 2);
    const portalY = ry + 1;
    grid[portalY][portalX] = T.PORTAL;

    // 플레이어 시작 — 하단 중앙
    player.gx = Math.floor(DW / 2);
    player.gy = ry + rh - 2;
    player.px = player.gx * TS;
    player.py = player.gy * TS;

    return {
      grid, rooms: [{ x: rx, y: ry, w: rw, h: rh, cx: Math.floor(DW / 2), cy: Math.floor(DH / 2) }],
      enemies: [], items: [], revealed, isRest: true,
    };
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
    // 타겟은 격자 기준 (이동 완료 시에만 변경)
    const tx = player.gx * TS - VW * 0.5 * TS + TS * 0.5;
    const ty = player.gy * TS - VH * 0.5 * TS + TS * 0.5;
    camTX = Math.max(0, Math.min(DW * TS - CW, tx));
    camTY = Math.max(0, Math.min(DH * TS - CH, ty));
    // 초기화 시 즉시 이동
    if (camX === undefined || camX === null) { camX = camTX; camY = camTY; }
  }

  function lerpCamera(dt) {
    // dt 기반 보간 — 주사율(30/60/144Hz)에 무관하게 동일한 속도
    const k = 1 - Math.pow(0.93, dt / 16.67);
    camX += (camTX - camX) * k;
    camY += (camTY - camY) * k;
    if (Math.abs(camTX - camX) < 0.5) camX = camTX;
    if (Math.abs(camTY - camY) < 0.5) camY = camTY;
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

    if (tile === T.STAIRS) { enterRestFloor(); return; }
    if (tile === T.PORTAL) { enterCombatFloor(); return; }
    if (tile === T.CHEST)  { openChest(nx, ny); }
  }

  function bumpAttack(enemy) {
    if (player.stamina < STA_ATK_COST) {
      toast('⚡ 스태미나 부족!');
      spawnFx(player.px + TS/2, player.py - 10, '스태미나 부족', '#9e9e9e', 700);
      return;
    }
    player.stamina -= STA_ATK_COST;
    const dmg = Math.max(1, (player.baseAtk + player.powerBonus) - enemy.def_);
    enemy.hp -= dmg;
    spawnFx(enemy.px + TS/2, enemy.py, `-${dmg}`, '#ff5722');
    if (enemy.hp <= 0) killEnemy(enemy);
    damageWeaponDur();
    damageOffensiveModules();
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

    // 장비 아이템: 장착 전환 (소모 없음)
    if (item.type === 'equip') {
      if (!item.active) equipWeapon(item);
      hudDirty = true;
      return;
    }

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
        // 활성 장비 아이템 내구도 동기화
        const activeEq = player.inventory.find(it => it.type === 'equip' && it.active);
        if (activeEq) activeEq.curDur = player.durability;
        if (player.durBroken && player.durability > 0) {
          player.durBroken = false;
          const ws = player.equipment?.stats || {};
          const a = calcArmorTotals();
          player.baseAtk = 5 + a.atk + (ws.attackBonus  || 0);
          player.baseDef = a.def +      (ws.defenseBonus || 0);
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

    if (player.stamina < STA_CTR_COST) {
      toast('⚡ 스태미나 부족!');
      spawnFx(player.px+TS/2, player.py-10, '스태미나 부족', '#9e9e9e', 700);
      return;
    }
    player.stamina -= STA_CTR_COST;

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
    damageWeaponDur();
    damageOffensiveModules();
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

      // ── regen 틱 ─────────────────────────────────────────────
      if (e.def.pattern === 'regen') {
        if (!e.regenAt) e.regenAt = now + 3000;
        if (now >= e.regenAt && e.hp < e.maxHp) {
          e.hp = Math.min(e.maxHp, e.hp + 2);
          spawnFx(e.px + TS/2, e.py - 8, '+2', '#4caf50', 600);
          hudDirty = true;
          e.regenAt = now + 3000;
        }
      }

      // ── 순찰 / 추격 ──────────────────────────────────────────
      if (now < e.nextMoveAt) continue;

      const dist       = Math.abs(e.gx - player.gx) + Math.abs(e.gy - player.gy);
      const pattern    = e.def.pattern || 'melee';
      const chaseRange = pattern === 'rush' ? 14 : 8;
      const visible    = dungeon.revealed[e.gy]?.[e.gx];

      // ── 원거리 패턴 ─────────────────────────────────────────
      if (pattern === 'ranged' && (e.def.range || 1) > 1) {
        if (checkRangedLine(e)) {
          // 사거리 내 일직선 → 원거리 공격 예고
          e.state          = 'telegraph';
          e.telegraphStart = now;
          e.atkTgx         = player.gx;
          e.atkTgy         = player.gy;
          e.rangedAtk      = true;
          anyTelegraph     = true;
        } else if (dist <= chaseRange && visible) {
          moveToward(e, player.gx, player.gy);
          e.state      = 'chase';
          e.nextMoveAt = now + e.def.mvMs;
        } else {
          moveRandom(e);
          e.state      = 'patrol';
          e.nextMoveAt = now + e.def.mvMs * 1.6;
        }
        continue;
      }

      // ── 근접 / 돌진 / 겁쟁이 ────────────────────────────────
      if (dist === 1) {
        e.state          = 'telegraph';
        e.telegraphStart = now;
        e.atkTgx         = player.gx;
        e.atkTgy         = player.gy;
        e.rangedAtk      = false;
        anyTelegraph     = true;
      } else if (dist <= chaseRange && visible) {
        const chaseMs = pattern === 'rush' ? Math.round(e.def.mvMs * 0.65) : e.def.mvMs;
        moveToward(e, player.gx, player.gy);
        e.state      = 'chase';
        e.nextMoveAt = now + chaseMs;
      } else {
        moveRandom(e);
        e.state      = 'patrol';
        e.nextMoveAt = now + e.def.mvMs * 1.6;
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

    // 피격 부위 방어구 내구도 감소
    const hitSlot = pickHitSlot();
    if (hitSlot) damageArmorSlot(hitSlot);
    damageDefensiveModules();

    enemy.state='cooldown'; enemy.nextMoveAt = performance.now()+500;
    if (enemy.def.pattern === 'coward') retreatFrom(enemy, player.gx, player.gy);
    hudDirty = true;

    if (player.hp <= 0) {
      player.hp = 0;
      // 죽기 전 내구도 동기화 후 세이브 삭제 (keepalive로 페이지 전환 중에도 완료)
      const _deadSave = buildSaveData();
      localStorage.removeItem(SAVE_KEY);
      if (_deadSave && alpToken && platformApi) {
        fetch(`${platformApi}/api/dungeon/exit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alpToken}` },
          body: JSON.stringify({ data: _deadSave }),
          keepalive: true,
        }).catch(() => {});
      }
      setGameState('dead');
    }
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

  // 일직선 시야 체크 (벽 없이 가로/세로로 연결되는지)
  function hasLosCardinal(x0, y0, x1, y1) {
    if (x0 !== x1 && y0 !== y1) return false;
    const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
    let x = x0 + sx, y = y0 + sy;
    while (x !== x1 || y !== y1) {
      if (dungeon.grid[y]?.[x] === T.WALL) return false;
      x += sx; y += sy;
    }
    return true;
  }

  // 원거리 사거리 내 일직선 체크
  function checkRangedLine(e) {
    const dx = player.gx - e.gx, dy = player.gy - e.gy;
    const dist = Math.abs(dx) + Math.abs(dy);
    const range = e.def.range || 1;
    if (!((dx === 0 || dy === 0) && dist > 0 && dist <= range)) return false;
    return hasLosCardinal(e.gx, e.gy, player.gx, player.gy);
  }

  // 겁쟁이 패턴: 공격 후 플레이어로부터 도망
  function retreatFrom(e, fromX, fromY) {
    const dx = Math.sign(e.gx - fromX), dy = Math.sign(e.gy - fromY);
    const opts = [];
    if (dx !== 0) opts.push([dx, 0]);
    if (dy !== 0) opts.push([0, dy]);
    if (dx === 0) opts.push([1, 0], [-1, 0]);
    if (dy === 0) opts.push([0, 1], [0, -1]);
    for (const [ox, oy] of opts) {
      const nx = e.gx + ox, ny = e.gy + oy;
      if (!inBounds(nx, ny) || dungeon.grid[ny][nx] === T.WALL) continue;
      if (dungeon.enemies.some(o => !o.dead && o !== e && o.gx === nx && o.gy === ny)) continue;
      if (nx === player.gx && ny === player.gy) continue;
      e.gx = nx; e.gy = ny; return;
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
  function syncDurabilityToServer() {
    if (!alpToken || !platformApi) return;
    const weapon = (player.equipment?.id != null && player.durabilityMax > 0)
      ? { id: player.equipment.id, durability: player.durability }
      : null;
    const armor = Object.values(player.equippedSlots || {})
      .filter(w => w?.equip?.id != null)
      .map(w => ({ id: w.equip.id, durability: w.curDur }));
    if (!weapon && armor.length === 0) return;
    fetch(`${platformApi}/api/dungeon/sync-durability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alpToken}` },
      body: JSON.stringify({ weapon, armor }),
      keepalive: true,
    }).catch(() => {});
  }

  function enterRestFloor() {
    player.powerBonus = 0;
    player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.25));
    isRestFloor = true;
    dungeon = generateRestFloor();
    camX = camTX = 0; camY = camTY = 0; updateCamera(); camX = camTX; camY = camTY;
    toast(`⛺ 휴식층 도착! HP 25% 회복 · 포털로 다음 층 이동`);
    hudDirty = true;
    syncDurabilityToServer(); // 휴식층 진입 시 내구도 DB 동기화
    saveGame();
  }

  function enterCombatFloor() {
    floor++;
    isRestFloor = false;
    dungeon = generateDungeon(floor);
    updateFog();
    updateCamera();
    toast(`🏰 B${floor}F 도착!`);
    hudDirty = true;
  }

  function calcArmorTotals() {
    let atk = 0, def = 0, spd = 0, hp = 0;
    for (const wrapper of Object.values(player.equippedSlots || {})) {
      if (!wrapper) continue;
      if (wrapper.curDur <= 0) continue; // 파괴된 방어구는 스탯 없음
      const s = (wrapper.equip || wrapper).stats || {};
      atk += (s.attackBonus  || 0);
      def += (s.defenseBonus || 0);
      spd += (s.speedBonus   || 0);
      hp  += (s.hpBonus      || 0);
    }
    return { atk, def, spd, hp };
  }

  // Sum stat bonuses from modules on a given equipment ID (only if durability > 0)
  function sumModuleStatsForEquip(equipId) {
    const mods = modulesByEquip[String(equipId)] || [];
    let atk = 0, def = 0, spd = 0, hp = 0;
    for (const mod of mods) {
      const cur = player.moduleDurabilities[mod.id];
      if (cur != null && cur <= 0) continue; // broken module
      const s = mod.stats || {};
      atk += (s.attackBonus  || 0);
      def += (s.defenseBonus || 0);
      spd += (s.speedBonus   || 0);
      hp  += (s.hpBonus      || 0);
    }
    return { atk, def, spd, hp };
  }

  // Recompute all player combat stats from scratch (armor + weapon + modules)
  function _recomputePlayerStats() {
    let atkSum = 0, defSum = 0, spdSum = 0, hpSum = 0;
    for (const wrapper of Object.values(player.equippedSlots || {})) {
      if (!wrapper || (wrapper.curDur != null && wrapper.curDur <= 0)) continue;
      const eq = wrapper.equip || wrapper;
      const s  = eq.stats || {};
      atkSum += (s.attackBonus  || 0);
      defSum += (s.defenseBonus || 0);
      spdSum += (s.speedBonus   || 0);
      hpSum  += (s.hpBonus      || 0);
      const eid = eq?.id;
      if (eid) {
        const ms = sumModuleStatsForEquip(eid);
        atkSum += ms.atk; defSum += ms.def; spdSum += ms.spd; hpSum += ms.hp;
      }
    }
    if (player.equipment) {
      const ws  = player.equipment.stats || {};
      const wid = player.equipment.id;
      const wms = wid ? sumModuleStatsForEquip(wid) : { atk:0, def:0, spd:0, hp:0 };
      const broken = player.durBroken;
      player.baseAtk = 5 + atkSum + (broken ? 0 : (ws.attackBonus || 0)) + (broken ? 0 : wms.atk);
      player.baseDef = defSum + (broken ? Math.floor((ws.defenseBonus||0)/2) : (ws.defenseBonus||0)) +
                       (broken ? 0 : wms.def);
      player.moveDelay = Math.round(MOVE_BASE_MS * (1 - Math.min(0.5, spdSum + (ws.speedBonus||0) + wms.spd)));
      hpSum += wms.hp;
    } else {
      player.baseAtk   = 5 + atkSum;
      player.baseDef   = defSum;
      player.moveDelay = Math.round(MOVE_BASE_MS * (1 - Math.min(0.5, spdSum)));
    }
    const newMaxHp = Math.max(50, 100 + player.baseDef * 5 + hpSum);
    if (newMaxHp < player.maxHp) player.hp = Math.min(player.hp, newMaxHp);
    player.maxHp = newMaxHp;
  }

  function deleteEquipFromServer(id) {
    if (!alpToken || !platformApi || !id) return;
    fetch(`${platformApi}/api/craft/equipment/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${alpToken}` },
    }).catch(() => {});
  }

  function pickHitSlot() {
    const WEIGHTS = { chest:4, head:2, pants:2, gloves:1, boots:1, accessory:1 };
    const equipped = Object.keys(player.equippedSlots).filter(
      id => player.equippedSlots[id] && WEIGHTS[id]
    );
    if (!equipped.length) return null;
    let total = equipped.reduce((s, id) => s + WEIGHTS[id], 0);
    let r = Math.random() * total;
    for (const id of equipped) {
      r -= WEIGHTS[id];
      if (r <= 0) return id;
    }
    return equipped[equipped.length - 1];
  }

  function damageArmorSlot(slotId) {
    const wrapper = player.equippedSlots[slotId];
    if (!wrapper || wrapper.curDur <= 0) return;
    // 완충재 모듈이 있으면 방어구 내구도 대신 모듈 내구도 감소
    const armorId = String(wrapper?.equip?.id ?? wrapper?.id ?? '');
    const bufMod = (modulesByEquip[armorId] || [])
      .find(m => BUFFER_MODULE_TYPES.has(m.moduleType) && (player.moduleDurabilities[m.id] || 0) > 0);
    if (bufMod) {
      const next = Math.max(0, (player.moduleDurabilities[bufMod.id] || 0) - 1);
      player.moduleDurabilities[bufMod.id] = next;
      if (next === 0) {
        toast(`🛡️ ${bufMod.name} 소진!`);
        spawnFx(player.px + TS/2, player.py - 10, `완충재 소진!`, '#ff9800', 1000);
        _recomputePlayerStats();
        hudDirty = true;
      }
      return;
    }
    wrapper.curDur = Math.max(0, wrapper.curDur - 1);
    const slotDef = SLOT_DEFS.find(d => d.id === slotId);
    const label = slotDef ? slotDef.label : slotId;
    if (wrapper.curDur === 0) {
      const eq = wrapper.equip || wrapper;
      spawnFx(player.px+TS/2, player.py-10, `${label} 파괴!`, '#ff5722', 1200);
      toast(`💥 ${eq.name} 파괴됨!`);
      deleteEquipFromServer(eq.id);
      delete player.equippedSlots[slotId];
      const a = calcArmorTotals();
      const ws = player.equipment?.stats || {};
      player.baseAtk = 5 + a.atk + (player.durBroken ? Math.floor((ws.attackBonus||0)/2) : (ws.attackBonus||0));
      player.baseDef = a.def + (player.durBroken ? Math.floor((ws.defenseBonus||0)/2) : (ws.defenseBonus||0));
      player.moveDelay = Math.round(MOVE_BASE_MS * (1 - Math.min(0.5, a.spd + (ws.speedBonus||0))));
      const newMaxHp = Math.max(50, 100 + player.baseDef * 5 + a.hp);
      if (newMaxHp < player.maxHp) { player.hp = Math.min(player.hp, newMaxHp); player.maxHp = newMaxHp; }
      updateArmorHud();
    } else if (wrapper.curDur <= 3) {
      spawnFx(player.px+TS/2, player.py-10, `${label} 파손!`, '#ff9800', 800);
    }
    hudDirty = true;
  }

  function damageWeaponDur() {
    if (!player.equipment || player.durabilityMax <= 0 || player.durBroken) return;
    // 완충재 모듈이 있으면 장비 내구도 대신 모듈 내구도 감소
    const weaponId = String(player.equipment.id);
    const bufMod = (modulesByEquip[weaponId] || [])
      .find(m => BUFFER_MODULE_TYPES.has(m.moduleType) && (player.moduleDurabilities[m.id] || 0) > 0);
    if (bufMod) {
      const next = Math.max(0, (player.moduleDurabilities[bufMod.id] || 0) - 1);
      player.moduleDurabilities[bufMod.id] = next;
      if (next === 0) {
        toast(`🛡️ ${bufMod.name} 소진!`);
        spawnFx(player.px + TS/2, player.py - 10, `완충재 소진!`, '#ff9800', 1000);
        _recomputePlayerStats();
        hudDirty = true;
      }
      return;
    }
    player.durability = Math.max(0, player.durability - 1);
    const activeEq = player.inventory.find(it => it.type === 'equip' && it.active);
    if (activeEq) activeEq.curDur = player.durability;
    if (player.durability === 0) destroyWeapon();
  }

  function damageOffensiveModules() {
    _damageModulesOfTypes(OFFENSIVE_MODULE_TYPES);
  }

  function damageDefensiveModules() {
    _damageModulesOfTypes(DEFENSIVE_MODULE_TYPES);
  }

  function _damageModulesOfTypes(typeSet) {
    const decay = Math.max(1, Math.round(player.moduleDecayMul));
    // Iterate all equipped equipment IDs
    const equipIds = new Set();
    if (player.equipment?.id) equipIds.add(String(player.equipment.id));
    for (const wrapper of Object.values(player.equippedSlots || {})) {
      const eid = wrapper?.equip?.id ?? wrapper?.id;
      if (eid) equipIds.add(String(eid));
    }
    for (const eid of equipIds) {
      const mods = modulesByEquip[eid] || [];
      for (const mod of mods) {
        if (!typeSet.has(mod.moduleType)) continue;
        const cur = player.moduleDurabilities[mod.id];
        if (cur == null || cur <= 0) continue;
        const next = Math.max(0, cur - decay);
        player.moduleDurabilities[mod.id] = next;
        if (next === 0 && cur > 0) {
          toast(`🔩 ${mod.name} 모듈 파손!`);
          spawnFx(player.px + TS/2, player.py - 10, `${mod.name} 파손`, '#ff9800', 1000);
          // Recalculate player stats without the broken module
          _recomputePlayerStats();
          hudDirty = true;
        }
      }
    }
  }

  function destroyWeapon() {
    const activeEq = player.inventory.find(it => it.type === 'equip' && it.active);
    if (!activeEq) return;
    const eq = activeEq.equip;
    spawnFx(player.px+TS/2, player.py-10, '무기 파괴!', '#ff5722', 1200);
    toast(`💥 ${eq.name} 파괴됨!`);
    deleteEquipFromServer(eq.id);
    const idx = player.inventory.indexOf(activeEq);
    if (idx !== -1) player.inventory.splice(idx, 1);
    player.equipment = null;
    player.durability = 0; player.durabilityMax = 0;
    player.durBroken = false;
    const nextEq = player.inventory.find(it => it.type === 'equip');
    if (nextEq) {
      equipWeapon(nextEq);
    } else {
      const a = calcArmorTotals();
      player.baseAtk = 5 + a.atk;
      player.baseDef = a.def;
      player.moveDelay = Math.round(MOVE_BASE_MS * (1 - Math.min(0.5, a.spd)));
      if ($equipNameHud) $equipNameHud.textContent = '맨손';
    }
    hudDirty = true;
  }

  function updateArmorHud() {
    if (!$armorNameHud) return;
    const tot = calcArmorTotals();
    const parts = [];
    if (tot.def > 0) parts.push(`🛡️+${tot.def}`);
    if (tot.hp  > 0) parts.push(`❤️+${tot.hp}`);
    // 파괴된 슬롯 수 표시
    const broken = Object.values(player.equippedSlots).filter(w => w && w.curDur <= 0).length;
    if (broken > 0) parts.push(`💥${broken}파괴`);
    $armorNameHud.textContent = parts.length ? parts.join(' ') : '방어구 없음';
  }

  function equipWeapon(invItem) {
    // 기존 장착 해제
    const cur = player.inventory.find(it => it.type === 'equip' && it.active);
    if (cur) { cur.curDur = player.durability; cur.active = false; }

    invItem.active = true;
    player.equipment = invItem.equip;
    const s = invItem.equip.stats || {};
    const a = calcArmorTotals();
    player.baseAtk      = 5 + a.atk + (s.attackBonus  || 0);
    player.baseDef      = a.def +      (s.defenseBonus || 0);
    player.moveDelay    = Math.round(MOVE_BASE_MS * (1 - Math.min(0.5, a.spd + (s.speedBonus || 0))));
    player.durabilityMax = invItem.maxDur;
    player.durability    = invItem.curDur;
    player.durBroken     = invItem.curDur <= 0;
    $equipNameHud.textContent = invItem.equip.name || '장비';
    if (cur) toast(`⚔️ ${invItem.equip.name} 장착!`);
    hudDirty = true;
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
        if (dungeon.isRest) {
          // ── 휴식층 타일 ──
          if (t === T.WALL) {
            ctx.fillStyle='#1a1208'; ctx.fillRect(sx,sy,TS,TS);
            ctx.fillStyle='#120d05'; ctx.fillRect(sx+3,sy+3,TS-6,TS-6);
          } else {
            ctx.fillStyle='#1e1710'; ctx.fillRect(sx,sy,TS,TS);
            ctx.strokeStyle='#2a1f10'; ctx.lineWidth=0.5;
            ctx.strokeRect(sx+0.5,sy+0.5,TS-1,TS-1);
            if (t === T.PORTAL) {
              const pulse = 0.6 + Math.sin(frameCount * 0.07) * 0.4;
              ctx.fillStyle = `rgba(100,80,220,${pulse * 0.45})`;
              ctx.fillRect(sx, sy, TS, TS);
              ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.globalAlpha = 0.7 + Math.sin(frameCount * 0.07) * 0.3;
              ctx.fillText('🌀', sx + TS/2, sy + TS/2 + 1);
              ctx.globalAlpha = 1;
            }
          }
        } else {
          // ── 일반 던전 타일 ──
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

      // 원거리: 공격 라인 전체 하이라이트
      if (e.rangedAtk) {
        const sdx = Math.sign(e.atkTgx - e.gx), sdy = Math.sign(e.atkTgy - e.gy);
        let lx = e.gx + sdx, ly = e.gy + sdy;
        while (inBounds(lx, ly)) {
          const px = lx*TS-camX, py = ly*TS-camY;
          ctx.fillStyle = `rgba(255,140,0,${0.10+pct*0.20})`;
          ctx.fillRect(px, py, TS, TS);
          if (lx === e.atkTgx && ly === e.atkTgy) break;
          lx += sdx; ly += sdy;
        }
      }

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

    // ── 휴식층 모닥불 + 포털 안내 ───────────────────────────
    if (dungeon.isRest) {
      const cx = Math.floor(DW / 2) * TS - camX;
      const cy = Math.floor(DH / 2) * TS - camY;
      // 모닥불 (방 중앙)
      ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fireAlpha = 0.8 + Math.sin(frameCount * 0.12) * 0.2;
      ctx.globalAlpha = fireAlpha;
      ctx.fillText('🔥', cx + TS / 2, cy + TS / 2);
      ctx.globalAlpha = 1;
      // 포털 위 안내 텍스트
      const portalSx = Math.floor(DW / 2) * TS - camX;
      const portalSy = (Math.floor((DH - 14) / 2) + 1) * TS - camY;
      ctx.fillStyle = 'rgba(180,160,255,0.85)';
      ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`B${floor + 1}F →`, portalSx + TS / 2, portalSy - 2);
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

    $floorLbl.textContent = isRestFloor ? '⛺ 휴식' : `B${floor}F`;

    // 스태미나 바
    const staPct = player.stamina / STA_MAX * 100;
    $staBar.style.width = staPct + '%';
    $staBar.style.background = staPct > 50 ? '#ffca28' : staPct > 25 ? '#ff9800' : '#f44336';
    $staText.textContent = Math.floor(player.stamina);

    // 아이템 슬롯 — 장비(개별) + 소모품(묶음)
    $itemSlots.innerHTML = '';

    for (const it of player.inventory) {
      if (it.type !== 'equip') continue;
      const btn = document.createElement('button');
      btn.className = 'item-btn' + (it.active ? ' equip-active' : ' equip-inactive');
      btn.title = `${it.equip.name} — 탭하여 장착\n내구: ${it.curDur}/${it.maxDur}`;
      const pa = it.equip.pixelArt || it.equip.pixel_art;
      if (pa?.imageDataUrl) {
        btn.innerHTML = `<img src="${pa.imageDataUrl}" style="width:34px;height:34px;image-rendering:pixelated">`;
      } else {
        btn.textContent = it.equip.itemEmoji || '⚔️';
      }
      btn.addEventListener('click', () => { if (!it.active) { equipWeapon(it); hudDirty = true; } });
      btn.addEventListener('touchstart', (ev) => { ev.preventDefault(); if (!it.active) { equipWeapon(it); hudDirty = true; } }, { passive:false });
      $itemSlots.appendChild(btn);
    }

    const grouped = {};
    for (const it of player.inventory) {
      if (it.type === 'equip') continue;
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

    // 플레이어 픽셀 보간 — dt 기반
    const pk = 1 - Math.pow(0.82, dt / 16.67);
    player.px += (player.gx*TS - player.px) * pk;
    player.py += (player.gy*TS - player.py) * pk;

    // 스태미나 자연 회복
    player.stamina = Math.min(STA_MAX, player.stamina + STA_REGEN * (dt / 1000));
    if (hudDirty || true) hudDirty = true; // 스태미나는 매프레임 갱신

    updateEnemies();
    updateEffects(dt);
    updateFog();
    updateCamera();
    lerpCamera(dt);
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
      resizeCanvas();
      updateCamera();
      if (!animId) {
        lastFrameAt = 0; frameCount = 0;
        animId = requestAnimationFrame(loop);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 세이브 / 로드  (서버 DB 우선, 비로그인 시 localStorage 폴백)
  // ══════════════════════════════════════════════════════════════
  const SAVE_KEY = 'dungeon7_save';

  function buildSaveData() {
    if (!dungeon) return null;
    return {
      floor,
      isRestFloor: !!isRestFloor,
      player: {
        gx: player.gx, gy: player.gy,
        hp: player.hp, maxHp: player.maxHp,
        baseAtk: player.baseAtk, baseDef: player.baseDef,
        moveDelay: player.moveDelay,
        durability: player.durability, durabilityMax: player.durabilityMax,
        durBroken: player.durBroken, shieldActive: player.shieldActive,
        powerBonus: player.powerBonus,
        xp: player.xp, kills: player.kills,
        stamina: player.stamina,
        inventory: player.inventory,
        equipment: player.equipment,
        equippedSlots: player.equippedSlots || {},
        moduleDurabilities: player.moduleDurabilities || {},
        moduleDecayMul: player.moduleDecayMul || 1.0,
      },
      dungeon: {
        grid: dungeon.grid,
        rooms: dungeon.rooms,
        enemies: dungeon.enemies.map(e => ({
          defId: e.def.id,
          gx: e.gx, gy: e.gy,
          hp: e.hp, maxHp: e.maxHp,
          atk: e.atk, def_: e.def_,
          state: (e.state === 'telegraph' || e.state === 'attack') ? 'patrol' : e.state,
          dead: e.dead,
          id: e.id,
        })),
        items: dungeon.items,
        revealed: dungeon.revealed.map(row => Array.from(row)),
      },
    };
  }

  function applyLoadData(d) {
    floor = d.floor;
    Object.assign(player, d.player);
    player.px = player.gx * TS;
    player.py = player.gy * TS;
    player.lastMoveAt = 0;

    const dd = d.dungeon;
    dungeon = {
      grid: dd.grid,
      rooms: dd.rooms,
      enemies: dd.enemies.map(e => {
        const def = EDEFS.find(ed => ed.id === e.defId) || EDEFS[0];
        return {
          def, gx: e.gx, gy: e.gy,
          px: e.gx * TS, py: e.gy * TS,
          hp: e.hp, maxHp: e.maxHp,
          atk: e.atk, def_: e.def_,
          state: e.state,
          nextMoveAt: performance.now() + Math.random() * 1200,
          telegraphStart: 0,
          atkTgx: 0, atkTgy: 0,
          stunnedUntil: 0,
          dead: e.dead,
          id: e.id,
        };
      }),
      items: dd.items.map(item => ({ ...item, def: IDEF[item.type] })),
      revealed: dd.revealed.map(row => {
        const arr = new Uint8Array(DW);
        row.forEach((v, i) => { arr[i] = v; });
        return arr;
      }),
      isRest: !!d.isRestFloor,
    };
    isRestFloor = !!d.isRestFloor;

    effects = [];
    hudDirty = true;
    // 구버전 저장(raw eq) → 신버전(wrapper) 마이그레이션
    player.equippedSlots = {};
    for (const [slotId, val] of Object.entries(d.player.equippedSlots || {})) {
      if (!val) continue;
      if (val.equip) {
        player.equippedSlots[slotId] = val; // 이미 래퍼 형식
      } else {
        const maxDur = Math.max(15, val.stats?.durabilityMax || 30);
        player.equippedSlots[slotId] = { equip: val, curDur: maxDur, maxDur };
      }
    }
    // 모듈 내구도 복원
    player.moduleDurabilities = d.player.moduleDurabilities || {};
    player.moduleDecayMul = d.player.moduleDecayMul || 1.0;
    // 저장에 없던 모듈은 현재 DB 값으로 초기화
    for (const mods of Object.values(modulesByEquip)) {
      for (const mod of mods) {
        if (player.moduleDurabilities[mod.id] == null) {
          player.moduleDurabilities[mod.id] = mod.durability;
        }
      }
    }

    $equipNameHud.textContent = player.equipment ? (player.equipment.name || '장비') : '맨손';
    updateArmorHud();
  }

  async function saveGame() {
    const data = buildSaveData();
    if (!data) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch(_) {}
    if (alpToken && platformApi) {
      try {
        await fetch(`${platformApi}/api/dungeon/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alpToken}` },
          body: JSON.stringify({ data }),
          keepalive: true,
        });
      } catch(_) {}
    }
  }

  // 페이지 종료/백그라운드 전환 시 keepalive fetch로 저장
  async function fetchSave() {
    if (alpToken && platformApi) {
      try {
        const res = await fetch(`${platformApi}/api/dungeon/save`, {
          headers: { Authorization: `Bearer ${alpToken}` },
        });
        if (res.ok) {
          const json = await res.json();
          return json.save || null;
        }
      } catch(_) {}
    }
    // 폴백: localStorage
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function clearSave() {
    if (alpToken && platformApi) {
      fetch(`${platformApi}/api/dungeon/save`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${alpToken}` },
      }).catch(() => {});
    }
    localStorage.removeItem(SAVE_KEY);
  }

  // ══════════════════════════════════════════════════════════════
  // 게임 시작
  // ══════════════════════════════════════════════════════════════
  function startGame(equipList, slotEquips) {
    if (animId) { cancelAnimationFrame(animId); animId=null; }
    clearSave();
    floor = 1; isRestFloor = false; effects = [];

    // 기본 스탯 초기화
    player.equipment     = null;
    player.equippedSlots = {};
    player.baseAtk       = 5;
    player.baseDef       = 0;
    player.moveDelay     = MOVE_BASE_MS;
    player.durability    = 0; player.durabilityMax = 0;
    player.durBroken     = false;
    player.shieldActive  = false;
    player.powerBonus    = 0;
    player.inventory     = [];
    player.xp=0; player.kills=0;
    player.stamina = STA_MAX;
    player.lastMoveAt=0;
    player.moduleDurabilities = {};
    player.moduleDecayMul     = 1.0;
    $equipNameHud.textContent = '맨손';

    // 모듈 내구도 초기화 (현재 DB 값으로)
    for (const mods of Object.values(modulesByEquip)) {
      for (const mod of mods) {
        player.moduleDurabilities[mod.id] = mod.durability;
      }
    }

    // 선택된 방어구를 내구도 래퍼로 감싸기
    for (const [slotId, eq] of Object.entries(slotEquips || {})) {
      if (!eq) continue;
      const st = eq.stats || {};
      const maxDur = Math.max(15, (st.durabilityMax || 30));
      const curDur = st.durability != null && Number.isFinite(Number(st.durability))
        ? Math.min(Number(st.durability), maxDur)
        : maxDur;
      player.equippedSlots[slotId] = { equip: eq, curDur, maxDur };
    }

    // 장비 슬롯 스탯 합산 적용
    let armorSpd = 0, totalHp = 0;
    for (const wrapper of Object.values(player.equippedSlots)) {
      if (!wrapper) continue;
      const s = wrapper.equip.stats || {};
      const eid = wrapper.equip?.id;
      player.baseAtk += (s.attackBonus  || 0);
      player.baseDef += (s.defenseBonus || 0);
      armorSpd       += (s.speedBonus   || 0);
      totalHp        += (s.hpBonus      || 0);
      // 방어구 슬롯 모듈 스탯
      if (eid) {
        const ms = sumModuleStatsForEquip(eid);
        player.baseAtk += ms.atk; player.baseDef += ms.def;
        armorSpd += ms.spd; totalHp += ms.hp;
      }
    }
    updateArmorHud();

    // 무기 인벤토리에 추가
    const eqArr = Array.isArray(equipList) ? equipList : (equipList ? [equipList] : []);
    for (const eq of eqArr) {
      const s = eq.stats || {};
      const maxDur = s.durabilityMax || 100;
      const curDur = s.durability != null && Number.isFinite(Number(s.durability))
        ? Math.min(Number(s.durability), maxDur)
        : maxDur;
      player.inventory.push({ type:'equip', equip:eq, curDur, maxDur, active:false });
    }
    // 첫 번째 무기 자동 장착
    const firstEquip = player.inventory.find(it => it.type === 'equip');
    if (firstEquip) {
      firstEquip.active = true;
      player.equipment = firstEquip.equip;
      const s = firstEquip.equip.stats || {};
      const wid = firstEquip.equip?.id;
      const wms = wid ? sumModuleStatsForEquip(wid) : { atk:0, def:0, spd:0, hp:0 };
      player.baseAtk      += (s.attackBonus  || 0) + wms.atk;
      player.baseDef      += (s.defenseBonus || 0) + wms.def;
      player.moveDelay     = Math.round(MOVE_BASE_MS * (1 - Math.min(0.5, armorSpd + (s.speedBonus || 0) + wms.spd)));
      player.durabilityMax = firstEquip.maxDur;
      player.durability    = firstEquip.curDur;
      totalHp += wms.hp;
      $equipNameHud.textContent = firstEquip.equip.name || '장비';
    }

    player.maxHp = 100 + player.baseDef * 5 + totalHp;
    player.hp    = player.maxHp;

    dungeon = generateDungeon(1);
    updateFog();
    camX = camTX = 0; camY = camTY = 0; updateCamera(); camX = camTX; camY = camTY;
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
      const [eqRes, modRes] = await Promise.all([
        fetch(`${platformApi}/api/craft/equipment?limit=40`, {
          headers: { Authorization:`Bearer ${alpToken}` },
        }),
        fetch(`${platformApi}/api/modules`, {
          headers: { Authorization:`Bearer ${alpToken}` },
        }).catch(() => null),
      ]);
      if (!eqRes.ok) throw new Error(eqRes.status);
      const data = await eqRes.json();
      const list = (data.equipment || []).filter(e => e && e.stats);

      // Build modulesByEquip map
      modulesByEquip = {};
      if (modRes && modRes.ok) {
        const modData = await modRes.json();
        for (const mod of (modData.modules || [])) {
          if (!mod.equippedTo) continue;
          const key = String(mod.equippedTo);
          if (!modulesByEquip[key]) modulesByEquip[key] = [];
          modulesByEquip[key].push(mod);
        }
      }

      renderEquipList(list);
      const total = list.length;
      $equipStatus.textContent = total
        ? `장비 ${total}개 · 무기와 방어구를 선택하세요`
        : '장비가 없습니다. 대장간에서 만들어 오세요!';
    } catch {
      $equipStatus.textContent = '장비 불러오기 실패 — 맨손으로 입장합니다.';
    }
  }

  let selectedEquips = []; // 선택된 무기 목록 (복수)
  let selectedSlots  = {}; // { head: eq|null, chest: eq|null, ... }

  function makeEquipCard(eq) {
    const s   = eq.stats || {};
    const slotId  = s.equipSlot || 'weapon';
    const slotDef = SLOT_DEFS.find(d => d.id === slotId) || SLOT_DEFS[0];
    const card = document.createElement('div');
    card.className = 'equip-card';
    card.setAttribute('role','button'); card.tabIndex=0;

    const thumb = document.createElement('div');
    thumb.className='equip-thumb';
    const pa = eq.pixelArt || eq.pixel_art;
    if (pa && pa.imageDataUrl) {
      const img=document.createElement('img');
      img.src=pa.imageDataUrl; img.width=52; img.height=52;
      thumb.appendChild(img);
    } else {
      thumb.textContent = eq.itemEmoji || slotDef.emoji;
    }

    const info = document.createElement('div');
    info.className = 'equip-info';
    const tier = String(eq.tier||'common').toLowerCase();
    const rarityClass = {legendary:'rarity-legendary',epic:'rarity-epic',rare:'rarity-rare'}[tier]||'rarity-common';
    const parts = [];
    if (s.attackBonus  > 0) parts.push(`공격 <span>+${s.attackBonus}</span>`);
    if (s.defenseBonus > 0) parts.push(`방어 <span>+${s.defenseBonus}</span>`);
    if (s.speedBonus   > 0) parts.push(`속도 <span>+${((s.speedBonus||0)*100).toFixed(0)}%</span>`);
    if (s.hpBonus      > 0) parts.push(`HP <span>+${s.hpBonus}</span>`);
    if ((s.durabilityMax||0) > 0) parts.push(`내구 <span>${s.durabilityMax}</span>`);
    info.innerHTML = `
      <div class="equip-card-name ${rarityClass}">${escHtml(eq.name||'장비')} <span style="opacity:0.5;font-size:0.85em">${slotDef.emoji}</span></div>
      <div class="equip-card-stats">${parts.join(' · ')||'-'}</div>`;

    const check = document.createElement('span');
    check.className = 'equip-check';
    check.textContent = '✓';

    card.appendChild(thumb); card.appendChild(info); card.appendChild(check);
    return card;
  }

  function renderEquipList(list) {
    $equipList.innerHTML = '';
    selectedEquips = [];
    selectedSlots  = {};
    updateEnterBtn();

    let hasAny = false;
    for (const def of SLOT_DEFS) {
      const items = list.filter(e => (e.stats?.equipSlot || 'weapon') === def.id);
      if (items.length === 0) continue;
      hasAny = true;

      const hdr = document.createElement('p');
      hdr.className = 'equip-section-hdr';
      hdr.textContent = def.weapon
        ? `${def.emoji} ${def.label} (복수 선택, 던전 중 교체)`
        : `${def.emoji} ${def.label} (1개 선택)`;
      $equipList.appendChild(hdr);

      let slotCardPairs = [];
      for (const eq of items) {
        const card = makeEquipCard(eq);
        if (def.weapon) {
          const toggle = () => {
            const idx = selectedEquips.indexOf(eq);
            if (idx === -1) { selectedEquips.push(eq); card.classList.add('equip-selected'); }
            else            { selectedEquips.splice(idx,1); card.classList.remove('equip-selected'); }
            updateEnterBtn();
          };
          card.onclick = toggle;
          card.onkeydown = ev => { if(ev.key==='Enter'||ev.key===' ') toggle(); };
        } else {
          slotCardPairs.push({ eq, card });
          const select = () => {
            if (selectedSlots[def.id] === eq) {
              selectedSlots[def.id] = null;
              card.classList.remove('equip-selected');
            } else {
              slotCardPairs.forEach(p => p.card.classList.remove('equip-selected'));
              selectedSlots[def.id] = eq;
              card.classList.add('equip-selected');
            }
            updateEnterBtn();
          };
          card.onclick = select;
          card.onkeydown = ev => { if(ev.key==='Enter'||ev.key===' ') select(); };
        }
        $equipList.appendChild(card);
      }
    }

    if (!hasAny) {
      $equipList.innerHTML = '<p style="color:var(--dim);text-align:center;padding:1rem">장비가 없습니다. 대장간에서 만들어 오세요!</p>';
    }
  }

  function updateEnterBtn() {
    const $btn = document.getElementById('btn-enter');
    if (!$btn) return;
    const slotCount = Object.values(selectedSlots).filter(Boolean).length;
    const total = selectedEquips.length + slotCount;
    if (total > 0) {
      $btn.textContent = `⚔️ 입장 (${total}개)`;
      $btn.disabled = false;
    } else {
      $btn.textContent = '⚔️ 입장';
      $btn.disabled = true;
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

    // 이어하기 버튼: 서버(또는 localStorage)에 세이브가 있으면 표시
    fetchSave().then(saved => {
      if (saved) $btnContinue.classList.remove('hidden');
    });
    $btnContinue.addEventListener('click', async () => {
      const saved = await fetchSave();
      if (!saved) return;
      try {
        applyLoadData(saved);
        updateFog();
        updateCamera(); camX = camTX; camY = camTY;
        setGameState('playing');
      } catch(err) {
        console.error('세이브 로드 실패', err);
        clearSave();
        $btnContinue.classList.add('hidden');
      }
    });
    document.getElementById('btn-enter').addEventListener('click', () => startGame(selectedEquips, selectedSlots));
    $btnBare.addEventListener('click', ()=>startGame(null, {}));
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
    const tileDisplay = TS * ZOOM;
    VW = Math.min(DW, Math.max(5, Math.floor(maxW / tileDisplay)));
    VH = Math.min(DH, Math.max(5, Math.floor(maxH / tileDisplay)));
    CW = VW * TS;
    CH = VH * TS;
    canvas.width  = CW;
    canvas.height = CH;
    // 타일이 정사각형을 유지하도록 CSS 크기 = 타일수 × 표시 크기
    canvas.style.width  = (VW * tileDisplay) + 'px';
    canvas.style.height = (VH * tileDisplay) + 'px';
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
    $btnContinue  = document.getElementById('btn-continue');
    $hpBar        = document.getElementById('hp-bar');
    $hpText       = document.getElementById('hp-text');
    $durBar       = document.getElementById('dur-bar');
    $durText      = document.getElementById('dur-text');
    $staBar       = document.getElementById('sta-bar');
    $staText      = document.getElementById('sta-text');
    $floorLbl     = document.getElementById('floor-lbl');
    $equipNameHud = document.getElementById('equip-name-hud');
    $armorNameHud = document.getElementById('armor-name-hud');
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

  async function loadGameData() {
    const base = new URL('.', window.location.href).href;
    const [enRes, itRes] = await Promise.all([
      fetch(base + 'enemies.json'),
      fetch(base + 'items.json'),
    ]);
    const enData = await enRes.json();
    const itData = await itRes.json();
    EDEFS = enData.enemies;
    IDEF  = itData.items;
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadGameData().then(init);
  });
})();
