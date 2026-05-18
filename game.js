(function () {
  'use strict';

  /* ── 캐릭터 위젯 — React 컴포넌트와 동일 기능 (드래그 바, 리사이즈 핸들, localStorage 저장) ── */
  function mountCharacterWidget(userId, { app = 'platform', bottomOffset = 0, storageKey = 'charwidget' } = {}) {
    if (document.getElementById('assistant-widget')) return;
    const IFRAME_SRC = 'https://assistant-chi-two.vercel.app';
    const NATURAL_W = 220, NATURAL_H = 390, ASPECT = NATURAL_H / NATURAL_W;
    const DESKTOP_W = 220, MOBILE_W = 140, MIN_W = 80, MAX_W = 360;
    const isMobile = () => window.innerWidth < 640;
    const load = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); if (v != null) return v; } catch (e) {} return f; };
    const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const defaultSize = { w: isMobile() ? MOBILE_W : DESKTOP_W, h: Math.round((isMobile() ? MOBILE_W : DESKTOP_W) * ASPECT) };
    const state = {
      pos:  load(storageKey + '_pos',  { x: -1, y: -1 }),
      size: load(storageKey + '_size', defaultSize),
      blocked: false,
    };

    const TOOLBAR_H = 32;

    const wrapper = document.createElement('div');
    wrapper.id = 'assistant-widget';
    const pos0 = state.pos.x >= 0 ? `left:${state.pos.x}px;top:${state.pos.y}px;` : `right:0;bottom:${bottomOffset}px;`;
    wrapper.style.cssText = `position:fixed;${pos0}width:${state.size.w}px;height:${state.size.h}px;z-index:9999;background:transparent;`;

    const iframe = document.createElement('iframe');
    iframe.src = `${IFRAME_SRC}?userId=${encodeURIComponent(userId)}&app=${encodeURIComponent(app)}`;
    iframe.setAttribute('allow', 'autoplay');
    function applyIframeStyle() {
      const scale = state.size.w / NATURAL_W;
      iframe.style.cssText = `width:${NATURAL_W}px;height:${NATURAL_H}px;border:none;background:transparent;pointer-events:${state.blocked ? 'none' : 'auto'};transform:scale(${scale});transform-origin:bottom right;position:absolute;bottom:0;right:0;will-change:transform;`;
    }
    applyIframeStyle();
    wrapper.appendChild(iframe);

    const blocker = document.createElement('div');
    blocker.style.cssText = 'position:absolute;inset:0;z-index:2;display:none;';
    wrapper.appendChild(blocker);

    // 툴바 — 캐릭터 위에 오버레이
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `position:absolute;top:0;left:0;right:0;height:${TOOLBAR_H}px;display:flex;align-items:center;background:rgba(30,30,40,0.85);border-radius:8px 8px 0 0;box-shadow:0 -1px 0 rgba(255,255,255,0.15) inset;z-index:3;`;

    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = `width:32px;height:${TOOLBAR_H}px;cursor:nwse-resize;display:flex;align-items:center;justify-content:center;`;
    const resizeInner = document.createElement('div');
    resizeInner.style.cssText = 'width:12px;height:12px;border-top:2.5px solid #fff;border-left:2.5px solid #fff;border-radius:2px 0 0 0;';
    resizeHandle.appendChild(resizeInner);
    toolbar.appendChild(resizeHandle);

    const dragBar = document.createElement('div');
    dragBar.style.cssText = `flex:1;height:${TOOLBAR_H}px;cursor:grab;display:flex;align-items:center;justify-content:center;`;
    const dragInner1 = document.createElement('div');
    dragInner1.style.cssText = 'width:40px;height:4px;border-radius:2px;background:rgba(255,255,255,0.6);';
    const dragInner2 = document.createElement('div');
    dragInner2.style.cssText = 'width:40px;height:4px;border-radius:2px;background:rgba(255,255,255,0.6);margin-left:4px;';
    dragBar.appendChild(dragInner1); dragBar.appendChild(dragInner2);
    toolbar.appendChild(dragBar);

    wrapper.appendChild(toolbar);
    document.body.appendChild(wrapper);

    function setBlocked(b) { state.blocked = b; blocker.style.display = b ? 'block' : 'none'; applyIframeStyle(); }
    function switchToLeftTop() {
      if (state.pos.x >= 0) return;
      const r = wrapper.getBoundingClientRect();
      state.pos = { x: r.left, y: r.top };
      wrapper.style.right = ''; wrapper.style.bottom = '';
      wrapper.style.left = r.left + 'px'; wrapper.style.top = r.top + 'px';
    }
    function startDrag(e) {
      e.preventDefault(); e.stopPropagation();
      switchToLeftTop();
      const sMx = e.touches ? e.touches[0].clientX : e.clientX;
      const sMy = e.touches ? e.touches[0].clientY : e.clientY;
      const sX = state.pos.x, sY = state.pos.y;
      setBlocked(true);
      function onMove(ev) {
        if (ev.cancelable) ev.preventDefault();
        const t = ev.touches ? ev.touches[0] : ev;
        const nx = Math.max(0, Math.min(window.innerWidth  - state.size.w, sX + t.clientX - sMx));
        const ny = Math.max(0, Math.min(window.innerHeight - state.size.h, sY + t.clientY - sMy));
        state.pos = { x: nx, y: ny };
        wrapper.style.left = nx + 'px'; wrapper.style.top = ny + 'px';
      }
      function onUp() {
        setBlocked(false); save(storageKey + '_pos', state.pos);
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp);
      }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('touchend', onUp);
    }
    function startResize(e) {
      e.preventDefault(); e.stopPropagation();
      const sMx = e.touches ? e.touches[0].clientX : e.clientX;
      const sMy = e.touches ? e.touches[0].clientY : e.clientY;
      const sW = state.size.w;
      setBlocked(true);
      function onMove(ev) {
        if (ev.cancelable) ev.preventDefault();
        const t = ev.touches ? ev.touches[0] : ev;
        const delta = ((sMx - t.clientX) + (sMy - t.clientY)) / 2;
        const nw = Math.max(MIN_W, Math.min(MAX_W, sW + delta));
        state.size = { w: Math.round(nw), h: Math.round(nw * ASPECT) };
        wrapper.style.width = state.size.w + 'px';
        wrapper.style.height = state.size.h + 'px';
        applyIframeStyle();
      }
      function onUp() {
        setBlocked(false); save(storageKey + '_size', state.size);
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp);
      }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('touchend', onUp);
    }
    dragBar.addEventListener('mousedown', startDrag);
    dragBar.addEventListener('touchstart', startDrag, { passive: false });
    resizeHandle.addEventListener('mousedown', startResize);
    resizeHandle.addEventListener('touchstart', startResize, { passive: false });

    document.addEventListener('mousemove', (e) => {
      const p = state.pos, s = state.size;
      const elX = p.x >= 0 ? p.x : window.innerWidth  - s.w;
      const elY = p.y >= 0 ? p.y : window.innerHeight - s.h - bottomOffset;
      const scale = s.w / NATURAL_W;
      iframe.contentWindow && iframe.contentWindow.postMessage({
        type: 'assistant:mousemove',
        x: (e.clientX - elX) / scale,
        y: (e.clientY - elY) / scale,
      }, '*');
    });
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'assistant:navigate' && typeof e.data.url === 'string') {
        window.open(e.data.url, '_blank');
      }
    });
  }

  /* ── 튜토리얼 시스템 — 첫 방문 자동 오버레이 + ? 버튼으로 재시도 ── */
  function mountTutorial({ storageKey, steps, helpButtonPos = { top: 12, left: 12 } }) {
    if (document.getElementById('_tutorial-help-btn')) return;
    const seenKey = storageKey + '_seen';

    const helpBtn = document.createElement('button');
    helpBtn.id = '_tutorial-help-btn';
    helpBtn.textContent = '?';
    helpBtn.title = '튜토리얼 다시 보기';
    helpBtn.style.cssText = `position:fixed;top:${helpButtonPos.top}px;left:${helpButtonPos.left}px;width:36px;height:36px;border-radius:50%;background:rgba(30,30,40,0.85);color:#fff;border:1.5px solid rgba(255,255,255,0.4);font-size:18px;font-weight:bold;cursor:pointer;z-index:9998;box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:transform 0.15s;`;
    helpBtn.addEventListener('mouseenter', () => helpBtn.style.transform = 'scale(1.1)');
    helpBtn.addEventListener('mouseleave', () => helpBtn.style.transform = 'scale(1)');
    helpBtn.addEventListener('click', () => showTutorial());
    document.body.appendChild(helpBtn);

    function showTutorial() {
      if (document.getElementById('_tutorial-modal')) return;
      let idx = 0;

      const backdrop = document.createElement('div');
      backdrop.id = '_tutorial-modal';
      backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;';

      const card = document.createElement('div');
      card.style.cssText = 'max-width:420px;width:100%;background:#1e1e28;color:#fff;border-radius:16px;padding:24px;box-shadow:0 12px 48px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);';
      backdrop.appendChild(card);

      const emoji = document.createElement('div');
      emoji.style.cssText = 'font-size:56px;text-align:center;margin-bottom:12px;';
      card.appendChild(emoji);

      const title = document.createElement('div');
      title.style.cssText = 'font-size:20px;font-weight:bold;text-align:center;margin-bottom:8px;color:#fff;';
      card.appendChild(title);

      const body = document.createElement('div');
      body.style.cssText = 'font-size:14px;line-height:1.6;text-align:center;color:rgba(255,255,255,0.85);margin-bottom:20px;min-height:60px;';
      card.appendChild(body);

      const dots = document.createElement('div');
      dots.style.cssText = 'display:flex;justify-content:center;gap:6px;margin-bottom:16px;';
      card.appendChild(dots);

      const nav = document.createElement('div');
      nav.style.cssText = 'display:flex;gap:8px;';
      card.appendChild(nav);

      const prevBtn = document.createElement('button');
      prevBtn.textContent = '이전';
      prevBtn.style.cssText = 'flex:1;padding:10px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;cursor:pointer;font-size:14px;';
      nav.appendChild(prevBtn);

      const skipBtn = document.createElement('button');
      skipBtn.textContent = '건너뛰기';
      skipBtn.style.cssText = 'flex:1;padding:10px;background:transparent;color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.15);border-radius:8px;cursor:pointer;font-size:14px;';
      nav.appendChild(skipBtn);

      const nextBtn = document.createElement('button');
      nextBtn.style.cssText = 'flex:1;padding:10px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;';
      nav.appendChild(nextBtn);

      const dontShow = document.createElement('label');
      dontShow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:12px;font-size:12px;color:rgba(255,255,255,0.5);cursor:pointer;justify-content:center;';
      dontShow.innerHTML = '<input type="checkbox" id="_tutorial-dontshow" style="cursor:pointer;"> 다시 보지 않기';
      card.appendChild(dontShow);

      function render() {
        const s = steps[idx];
        emoji.textContent = s.emoji || '✨';
        title.textContent = s.title || '';
        body.innerHTML = s.body || '';
        prevBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
        nextBtn.textContent = idx === steps.length - 1 ? '시작!' : '다음';
        dots.innerHTML = '';
        steps.forEach((_, i) => {
          const d = document.createElement('div');
          d.style.cssText = `width:6px;height:6px;border-radius:50%;background:${i === idx ? '#3b82f6' : 'rgba(255,255,255,0.3)'};`;
          dots.appendChild(d);
        });
      }
      render();

      function close() {
        const cb = card.querySelector('#_tutorial-dontshow');
        if (cb && cb.checked) localStorage.setItem(seenKey, '1');
        backdrop.remove();
      }
      prevBtn.addEventListener('click', () => { if (idx > 0) { idx--; render(); } });
      nextBtn.addEventListener('click', () => {
        if (idx < steps.length - 1) { idx++; render(); }
        else { localStorage.setItem(seenKey, '1'); backdrop.remove(); }
      });
      skipBtn.addEventListener('click', close);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

      document.body.appendChild(backdrop);
    }

    if (!localStorage.getItem(seenKey)) {
      setTimeout(showTutorial, 800);
    }
  }

  // ── 사운드 시스템 (Web Audio API 절차적 생성) ──────────────────
  const _ac = (() => { try { return new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } })();
  let _soundEnabled = true;
  let _bgmVol = 0.5;  // BGM 볼륨 (0~1)
  let _sfxVol = 0.7;  // 효과음 볼륨 (0~1)

  function _resume() { if (_ac && _ac.state === 'suspended') _ac.resume(); }

  /** 짧은 효과음: 오실레이터 기반 (isBgm=true면 BGM 볼륨 배율 적용) */
  function _sfx({ type = 'square', freq = 440, freq2, duration = 0.15, volume = 0.3, decay = 0.1, delay = 0, isBgm = false }) {
    if (!_ac || !_soundEnabled) return;
    _resume();
    const mul = isBgm ? _bgmVol : _sfxVol;
    const t = _ac.currentTime + delay;
    const osc = _ac.createOscillator();
    const gain = _ac.createGain();
    osc.connect(gain); gain.connect(_ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freq2 != null) osc.frequency.linearRampToValueAtTime(freq2, t + duration);
    gain.gain.setValueAtTime(volume * mul, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration + decay);
    osc.start(t); osc.stop(t + duration + decay + 0.01);
  }

  /** 노이즈 버스트 (충격음 등) */
  function _noise({ duration = 0.1, volume = 0.2, freq = 800, q = 1 }) {
    if (!_ac || !_soundEnabled) return;
    _resume();
    const buf = _ac.createBuffer(1, Math.ceil(_ac.sampleRate * duration), _ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = _ac.createBufferSource();
    src.buffer = buf;
    const filter = _ac.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = q;
    const gain = _ac.createGain();
    gain.gain.setValueAtTime(volume * _sfxVol, _ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _ac.currentTime + duration);
    src.connect(filter); filter.connect(gain); gain.connect(_ac.destination);
    src.start(); src.stop(_ac.currentTime + duration + 0.01);
  }

  // ── 효과음 정의 ──────────────────────────────────────────────
  const SFX = {
    attack()   { _sfx({ type: 'sawtooth', freq: 220, freq2: 110, duration: 0.08, volume: 0.35, decay: 0.05 }); },
    hit()      { _noise({ duration: 0.12, volume: 0.4, freq: 400, q: 2 }); _sfx({ type: 'square', freq: 150, freq2: 80, duration: 0.1, volume: 0.2, decay: 0.05 }); },
    playerHit(){ _noise({ duration: 0.15, volume: 0.5, freq: 300, q: 1.5 }); _sfx({ type: 'sawtooth', freq: 120, freq2: 60, duration: 0.15, volume: 0.3, decay: 0.1 }); },
    shield()   { _sfx({ type: 'sine', freq: 600, freq2: 900, duration: 0.1, volume: 0.3, decay: 0.1 }); _sfx({ type: 'sine', freq: 900, freq2: 600, duration: 0.1, volume: 0.2, decay: 0.1, delay: 0.05 }); },
    kill()     { _sfx({ type: 'square', freq: 330, freq2: 220, duration: 0.1, volume: 0.3, decay: 0.05 }); _sfx({ type: 'sine', freq: 440, freq2: 660, duration: 0.15, volume: 0.25, decay: 0.1, delay: 0.08 }); },
    levelUp()  { [0,0.1,0.2,0.3].forEach((d,i)=>_sfx({ type:'sine', freq:[330,440,550,660][i], duration:0.12, volume:0.3, decay:0.08, delay:d })); },
    pickup()   { _sfx({ type: 'sine', freq: 660, freq2: 880, duration: 0.08, volume: 0.25, decay: 0.05 }); },
    stairs()   { [0,0.12,0.24].forEach((d,i)=>_sfx({ type:'sine', freq:[440,550,660][i], duration:0.1, volume:0.3, decay:0.08, delay:d })); },
    rest()     { _sfx({ type: 'sine', freq: 528, freq2: 660, duration: 0.3, volume: 0.2, decay: 0.2 }); },
    death()    { [0,0.2,0.5].forEach((d,i)=>_sfx({ type:'sawtooth', freq:[220,180,120][i], duration:0.25, volume:0.35, decay:0.15, delay:d })); },
    stamina()  { _sfx({ type: 'square', freq: 180, freq2: 160, duration: 0.08, volume: 0.2, decay: 0.05 }); },
    counter()  { _sfx({ type: 'sawtooth', freq: 440, freq2: 660, duration: 0.12, volume: 0.4, decay: 0.05 }); _noise({ duration: 0.08, volume: 0.3, freq: 600 }); },
    run()      { _sfx({ type: 'sine', freq: 700, freq2: 900, duration: 0.06, volume: 0.22, decay: 0.04 }); },
  };

  // ── BGM (던전 분위기 루프) ────────────────────────────────────
  let _bgmActive  = false;
  let _bgmStep    = 0;
  let _bgmTimer   = null;
  let _bgmHpRatio = 1.0; // 0~1, hitPlayer/updateHud에서 갱신

  // ── 일반 BGM (HP > 50%) ─────────────────────────────────────
  const BGM_NORMAL = {
    tempo: 0.45,
    pattern: [
      { freq: 110, dur: 0.35, vol: 0.22, type: 'sine' },
      { freq: 147, dur: 0.15, vol: 0.16, type: 'sine' },
      { freq: 110, dur: 0.35, vol: 0.20, type: 'sine' },
      { freq: 131, dur: 0.15, vol: 0.16, type: 'sine' },
      { freq:  98, dur: 0.35, vol: 0.22, type: 'sine' },
      { freq: 131, dur: 0.15, vol: 0.16, type: 'sine' },
      { freq:  98, dur: 0.35, vol: 0.20, type: 'sine' },
      { freq: 110, dur: 0.15, vol: 0.16, type: 'sine' },
    ],
    droneFreq: 55, droneVol: 0.15,
  };

  // ── 위험 BGM (HP 25~50%): 더 빠르고 긴장감 있는 패턴 ────────
  const BGM_DANGER = {
    tempo: 0.30,
    pattern: [
      { freq: 147, dur: 0.22, vol: 0.26, type: 'sawtooth' },
      { freq: 110, dur: 0.12, vol: 0.18, type: 'sawtooth' },
      { freq: 155, dur: 0.22, vol: 0.24, type: 'sawtooth' },
      { freq: 110, dur: 0.12, vol: 0.18, type: 'sawtooth' },
      { freq: 131, dur: 0.22, vol: 0.26, type: 'sawtooth' },
      { freq:  98, dur: 0.12, vol: 0.20, type: 'sawtooth' },
      { freq: 147, dur: 0.22, vol: 0.24, type: 'sawtooth' },
      { freq: 123, dur: 0.12, vol: 0.18, type: 'sawtooth' },
    ],
    droneFreq: 65, droneVol: 0.20,
  };

  // ── 위기 BGM (HP < 25%): 매우 빠르고 불안한 패턴 ────────────
  const BGM_CRITICAL = {
    tempo: 0.18,
    pattern: [
      { freq: 185, dur: 0.14, vol: 0.30, type: 'square' },
      { freq: 110, dur: 0.08, vol: 0.22, type: 'square' },
      { freq: 196, dur: 0.14, vol: 0.28, type: 'square' },
      { freq:  98, dur: 0.08, vol: 0.22, type: 'square' },
      { freq: 220, dur: 0.14, vol: 0.30, type: 'square' },
      { freq: 110, dur: 0.08, vol: 0.20, type: 'square' },
      { freq: 185, dur: 0.14, vol: 0.28, type: 'square' },
      { freq: 131, dur: 0.08, vol: 0.22, type: 'square' },
    ],
    droneFreq: 80, droneVol: 0.25,
  };

  function _getBgmConfig() {
    if (_bgmHpRatio <= 0.25) return BGM_CRITICAL;
    if (_bgmHpRatio <= 0.50) return BGM_DANGER;
    return BGM_NORMAL;
  }

  function _bgmTick() {
    if (!_ac || !_soundEnabled || !_bgmActive) return;
    const cfg  = _getBgmConfig();
    const note = cfg.pattern[_bgmStep % cfg.pattern.length];
    _sfx({ type: note.type, freq: note.freq, duration: note.dur, volume: note.vol, decay: 0.15, isBgm: true });
    // 드론 (매 4박마다)
    if (_bgmStep % 4 === 0) {
      _sfx({ type: 'sine', freq: cfg.droneFreq, duration: cfg.tempo * 4, volume: cfg.droneVol, decay: 0.3, isBgm: true });
    }
    _bgmStep++;
    _bgmTimer = setTimeout(_bgmTick, cfg.tempo * 1000);
  }

  function startBGM() {
    if (_bgmActive) return;
    _bgmActive = true;
    _bgmHpRatio = 1.0;
    _resume();
    _bgmStep = 0;
    _bgmTick();
  }

  function stopBGM() {
    _bgmActive = false;
    if (_bgmTimer) { clearTimeout(_bgmTimer); _bgmTimer = null; }
  }

  // 사운드 볼륨 UI (우측 상단 토글 패널)
  function _initSoundUI() {
    // 토글 버튼
    const btn = document.createElement('button');
    btn.id = 'sound-toggle-btn';
    btn.textContent = '🔊';
    btn.style.cssText = 'position:fixed;top:8px;right:8px;z-index:10000;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:16px;';

    // 볼륨 패널
    const panel = document.createElement('div');
    panel.id = 'sound-panel';
    panel.style.cssText = [
      'position:fixed;top:40px;right:8px;z-index:10000',
      'background:rgba(0,0,0,0.82);color:#fff;border-radius:8px',
      'padding:10px 14px;display:none;flex-direction:column;gap:8px',
      'min-width:160px;font-size:13px;box-shadow:0 2px 12px rgba(0,0,0,0.5)',
    ].join(';');

    function makeRow(label, value, onChange) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;';
      const lbl = document.createElement('span');
      lbl.textContent = label;
      lbl.style.cssText = 'width:36px;flex-shrink:0;';
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = 0; slider.max = 100;
      slider.value = Math.round(value * 100);
      slider.style.cssText = 'flex:1;accent-color:#4fc3f7;cursor:pointer;';
      slider.addEventListener('input', () => onChange(slider.value / 100));
      row.appendChild(lbl); row.appendChild(slider);
      return row;
    }

    panel.appendChild(makeRow('🎵 BGM', _bgmVol, v => { _bgmVol = v; }));
    panel.appendChild(makeRow('🔔 효과음', _sfxVol, v => { _sfxVol = v; }));

    // 음소거 토글
    const muteRow = document.createElement('div');
    muteRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:2px;';
    const muteBtn = document.createElement('button');
    muteBtn.textContent = '음소거';
    muteBtn.style.cssText = 'flex:1;background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:5px;padding:4px;cursor:pointer;font-size:12px;';
    muteBtn.addEventListener('click', () => {
      _soundEnabled = !_soundEnabled;
      muteBtn.textContent = _soundEnabled ? '음소거' : '🔇 음소거 해제';
      btn.textContent = _soundEnabled ? '🔊' : '🔇';
      if (_soundEnabled) { _resume(); if (_bgmActive) { stopBGM(); startBGM(); } }
      else stopBGM();
    });
    muteRow.appendChild(muteBtn);
    panel.appendChild(muteRow);

    // 토글 클릭 시 패널 열기/닫기
    let panelOpen = false;
    btn.addEventListener('click', () => {
      panelOpen = !panelOpen;
      panel.style.display = panelOpen ? 'flex' : 'none';
    });
    // 패널 바깥 클릭 시 닫기
    document.addEventListener('click', e => {
      if (panelOpen && !panel.contains(e.target) && e.target !== btn) {
        panelOpen = false;
        panel.style.display = 'none';
      }
    });

    document.body.appendChild(btn);
    document.body.appendChild(panel);
  }
  document.addEventListener('DOMContentLoaded', _initSoundUI);

  // ── 서버 연결 ──────────────────────────────────────────────────
  const urlParams  = new URLSearchParams(window.location.search);
  const alpToken   = urlParams.get('token') || '';
  const platformApi = window.__ALP_PLATFORM_API__ || '';
  const platformWeb = urlParams.get('platformWeb') || '';

  // 닉네임 + 스킬 미리 로드
  if (alpToken && platformApi) {
    apiFetch(`${platformApi}/api/auth/me`, {
      headers: { Authorization: `Bearer ${alpToken}` },
    }).then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.user?.nickname) _playerNickname = d.user.nickname;
        // 캐릭터 위젯 삽입 (commonUserId 우선 — CommonDB 기준 ID)
        const cuid = d?.user?.commonUserId || d?.user?.id;
        if (cuid) mountCharacterWidget(cuid, { app: 'platform', storageKey: 'alp_charwidget' });
      })
      .catch(() => {});

    apiFetch(`${platformApi}/api/dungeon/skills`, {
      headers: { Authorization: `Bearer ${alpToken}` },
    }).then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        _skillPoints = d.skillPoints ?? 0;
        _skillData   = d.skillData   ?? {};
        _skillLoaded = true;
        renderSkillUI();
      })
      .catch(() => {});
  }

  // 웹으로 돌아가기 버튼
  if (platformWeb) {
    const btn = document.createElement('a');
    btn.href = platformWeb + '/games';
    btn.textContent = '← 게임 목록';
    btn.style.cssText = [
      'position:fixed;top:12px;left:12px;z-index:9999',
      'background:rgba(255,255,255,0.07);color:#aaa',
      'border:1px solid rgba(255,255,255,0.15);border-radius:20px',
      'padding:5px 12px;font-size:0.78rem;text-decoration:none',
      'backdrop-filter:blur(6px);transition:background .15s',
    ].join(';');
    btn.onmouseover = () => { btn.style.background = 'rgba(255,255,255,0.18)'; btn.style.color = '#fff'; };
    btn.onmouseout  = () => { btn.style.background = 'rgba(255,255,255,0.07)'; btn.style.color = '#aaa'; };
    document.body.appendChild(btn);
  }

  let _sessionExpiredShown = false;
  function showSessionExpiredBanner() {
    if (_sessionExpiredShown) return;
    _sessionExpiredShown = true;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0 0 auto;z-index:99999;background:#dc2626;color:#fff;' +
      'padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.4)';
    el.innerHTML = '<span>🔒 로그인이 만료됐습니다. 다시 로그인해 주세요.</span>' +
      '<a href="/ko/login" style="background:#fff;color:#dc2626;padding:4px 12px;border-radius:6px;font-weight:600;text-decoration:none">로그인</a>';
    document.body.prepend(el);
  }
  function apiFetch(url, init) {
    return fetch(url, init).then(res => {
      if (res.status === 401 && alpToken) showSessionExpiredBanner();
      return res;
    });
  }

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

  const MOVE_BASE_MS  = 220;  // 기본 이동 쿨다운 (ms)
  const TELEGRAPH_MS  = 700;  // 적 공격 예고 시간 (ms)
  const CTR_START     = 140;  // 반격 가능 시작 (ms)
  const CTR_END       = 570;  // 반격 가능 종료 (ms)
  const PERF_END      = 390;  // 완벽 반격 종료 (ms) — CTR_START~PERF_END
  const RUN_DOUBLE_MS = 320;  // 달리기 더블 입력 감지 창 (ms)
  const RUN_DURATION  = 1800; // 달리기 지속 시간 (ms)
  const RUN_DELAY_MUL = 0.50; // 달리기 시 이동 쿨다운 배율
  const STA_RUN_COST  = 3;    // 달리기 한 걸음당 스태미나 소모

  // 타일 종류
  const T = { WALL: 0, FLOOR: 1, STAIRS: 2, CHEST: 3, PORTAL: 4, ESCAPE: 5 };

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
  let _playerNickname = ''; // 서버에서 가져온 닉네임
  let _skillPoints = 0;    // 보유 스킬 포인트
  let _skillData   = {};   // { warrior:0, shield:0, swift:0, tough:0 }
  let _skillLoaded = false;

  // 스킬 정의 (서버와 동일)
  const SKILL_DEFS = {
    warrior: { name: '전사 훈련', emoji: '⚔️', desc: '공격력 +3/레벨', maxLevel: 5 },
    shield:  { name: '철벽 방어', emoji: '🛡️', desc: '방어력 +2/레벨', maxLevel: 5 },
    swift:   { name: '신속',     emoji: '💨', desc: '이동속도 +5%/레벨', maxLevel: 3 },
    tough:   { name: '강인함',   emoji: '❤️', desc: '최대 HP +25/레벨', maxLevel: 5 },
  };
  const SKILL_COST = [10, 20, 35, 50, 70];

  function skillCost(lv) { return SKILL_COST[lv] ?? 9999; }

  // 스킬 UI 렌더링
  function renderSkillUI() {
    const panel = document.getElementById('skill-panel');
    const grid  = document.getElementById('skill-grid');
    const spEl  = document.getElementById('skill-points-display');
    if (!panel || !grid || !spEl) return;

    panel.style.display = 'block';
    spEl.textContent = `${_skillPoints} SP`;
    grid.innerHTML = '';

    for (const [id, def] of Object.entries(SKILL_DEFS)) {
      const lv   = _skillData[id] || 0;
      const cost = skillCost(lv);
      const maxed = lv >= def.maxLevel;
      const canAfford = _skillPoints >= cost;

      const card = document.createElement('div');
      card.className = 'skill-card';

      // 파이프(레벨 표시)
      const pips = Array.from({ length: def.maxLevel }, (_, i) =>
        `<div class="skill-pip${i < lv ? ' filled' : ''}"></div>`
      ).join('');

      card.innerHTML = `
        <div class="skill-card-hdr">${def.emoji} ${def.name} <span style="color:var(--gold);font-size:.7rem">Lv${lv}</span></div>
        <div class="skill-pips">${pips}</div>
        <div class="skill-card-desc">${def.desc}</div>
        <button class="skill-upgrade-btn" ${maxed || !canAfford || !alpToken ? 'disabled' : ''}>
          ${maxed ? '최대' : `강화 (${cost}SP)`}
        </button>
      `;

      const btn = card.querySelector('.skill-upgrade-btn');
      if (btn && !maxed && canAfford && alpToken) {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const res = await apiFetch(`${platformApi}/api/dungeon/skills/upgrade`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alpToken}` },
              body: JSON.stringify({ skillId: id }),
            });
            if (!res.ok) return;
            const data = await res.json();
            _skillPoints = data.skillPoints;
            _skillData   = data.skillData;
            renderSkillUI();
          } catch {}
        });
      }

      grid.appendChild(card);
    }
  }

  // 스킬 보너스를 플레이어 스탯에 적용
  function applySkillBonuses() {
    const warrior = _skillData.warrior || 0;
    const shield  = _skillData.shield  || 0;
    const swift   = _skillData.swift   || 0;
    const tough   = _skillData.tough   || 0;
    player.baseAtk   += warrior * 3;
    player.baseDef   += shield  * 2;
    player.moveDelay  = Math.max(100, Math.round(player.moveDelay * (1 - swift * 0.05)));
    player.maxHp     += tough * 25;
    player.hp         = Math.min(player.hp, player.maxHp);
  }
  let _invKey = '';    // 인벤토리 변경 감지용 캐시 키
  let _guardianHinted = false; // 수문장 힌트 표시 여부
  let $tooltip = null; // PC 툴팁 엘리먼트
  let _lastDirKey = null, _lastDirAt = 0; // 더블 방향 입력 감지
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
    shieldStacks: 0,
    speedBonus: 0,
    curseActive: false,
    powerBonus: 0,
    xp: 0, kills: 0,
    stamina: STA_MAX,
    runUntil: 0,
    // Module durability tracking: moduleId → current durability
    moduleDurabilities: {},
    // Synergy-derived decay multiplier (1.0 = normal)
    moduleDecayMul: 1.0,
  };

  // ── DOM 참조 ───────────────────────────────────────────────────
  let $screenEquip, $screenGame, $screenDead;
  let $equipList, $equipStatus;
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
    const stairsGx = lastR.cx, stairsGy = lastR.cy;

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
    // 층수 기반 난이도 곡선: 초반 완만 → 이후 가파름
    const scale = 1 + (f - 1) * 0.12 + Math.pow(Math.max(0, f - 10), 1.3) * 0.02;
    const valid   = EDEFS.filter(d => !d.isBoss && f >= d.minF && f <= d.maxF);
    const enemies = [];

    for (let i = 1; i < rooms.length; i++) {
      const r = rooms[i];
      if (grid[r.cy][r.cx] === T.STAIRS) continue;

      // 층이 깊을수록 방당 몬스터 수 증가 (최대 12마리)
      const count = Math.min(12, 3 + Math.floor(Math.random()*3) + Math.floor(f/2));
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

    // 수문장 — 계단 옆에 배치, 처치해야 계단 이용 가능
    {
      const gScale = scale * 1.8; // 일반 몬스터보다 1.8배 강함
      const gDef = (EDEFS.filter(d => !d.isBoss && f >= d.minF).sort((a,b) => b.hp - a.hp)[0])
                || EDEFS[EDEFS.length - 1];
      // 계단 인접 칸 중 빈 FLOOR 선택
      const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
      let gx = stairsGx, gy = stairsGy;
      for (const [ddx, ddy] of dirs) {
        const cx = stairsGx + ddx, cy = stairsGy + ddy;
        if (grid[cy]?.[cx] === T.FLOOR && !enemies.some(e => e.gx===cx && e.gy===cy)) {
          gx = cx; gy = cy; break;
        }
      }
      const guardian = makeEnemy(gDef, gx, gy, gScale);
      guardian.isGuardian = true;
      guardian.isGuardianDead = false;
      enemies.push(guardian);
    }

    // 탈출 포탈 — 5층 단위(5, 10, 15...)에만 등장
    if (f % 5 === 0 && rooms.length >= 3) {
      const midRooms = rooms.slice(1, -1).filter(r => grid[r.cy][r.cx] === T.FLOOR);
      if (midRooms.length > 0) {
        const er = midRooms[Math.floor(Math.random() * midRooms.length)];
        let ex = er.cx, ey = er.cy, etries = 0;
        do {
          ex = er.x + 1 + Math.floor(Math.random() * Math.max(1, er.w - 2));
          ey = er.y + 1 + Math.floor(Math.random() * Math.max(1, er.h - 2));
          etries++;
        } while (etries < 20 && grid[ey][ex] !== T.FLOOR);
        if (etries < 20) grid[ey][ex] = T.ESCAPE;
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
    const isRunning = now < player.runUntil;
    const baseDelay = player.speedBonus > 0
      ? Math.max(80, Math.round(player.moveDelay * (1 - player.speedBonus)))
      : player.moveDelay;
    const effDelay = isRunning ? Math.max(70, Math.round(baseDelay * RUN_DELAY_MUL)) : baseDelay;
    if (now - player.lastMoveAt < effDelay) return;

    const nx = player.gx + dx, ny = player.gy + dy;
    if (nx < 0 || nx >= DW || ny < 0 || ny >= DH) return;

    const tile = dungeon.grid[ny][nx];
    if (tile === T.WALL) return; // 벽이면 스태미나 소모 없이 종료

    // 적이 있으면 근접 공격 (달리기 소모 없이 공격 소모만 적용)
    const enemy = dungeon.enemies.find(e => !e.dead && e.gx===nx && e.gy===ny);
    if (enemy) { bumpAttack(enemy); player.lastMoveAt = now; return; }

    // 실제 이동할 때만 달리기 스태미나 소모
    if (isRunning) {
      if (player.stamina < STA_RUN_COST) {
        player.runUntil = 0; // 스태미나 부족 → 달리기 종료
      } else {
        player.stamina -= STA_RUN_COST;
        hudDirty = true;
      }
    }

    // 이동
    player.gx = nx; player.gy = ny;
    player.lastMoveAt = now;
    hudDirty = true;

    // 아이템 습득
    const ii = dungeon.items.findIndex(it => it.gx===nx && it.gy===ny);
    if (ii !== -1) { pickupItem(dungeon.items[ii]); dungeon.items.splice(ii,1); }

    if (tile === T.ESCAPE) { enterEscape(); return; }
    if (tile === T.STAIRS) {
      const guardian = dungeon.enemies.find(e => e.isGuardian && !e.dead);
      if (guardian) {
        toast('⚠️ 수문장을 처치해야 올라갈 수 있다!');
        spawnFx(player.px+TS/2, player.py-14, '수문장 처치 필요!', '#ff9800', 1400);
        return;
      }
      enterRestFloor(); return;
    }
    if (tile === T.PORTAL) { enterCombatFloor(); return; }
    if (tile === T.CHEST)  { openChest(nx, ny); }
  }

  function bumpAttack(enemy) {
    if (player.stamina < STA_ATK_COST) {
      toast('⚡ 스태미나 부족!');
      spawnFx(player.px + TS/2, player.py - 10, '스태미나 부족', '#9e9e9e', 700);
      SFX.stamina();
      return;
    }
    player.stamina -= STA_ATK_COST;
    const dmg = Math.max(1, (player.baseAtk + player.powerBonus) - enemy.def_);
    enemy.hp -= dmg;
    SFX.attack();
    spawnFx(enemy.px + TS/2, enemy.py, `-${dmg}`, '#ff5722');
    if (enemy.hp <= 0) killEnemy(enemy);
    damageWeaponDur();
    damageOffensiveModules();
    hudDirty = true;
  }

  // 드롭 확률표: [ 확률(0~1), 아이템 타입 ]
  const DROP_TABLE = [
    [0.25, 'potion'],
    [0.10, 'repair'],
    [0.07, 'power'],
    [0.06, 'shield'],
    [0.05, 'potion_big'],
    [0.03, 'freeze'],
    [0.02, 'bomb'],
    [0.01, 'power_big'],
  ];

  function rollEnemyDrop(enemy) {
    // 수문장은 드롭 확률 2배
    const mul = enemy.isGuardian ? 2 : 1;
    for (const [chance, type] of DROP_TABLE) {
      if (Math.random() < chance * mul && IDEF[type]) return type;
    }
    return null;
  }

  function killEnemy(enemy) {
    enemy.dead = true;
    player.kills++;
    player.xp += enemy.def.xp;
    SFX.kill();
    spawnFx(enemy.px+TS/2, enemy.py-10, `+${enemy.def.xp}XP`, '#ffeb3b', 1200);

    // 아이템 드롭
    const drop = rollEnemyDrop(enemy);
    if (drop) {
      const def = IDEF[drop];
      player.inventory.push({ type: drop, def });
      spawnFx(enemy.px+TS/2, enemy.py-26, `${def.emoji} 드롭!`, '#a5d6a7', 1400);
      SFX.pickup();
    }

    hudDirty = true;
  }

  function pickupItem(item) {
    player.inventory.push({ type:item.type, def:item.def });
    toast(`${item.def.emoji} ${item.def.name} 획득!`);
    SFX.pickup();
    hudDirty = true;
  }

  function openChest(x, y) {
    dungeon.grid[y][x] = T.FLOOR;
    const CHEST_POOL = ['potion', 'potion', 'repair', 'power', 'shield',
                        'potion_big', 'repair_full', 'speed', 'freeze', 'bomb', 'power_big'];
    const t = CHEST_POOL[Math.floor(Math.random() * CHEST_POOL.length)];
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
      case 'heal_big': {
        const h = Math.round(player.maxHp * 0.55);
        player.hp = Math.min(player.maxHp, player.hp + h);
        spawnFx(player.px+TS/2, player.py, `+${h} HP`, '#4caf50');
        toast('🫙 HP 55% 회복!');
        break;
      }
      case 'heal_full': {
        const h = player.maxHp - player.hp;
        player.hp = player.maxHp;
        spawnFx(player.px+TS/2, player.py, `+${h} HP`, '#4caf50');
        toast('✨ HP 완전 회복!');
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
      case 'repair_full': {
        const rep2 = player.durabilityMax - player.durability;
        player.durability = player.durabilityMax;
        const activeEq2 = player.inventory.find(it => it.type === 'equip' && it.active);
        if (activeEq2) activeEq2.curDur = player.durability;
        if (player.durBroken && player.durability > 0) {
          player.durBroken = false;
          const ws2 = player.equipment?.stats || {};
          const a2 = calcArmorTotals();
          player.baseAtk = 5 + a2.atk + (ws2.attackBonus  || 0);
          player.baseDef = a2.def +      (ws2.defenseBonus || 0);
          toast('🔩 완전 수리! 능력치 복구');
        } else {
          toast(`🔩 내구도 완전 회복! (+${Math.max(0, rep2)})`);
        }
        spawnFx(player.px+TS/2, player.py, '완전 수리!', '#2196f3');
        break;
      }
      case 'power': {
        player.powerBonus += 8;
        toast('💠 공격력 +8 (이번 층)');
        spawnFx(player.px+TS/2, player.py, '공격력 +8!', '#7c4dff');
        break;
      }
      case 'power_big': {
        player.powerBonus += 15;
        toast('💪 공격력 +15 (이번 층)');
        spawnFx(player.px+TS/2, player.py, '공격력 +15!', '#7c4dff');
        break;
      }
      case 'shield': {
        player.shieldStacks = Math.max(player.shieldStacks, 1);
        toast('📜 다음 피해 무효 준비!');
        spawnFx(player.px+TS/2, player.py, '방어막!', '#2196f3');
        break;
      }
      case 'shield_big': {
        player.shieldStacks = Math.max(player.shieldStacks, 3);
        toast('🛡️ 다음 피해 3회 무효!');
        spawnFx(player.px+TS/2, player.py, '철벽 방어!', '#2196f3');
        break;
      }
      case 'bomb': {
        const BOMB_R = 3;
        const bombDmg = Math.round(player.baseAtk * 1.5 + 10);
        let bombed = 0;
        for (const e of dungeon.enemies) {
          if (e.dead) continue;
          if (Math.abs(e.gx - player.gx) + Math.abs(e.gy - player.gy) <= BOMB_R) {
            e.hp -= bombDmg;
            spawnFx(e.px+TS/2, e.py, `-${bombDmg}🔥`, '#ff5722');
            if (e.hp <= 0) killEnemy(e);
            bombed++;
          }
        }
        toast(`💣 폭발! ${bombed}마리 피격`);
        SFX.counter();
        break;
      }
      case 'freeze': {
        const nowF = performance.now();
        let frozen = 0;
        for (const e of dungeon.enemies) {
          if (e.dead) continue;
          e.state = 'stunned';
          e.stunnedUntil = nowF + 2000;
          spawnFx(e.px+TS/2, e.py, '❄️', '#90caf9', 1200);
          frozen++;
        }
        toast(`❄️ 빙결! ${frozen}마리 기절`);
        break;
      }
      case 'speed': {
        player.speedBonus = Math.min(0.5, player.speedBonus + 0.25);
        toast('💨 이동 속도 +25% (이번 층)');
        spawnFx(player.px+TS/2, player.py, '질풍!', '#80cbc4');
        break;
      }
      case 'curse': {
        player.curseActive = true;
        toast('📿 저주! 이번 층 적 피해 -30%');
        spawnFx(player.px+TS/2, player.py, '저주 발동!', '#ce93d8');
        break;
      }
      case 'reveal': {
        for (let ry = 0; ry < DH; ry++)
          for (let rx = 0; rx < DW; rx++)
            dungeon.revealed[ry][rx] = 1;
        toast('🗺️ 지도 전체 공개!');
        spawnFx(player.px+TS/2, player.py, '지도 공개!', '#fff176');
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
    SFX.counter();

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

    // 수문장 힌트 — 계단 3칸 이내 접근 시 1회 표시
    if (!_guardianHinted && !isRestFloor) {
      const guardian = dungeon.enemies.find(e => e.isGuardian && !e.dead);
      if (guardian) {
        const stairsTile = dungeon.grid.flatMap((row, gy) =>
          row.map((t, gx) => t === T.STAIRS ? { gx, gy } : null)).find(Boolean);
        if (stairsTile) {
          const dist = Math.abs(player.gx - stairsTile.gx) + Math.abs(player.gy - stairsTile.gy);
          if (dist <= 4) {
            toast(`👑 수문장을 처치해야 위층으로 올라갈 수 있다!`);
            _guardianHinted = true;
          }
        }
      }
    }
  }

  // 플레이어가 공격 맞음
  function hitPlayer(enemy) {
    // 방어막 있으면 무효
    if (player.shieldStacks > 0) {
      player.shieldStacks--;
      const remain = player.shieldStacks > 0 ? ` (${player.shieldStacks}회 남음)` : '';
      spawnFx(player.px+TS/2, player.py-10, '차단!' + remain, '#2196f3');
      SFX.shield();
      enemy.state='cooldown'; enemy.nextMoveAt = performance.now()+500;
      hudDirty = true;
      return;
    }

    const atkVal = player.curseActive ? Math.max(1, Math.floor(enemy.atk * 0.7)) : enemy.atk;
    const rawDmg = Math.max(1, atkVal - player.baseDef);

    // ── 부위 피격 처리 ──────────────────────────────────────
    // 모든 부위 중 랜덤 선택 (장착 여부 무관)
    const ALL_SLOTS = ['head','chest','pants','gloves','boots','accessory'];
    const hitSlot = ALL_SLOTS[Math.floor(Math.random() * ALL_SLOTS.length)];
    const armorWrapper = player.equippedSlots[hitSlot];
    const hasArmor = armorWrapper && armorWrapper.curDur > 0;

    let hpDmg = rawDmg;
    if (hasArmor) {
      // 장착 부위: 방어구 내구도가 데미지 일부 흡수 (50%)
      const absorbed = Math.floor(rawDmg * 0.5);
      hpDmg = Math.max(1, rawDmg - absorbed);
      damageArmorSlot(hitSlot);
      const def = SLOT_DEFS.find(d => d.id === hitSlot);
      spawnFx(player.px+TS/2, player.py-24, `${def?.emoji||''} 내구↓`, '#ff9800', 700);
    }

    player.hp -= hpDmg;
    SFX.playerHit();
    spawnFx(player.px+TS/2, player.py-10, `-${hpDmg}`, '#f44336');
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
        apiFetch(`${platformApi}/api/dungeon/exit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alpToken}` },
          body: JSON.stringify({ data: _deadSave, isDeath: true }),
          keepalive: true,
        }).then(r => r.ok ? r.json() : null).then(res => {
          if (!res) return;
          const el = document.getElementById('dead-stats');
          if (!el) return;
          if (res.coinsEarned > 0) el.textContent += `\n🪙 ${res.coinsEarned}코인 획득`;
          el.textContent += `\n⚠️ 착용 장비가 모두 파괴되었습니다`;
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
    apiFetch(`${platformApi}/api/dungeon/sync-durability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alpToken}` },
      body: JSON.stringify({ weapon, armor }),
      keepalive: true,
    }).catch(() => {});
  }

  function enterRestFloor() {
    player.powerBonus = 0;
    player.speedBonus = 0;
    player.curseActive = false;
    player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.25));
    isRestFloor = true;
    dungeon = generateRestFloor();
    camX = camTX = 0; camY = camTY = 0; updateCamera(); camX = camTX; camY = camTY;
    toast(`⛺ 휴식층 도착! HP 25% 회복 · 포털로 다음 층 이동`);
    SFX.rest();
    hudDirty = true;
    syncDurabilityToServer(); // 휴식층 진입 시 내구도 DB 동기화
    saveGame();
  }

  function enterEscape() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    SFX.levelUp();

    // 사망과 동일하게 내구도 동기화 + 아이템 드롭 처리
    const _escapeSave = buildSaveData();
    localStorage.removeItem(SAVE_KEY);
    if (_escapeSave && alpToken && platformApi) {
      apiFetch(`${platformApi}/api/dungeon/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alpToken}` },
        body: JSON.stringify({ data: _escapeSave, isDeath: false }),
        keepalive: true,
      }).then(r => r.ok ? r.json() : null).then(res => {
        if (!res) return;
        const el = document.getElementById('escaped-stats');
        if (!el) return;
        const NAMES = { stone_common:'일반석', stone_rare:'희귀석', crystal_magic:'마정석', shard_legend:'전설파편' };
        const dropParts = Object.entries(res.drops || {}).map(([k, v]) => `${NAMES[k]||k} ×${v}`);
        if (dropParts.length) el.textContent += `\n\n💎 획득 아이템: ${dropParts.join(', ')}`;
        if (res.coinsEarned > 0) el.textContent += `\n🪙 ${res.coinsEarned}코인 획득`;
        if (res.skillPointsGained > 0) {
          el.textContent += `\n⭐ 스킬 포인트 +${res.skillPointsGained}`;
          _skillPoints += res.skillPointsGained;
        }
      }).catch(() => {});
    }

    setGameState('escaped');
  }

  function enterCombatFloor() {
    floor++;
    isRestFloor = false;
    _guardianHinted = false;
    dungeon = generateDungeon(floor);
    updateFog();
    updateCamera();

    if (floor % 5 === 0) {
      toast(`⚠️ B${floor}F — 보스 층! 수문장이 강력합니다`);
    } else if (floor % 5 === 4) {
      toast(`🏰 B${floor}F 도착! 다음 층은 보스 층입니다`);
    } else {
      toast(`🏰 B${floor}F 도착!`);
    }
    SFX.stairs();
    hudDirty = true;

    // 일일 미션: 던전 5층 도달
    if (floor === 5 && alpToken && platformApi) {
      apiFetch(`${platformApi}/api/missions/daily/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alpToken}` },
        body: JSON.stringify({ missionId: 'dungeon_5', increment: 1 }),
        keepalive: true,
      }).catch(() => {});
    }
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
    apiFetch(`${platformApi}/api/craft/equipment/${id}`, {
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
    const prevArmorDur = wrapper.curDur;
    wrapper.curDur = Math.max(0, wrapper.curDur - 1);
    const slotDef = SLOT_DEFS.find(d => d.id === slotId);
    const label = slotDef ? slotDef.label : slotId;
    // 30% 이하 진입 시 경고 (한 번만)
    const armorMaxDur = wrapper.maxDur || wrapper.equip?.stats?.durabilityMax || 1;
    const armorWarnThresh = Math.ceil(armorMaxDur * 0.3);
    if (wrapper.curDur > 0 && wrapper.curDur <= armorWarnThresh && prevArmorDur > armorWarnThresh) {
      toast(`⚠️ ${label}가 곧 부숴질 것 같습니다!`);
      spawnFx(player.px+TS/2, player.py-18, `${label} 위험!`, '#ff9800', 1200);
    }
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
    const prevWeapDur = player.durability;
    player.durability = Math.max(0, player.durability - 1);
    const activeEq = player.inventory.find(it => it.type === 'equip' && it.active);
    if (activeEq) activeEq.curDur = player.durability;
    // 30% 이하 진입 시 경고 (한 번만)
    const weapWarnThresh = Math.ceil(player.durabilityMax * 0.3);
    if (player.durability > 0 && player.durability <= weapWarnThresh && prevWeapDur > weapWarnThresh) {
      toast(`⚠️ 무기가 곧 부숴질 것 같습니다!`);
      spawnFx(player.px+TS/2, player.py-18, `무기 위험!`, '#ff9800', 1200);
    }
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

  const ARMOR_SLOT_ICON = { head:'🪖', chest:'🧥', pants:'👖', gloves:'🧤', boots:'👢', accessory:'💍' };

  function updateArmorHud() {
    // 상단 텍스트 HUD (스탯 요약)
    if ($armorNameHud) {
      const tot = calcArmorTotals();
      const parts = [];
      if (tot.def > 0) parts.push(`🛡️+${tot.def}`);
      if (tot.hp  > 0) parts.push(`❤️+${tot.hp}`);
      const broken = Object.values(player.equippedSlots).filter(w => w && w.curDur <= 0).length;
      if (broken > 0) parts.push(`💥${broken}파괴`);
      $armorNameHud.textContent = parts.length ? parts.join(' ') : '방어구 없음';
    }

    // 방어구 내구도 행
    const $row = document.getElementById('armor-dur-row');
    if (!$row) return;
    $row.innerHTML = '';
    const slots = player.equippedSlots || {};
    for (const [slotId, wrapper] of Object.entries(slots)) {
      if (!wrapper || !ARMOR_SLOT_ICON[slotId]) continue;
      const pct    = wrapper.maxDur > 0 ? wrapper.curDur / wrapper.maxDur : 0;
      const isBroken = wrapper.curDur <= 0;
      const color  = isBroken ? '#444' : pct > 0.5 ? '#4caf50' : pct > 0.2 ? '#ff9800' : '#f44336';

      const el = document.createElement('div');
      el.className = 'armor-dur-slot';
      el.title = `${(wrapper.equip||wrapper).name||slotId} ${wrapper.curDur}/${wrapper.maxDur}`;
      el.innerHTML =
        `<span>${ARMOR_SLOT_ICON[slotId]}</span>` +
        `<div class="armor-dur-bar"><div class="armor-dur-fill" style="width:${Math.max(0,pct*100).toFixed(0)}%;background:${color}"></div></div>` +
        `<span class="armor-dur-val" style="color:${color}">${isBroken ? '💥' : wrapper.curDur}</span>`;
      $row.appendChild(el);
    }
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
            } else if (t===T.ESCAPE) {
              const ep = 0.55 + Math.sin(frameCount * 0.09) * 0.45;
              ctx.fillStyle = `rgba(0,220,120,${ep * 0.35})`;
              ctx.fillRect(sx, sy, TS, TS);
              ctx.font='20px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
              ctx.globalAlpha = 0.7 + Math.sin(frameCount * 0.09) * 0.3;
              ctx.fillText('🚪', sx+TS/2, sy+TS/2+1);
              ctx.globalAlpha = 1;
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

      // 수문장 글로우
      if (e.isGuardian) {
        const pulse = 0.55 + 0.45 * Math.sin(now * 0.004);
        ctx.save();
        ctx.shadowBlur = 18; ctx.shadowColor = `rgba(255,120,0,${pulse})`;
        ctx.strokeStyle = `rgba(255,160,0,${pulse})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(sx+TS/2,sy+TS/2,TS/2,0,Math.PI*2); ctx.stroke();
        ctx.restore();
      }

      // 배경 원
      ctx.fillStyle = e.isGuardian ? '#1a0800' : e.state==='stunned' ? '#1e3040' : '#0d0d1a';
      ctx.beginPath(); ctx.arc(sx+TS/2,sy+TS/2,TS/2-3,0,Math.PI*2); ctx.fill();

      // 이모지
      ctx.font='19px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(e.def.emoji,sx+TS/2,sy+TS/2+1);

      // 수문장 왕관 표시
      if (e.isGuardian) {
        ctx.font='10px serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
        ctx.fillText('👑',sx+TS/2,sy+2);
      }

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
      const hx = sx + TS/2; // 가로 중심

      // 방어막 글로우
      if (player.shieldStacks > 0) {
        ctx.strokeStyle='#42a5f5'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(hx,sy+TS/2,TS/2,0,Math.PI*2); ctx.stroke();
      }

      // 달리기 글로우
      if (now < player.runUntil) {
        ctx.strokeStyle='rgba(128,203,196,0.55)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(hx,sy+TS/2,TS/2+2,0,Math.PI*2); ctx.stroke();
      }

      // 몸체 원
      ctx.fillStyle = player.durBroken ? '#200808' : '#0f0f2a';
      ctx.beginPath(); ctx.arc(hx,sy+TS/2,TS/2-3,0,Math.PI*2); ctx.fill();

      // 이모지
      ctx.font='20px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('🧙',hx,sy+TS/2+1);

      // ── 캐릭터 머리 위 최소 UI (몬스터 가림 방지: 얇고 반투명) ──
      const BAR_W = 36, BAR_H = 4; // HP 바 — 얇게

      // ① 이름 태그 (캐릭터 바로 위, 작고 반투명)
      const NAME_H = 14;
      const nameTop = sy - BAR_H - 3 - 3 - NAME_H;
      if (_playerNickname) {
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(_playerNickname).width;
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = 'rgba(10,10,30,0.65)';
        ctx.fillRect(hx - tw/2 - 4, nameTop, tw + 8, NAME_H);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#d0e8ff';
        ctx.fillText(_playerNickname, hx, nameTop + NAME_H / 2);
      }

      // ② HP 바 (캐릭터 바로 위, 얇은 색상 바만)
      const hpBarTop = sy - BAR_H - 3;
      const hpRatio = player.maxHp > 0 ? Math.max(0, player.hp / player.maxHp) : 0;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(hx - BAR_W/2, hpBarTop, BAR_W, BAR_H);
      ctx.fillStyle = hpRatio > 0.5 ? '#4caf50' : hpRatio > 0.25 ? '#ff9800' : '#f44336';
      ctx.fillRect(hx - BAR_W/2, hpBarTop, Math.round(BAR_W * hpRatio), BAR_H);
      ctx.globalAlpha = 1;

      // ③ 카운터 타이밍 바 (적이 공격 예고할 때만 표시)
      const CB_W = 72, CB_H = 14;
      const cbTop = sy - BAR_H - 3 - 4 - CB_H - 3 - NAME_H - 3; // 이름 태그 위
      const telegraphingH = dungeon.enemies.filter(e => e.state === 'telegraph' && !e.dead);
      if (telegraphingH.length > 0) {
        const mostH = telegraphingH.reduce((a, b) =>
          (now - b.telegraphStart) > (now - a.telegraphStart) ? b : a
        );
        const elH    = now - mostH.telegraphStart;
        const inWinH = elH >= CTR_START && elH <= CTR_END;
        const inPerfH= elH >= CTR_START && elH <= PERF_END;

        const z1 = Math.round(CB_W * CTR_START / TELEGRAPH_MS);
        const z2 = Math.round(CB_W * PERF_END   / TELEGRAPH_MS);
        const z3 = Math.round(CB_W * CTR_END     / TELEGRAPH_MS);

        ctx.globalAlpha = 0.82;
        ctx.fillStyle='rgba(8,8,20,0.75)';      ctx.fillRect(hx-CB_W/2, cbTop, CB_W, CB_H);
        ctx.fillStyle='rgba(160,50,50,0.6)';    ctx.fillRect(hx-CB_W/2,     cbTop, z1,      CB_H);
        ctx.fillStyle='rgba(245,197,24,0.65)';  ctx.fillRect(hx-CB_W/2+z1, cbTop, z2-z1,   CB_H);
        ctx.fillStyle='rgba(255,152,0,0.6)';    ctx.fillRect(hx-CB_W/2+z2, cbTop, z3-z2,   CB_H);
        ctx.fillStyle='rgba(160,50,50,0.6)';    ctx.fillRect(hx-CB_W/2+z3, cbTop, CB_W-z3, CB_H);

        // 커서
        const cursorX = hx - CB_W/2 + Math.min(CB_W - 3, Math.round(CB_W * elH / TELEGRAPH_MS));
        ctx.fillStyle = inPerfH ? '#f5c518' : inWinH ? '#ff9800' : 'rgba(220,80,80,0.9)';
        ctx.fillRect(cursorX, cbTop, 3, CB_H);

        // 라벨 (바 안)
        const pulse = inPerfH ? (0.7 + Math.sin(now * 0.02) * 0.3) : 1;
        ctx.globalAlpha = pulse;
        ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = inPerfH ? '#f5c518' : inWinH ? '#ff9800' : 'rgba(230,180,180,1)';
        ctx.fillText(inPerfH ? '⚡완벽!' : inWinH ? '⚡반격!' : '준비', hx, cbTop + CB_H / 2);
        ctx.globalAlpha = 1;
      }
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
  // 아이템 툴팁 (PC 마우스 오버)
  // ══════════════════════════════════════════════════════════════
  function initTooltip() {
    $tooltip = document.createElement('div');
    $tooltip.id = 'item-tooltip';
    $tooltip.innerHTML = '<div class="tip-name"></div><div class="tip-desc"></div>';
    document.body.appendChild($tooltip);
  }

  function showTooltip(btn, name, desc) {
    if (!$tooltip) return;
    $tooltip.querySelector('.tip-name').textContent = name;
    $tooltip.querySelector('.tip-desc').textContent = desc;
    $tooltip.style.display = 'block';
    // 위치: 버튼 위 중앙
    const rect = btn.getBoundingClientRect();
    const tw = $tooltip.offsetWidth;
    const th = $tooltip.offsetHeight;
    let left = rect.left + rect.width / 2 - tw / 2;
    let top  = rect.top - th - 8;
    if (left < 4) left = 4;
    if (left + tw > window.innerWidth - 4) left = window.innerWidth - tw - 4;
    if (top < 4) top = rect.bottom + 8;
    $tooltip.style.left = left + 'px';
    $tooltip.style.top  = top  + 'px';
  }

  function hideTooltip() {
    if ($tooltip) $tooltip.style.display = 'none';
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
    // BGM 긴박도 갱신
    _bgmHpRatio = player.maxHp > 0 ? player.hp / player.maxHp : 1;

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

    // 아이템 슬롯 — 인벤토리가 실제로 바뀔 때만 재생성 (매 프레임 파괴하면 클릭 이벤트가 안 됨)
    const newInvKey = player.inventory.map(it => it.type === 'equip'
      ? `e:${it.equip?.id}:${it.active?1:0}:${it.curDur}`
      : it.type
    ).join('|');

    if (newInvKey !== _invKey) {
      _invKey = newInvKey;
      hideTooltip();
      $itemSlots.innerHTML = '';

      for (const it of player.inventory) {
        if (it.type !== 'equip') continue;
        const btn = document.createElement('button');
        btn.className = 'item-btn' + (it.active ? ' equip-active' : ' equip-inactive');
        const pa = it.equip.pixelArt || it.equip.pixel_art;
        if (pa?.imageDataUrl) {
          btn.innerHTML = `<img src="${pa.imageDataUrl}" style="width:34px;height:34px;image-rendering:pixelated">`;
        } else {
          btn.textContent = it.equip.itemEmoji || '⚔️';
        }
        const tipName = `${it.equip.name}  (내구 ${it.curDur}/${it.maxDur})`;
        const tipDesc = it.active ? '현재 장착 중' : '클릭하여 장착';
        btn.addEventListener('mouseenter', () => showTooltip(btn, tipName, tipDesc));
        btn.addEventListener('mouseleave', hideTooltip);
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
        btn.innerHTML = `${g.def.emoji}<span class="item-count">${g.count>1?g.count:''}</span>`;
        btn.addEventListener('mouseenter', () => showTooltip(btn, g.def.name, g.def.desc));
        btn.addEventListener('mouseleave', hideTooltip);
        btn.addEventListener('click', () => useItem(type));
        btn.addEventListener('touchstart', (ev) => { ev.preventDefault(); useItem(type); }, { passive:false });
        $itemSlots.appendChild(btn);
      }
    }

    // 방어구 내구도 행 갱신
    updateArmorHud();
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
    $screenEquip.classList.toggle  ('hidden', s!=='equip_select');
    $screenGame.classList.toggle   ('hidden', s!=='playing');
    $screenDead.classList.toggle   ('hidden', s!=='dead');
    const $esc = document.getElementById('screen-escaped');
    if ($esc) $esc.classList.toggle('hidden', s!=='escaped');

    if (s === 'playing') {
      startBGM();
    } else {
      stopBGM();
    }

    if (s === 'dead' || s === 'escaped') {
      if (s === 'dead') {
        SFX.death();
        if (animId) { cancelAnimationFrame(animId); animId=null; }
      }

      // 기록 갱신
      const RECORD_KEY = 'dungeon7_record';
      let record = { maxFloor: 0, maxKills: 0 };
      try { record = JSON.parse(localStorage.getItem(RECORD_KEY) || '{}'); } catch {}
      const newMaxFloor = Math.max(record.maxFloor || 0, floor);
      const newMaxKills = Math.max(record.maxKills || 0, player.kills);
      try { localStorage.setItem(RECORD_KEY, JSON.stringify({ maxFloor: newMaxFloor, maxKills: newMaxKills })); } catch {}

      const recordLine = `\n🏆 최고 기록: B${newMaxFloor}F · ${newMaxKills}마리`;
      const baseLine   = `B${floor}F · 처치 ${player.kills}마리 · 경험치 ${player.xp}`;

      if (s === 'dead') {
        $deadStats.textContent = `전투 불능\n${baseLine}${recordLine}`;
      } else {
        const el = document.getElementById('escaped-stats');
        if (el) el.textContent = `탈출 성공!\n${baseLine}${recordLine}`;
      }
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
        durBroken: player.durBroken, shieldStacks: player.shieldStacks,
        speedBonus: player.speedBonus, curseActive: player.curseActive,
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
        await apiFetch(`${platformApi}/api/dungeon/save`, {
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
        const res = await apiFetch(`${platformApi}/api/dungeon/save`, {
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
      apiFetch(`${platformApi}/api/dungeon/save`, {
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
    floor = 1; isRestFloor = false; effects = []; _invKey = ''; _lastDirKey = null;

    // 기본 스탯 초기화
    player.equipment     = null;
    player.equippedSlots = {};
    player.baseAtk       = 5;
    player.baseDef       = 0;
    player.moveDelay     = MOVE_BASE_MS;
    player.durability    = 0; player.durabilityMax = 0;
    player.durBroken     = false;
    player.shieldStacks  = 0;
    player.speedBonus    = 0;
    player.curseActive   = false;
    player.powerBonus    = 0;
    player.runUntil      = 0;
    player.inventory     = [];
    player.xp=0; player.kills=0;
    player.stamina = STA_MAX;

    // 스킬 보너스 적용
    applySkillBonuses();
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
        apiFetch(`${platformApi}/api/craft/equipment?limit=40`, {
          headers: { Authorization:`Bearer ${alpToken}` },
        }),
        apiFetch(`${platformApi}/api/modules`, {
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

  // ── 장비 선택 상태 ──────────────────────────────────────────
  let selectedSlots = {}; // { weapon: eq|null, head: eq|null, ... }
  let _allEquipList = [];
  let _dragItem         = null; // 마우스 드래그 중인 아이템
  let _ghostEl          = null; // 터치 드래그 고스트 엘리먼트
  let _touchDragItem    = null; // 터치 드래그 중인 아이템
  let _touchDragOrigin  = null; // 터치 드래그 출발 엘리먼트

  /** 파피돌 슬롯 UI 갱신 */
  function refreshSlotUI() {
    document.querySelectorAll('.doll-slot').forEach(el => {
      const slotId = el.dataset.slot;
      const def    = SLOT_DEFS.find(d => d.id === slotId);
      const eq     = selectedSlots[slotId];
      el.classList.toggle('slot-equipped', !!eq);
      el.innerHTML = '';
      el.onclick = eq ? () => {
        selectedSlots[slotId] = null;
        refreshSlotUI(); refreshInvEquip(); updateEnterBtn();
      } : null;
      el.style.cursor = eq ? 'pointer' : '';
      if (eq) {
        const pa = eq.pixelArt || eq.pixel_art;
        if (pa && pa.imageDataUrl) {
          const img = document.createElement('img');
          img.src = pa.imageDataUrl; img.className = 'doll-thumb';
          el.appendChild(img);
        } else {
          const s = document.createElement('span');
          s.className = 'doll-slot-icon';
          s.textContent = eq.itemEmoji || eq.emoji || def?.emoji || '?';
          el.appendChild(s);
        }
        const lbl = document.createElement('span');
        lbl.className = 'doll-slot-label';
        lbl.textContent = (eq.name || '').slice(0, 5) || def?.label || '';
        el.appendChild(lbl);
        const x = document.createElement('span');
        x.className = 'doll-slot-unequip'; x.textContent = '✕';
        el.appendChild(x);
      } else {
        const icon = document.createElement('span');
        icon.className = 'doll-slot-icon'; icon.textContent = def?.emoji || '?';
        el.appendChild(icon);
        const lbl = document.createElement('span');
        lbl.className = 'doll-slot-label'; lbl.textContent = def?.label || '';
        el.appendChild(lbl);
      }
    });
  }

  /** 인벤토리 아이템의 "장착됨" 강조 갱신 */
  function refreshInvEquip() {
    const ids = new Set(Object.values(selectedSlots).filter(Boolean).map(e => e.id));
    document.querySelectorAll('.inv-item').forEach(el => {
      el.classList.toggle('inv-equipped', ids.has(el.dataset.eqId));
    });
  }

  function updateEnterBtn() {
    const $btn = document.getElementById('btn-enter');
    if (!$btn) return;
    const n = Object.values(selectedSlots).filter(Boolean).length;
    $btn.textContent = n > 0 ? `⚔️ 입장 (${n}개 장착)` : '⚔️ 입장';
    $btn.disabled = false;
  }

  /** 세부 슬롯 감지 — DB값 우선, 없으면 이름 키워드 → 해시 순으로 fallback */
  function detectItemSlot(eq) {
    const raw = eq.stats?.equipSlot || '';
    const VALID = new Set(['weapon','head','chest','pants','gloves','boots','accessory']);
    if (VALID.has(raw)) return raw; // DB에 세부 슬롯 있으면 바로 사용

    const name = (eq.name || '').toLowerCase();
    const KW = {
      head:      ['투구','헬멧','모자','관','머리띠','베레모','두건'],
      chest:     ['갑옷','흉갑','조끼','망토','코트','로브','겉옷','상의'],
      pants:     ['바지','레깅스','치마','하의','정강이갑'],
      gloves:    ['장갑','건틀릿','암보호대','손목보호대'],
      boots:     ['장화','부츠','철화','그리브','전투화','기사부츠','가죽장화'],
      accessory: ['반지','목걸이','귀걸이','팔찌','부적','메달','브로치','펜던트','뱃지'],
    };
    for (const [slot, keywords] of Object.entries(KW)) {
      if (keywords.some(k => name.includes(k))) return slot;
    }
    // 이름으로 판별 불가 시 ID 해시로 결정 (같은 아이템은 항상 같은 슬롯)
    const SLOTS = ['chest','head','pants','gloves','boots','accessory'];
    let h = 5381;
    for (const c of String(eq.id || eq.name || '')) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
    return SLOTS[h % SLOTS.length];
  }

  /** 슬롯에 아이템 장착 시도 — 세부 슬롯 검증 */
  function _tryEquip(slotId, eq) {
    const need = detectItemSlot(eq);
    if (need !== slotId) {
      const el = document.querySelector(`.doll-slot[data-slot="${slotId}"]`);
      if (el) { el.classList.add('slot-reject'); setTimeout(() => el.classList.remove('slot-reject'), 350); }
      const def = SLOT_DEFS.find(d => d.id === need);
      showToast(`${def?.emoji || ''} ${def?.label || need} 슬롯 전용입니다`);
      return;
    }
    selectedSlots[slotId] = eq;
    refreshSlotUI(); refreshInvEquip(); updateEnterBtn();
  }

  let _invFilter = 'all'; // 현재 선택된 필터

  function renderInvGrid(list) {
    const $grid = document.getElementById('inv-grid');
    if (!$grid) return;
    $grid.innerHTML = '';

    const filtered = _invFilter === 'all' ? list : list.filter(eq => detectItemSlot(eq) === _invFilter);

    if (filtered.length === 0) {
      $grid.innerHTML = '<p class="inv-empty">해당 슬롯 장비 없음</p>';
      return;
    }

    filtered.forEach(eq => {
      const slotId = eq.stats?.equipSlot || 'weapon';
      const tier   = eq.tier || eq.rarity || 'common';
      const emoji  = eq.itemEmoji || eq.emoji || SLOT_DEFS.find(d => d.id === slotId)?.emoji || '⚔️';
      const pa     = eq.pixelArt || eq.pixel_art;
      const detectedSlot = detectItemSlot(eq);
      const slotDef = SLOT_DEFS.find(d => d.id === detectedSlot);

      const item = document.createElement('div');
      item.className = 'inv-item' + (tier !== 'common' ? ` rarity-${tier}` : '');
      item.draggable = true;
      item.dataset.eqId = eq.id;
      item.title = `${eq.name || '장비'} → ${slotDef?.label || detectedSlot} 슬롯`;

      const thumb = document.createElement('div');
      thumb.className = 'inv-thumb';
      if (pa && pa.imageDataUrl) {
        const img = document.createElement('img');
        img.src = pa.imageDataUrl; img.className = 'inv-thumb-img';
        thumb.appendChild(img);
      } else {
        const s = document.createElement('span');
        s.className = 'inv-item-emoji'; s.textContent = emoji;
        thumb.appendChild(s);
      }
      item.appendChild(thumb);

      const name = document.createElement('span');
      name.className = 'inv-item-name'; name.textContent = eq.name || '장비';
      item.appendChild(name);

      const badge = document.createElement('span');
      badge.className = 'inv-slot-badge';
      badge.textContent = slotDef?.emoji || '';
      item.appendChild(badge);

      // 클릭으로 장착 해제
      item.addEventListener('click', () => {
        const equippedSlot = Object.entries(selectedSlots).find(([, v]) => v === eq)?.[0];
        if (equippedSlot) {
          selectedSlots[equippedSlot] = null;
          refreshSlotUI(); refreshInvEquip(); updateEnterBtn();
        }
      });

      // 더블클릭으로 장착 (이미 장착 중이면 스왑)
      item.addEventListener('dblclick', () => {
        const sid = detectItemSlot(eq);
        selectedSlots[sid] = eq;
        refreshSlotUI(); refreshInvEquip(); updateEnterBtn();
      });

      // 마우스 드래그
      item.addEventListener('dragstart', e => {
        _dragItem = eq;
        e.dataTransfer.effectAllowed = 'move';
        const blank = document.createElement('canvas');
        blank.width = blank.height = 1;
        e.dataTransfer.setDragImage(blank, 0, 0);
        setTimeout(() => item.classList.add('dragging'), 0);
      });
      item.addEventListener('dragend', () => { _dragItem = null; item.classList.remove('dragging'); });

      // 터치 드래그 시작
      item.addEventListener('touchstart', e => {
        e.preventDefault();
        _touchDragItem   = eq;
        _touchDragOrigin = item;
        const t = e.touches[0];
        _ghostEl = document.createElement('div');
        _ghostEl.className = 'drag-ghost';
        _ghostEl.textContent = emoji;
        _ghostEl.style.left = t.clientX + 'px';
        _ghostEl.style.top  = t.clientY + 'px';
        document.body.appendChild(_ghostEl);
        item.classList.add('dragging');
      }, { passive: false });

      $grid.appendChild(item);
    });

    // 장착 상태 반영
    refreshInvEquip();
  }

  /** 인벤토리 그리드 렌더링 + 드래그 이벤트 설정 */
  function renderEquipList(list) {
    _allEquipList = list;
    _invFilter = 'all';
    selectedSlots = {};

    if ($equipStatus) {
      $equipStatus.textContent = list.length ? `${list.length}개` : '없음';
    }

    const $grid = document.getElementById('inv-grid');
    if (!$grid) { refreshSlotUI(); updateEnterBtn(); return; }

    // 필터 버튼 생성
    const $filterWrap = document.getElementById('inv-filter-wrap');
    if ($filterWrap) {
      $filterWrap.innerHTML = '';
      const filters = [
        { id: 'all', emoji: '📦', label: '전체' },
        ...SLOT_DEFS.map(d => ({ id: d.id, emoji: d.emoji, label: d.label })),
      ];
      filters.forEach(f => {
        const btn = document.createElement('button');
        btn.className = 'inv-filter-btn' + (f.id === 'all' ? ' active' : '');
        btn.innerHTML = `${f.emoji}<span>${f.label}</span>`;
        btn.addEventListener('click', () => {
          _invFilter = f.id;
          $filterWrap.querySelectorAll('.inv-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderInvGrid(_allEquipList);
        });
        $filterWrap.appendChild(btn);
      });
    }

    // 슬롯 드롭 이벤트
    document.querySelectorAll('.doll-slot').forEach(slot => {
      slot.ondragover  = e => { if (_dragItem) { e.preventDefault(); slot.classList.add('drag-over'); } };
      slot.ondragleave = ()  => slot.classList.remove('drag-over');
      slot.ondrop      = e  => {
        e.preventDefault(); slot.classList.remove('drag-over');
        if (_dragItem) _tryEquip(slot.dataset.slot, _dragItem);
      };
    });

    if (list.length === 0) {
      $grid.innerHTML = '<p class="inv-empty">보유 장비가 없습니다</p>';
      refreshSlotUI(); updateEnterBtn(); return;
    }

    renderInvGrid(list);
    refreshSlotUI(); updateEnterBtn();

    // 터치 이동/종료 핸들러 (한 번만 등록)
    if (!document._dungeonTouchDrag) {
      document._dungeonTouchDrag = true;
      document.addEventListener('touchmove', e => {
        if (!_ghostEl) return;
        e.preventDefault();
        const t = e.touches[0];
        _ghostEl.style.left = t.clientX + 'px';
        _ghostEl.style.top  = t.clientY + 'px';
        document.querySelectorAll('.doll-slot').forEach(slot => {
          const r = slot.getBoundingClientRect();
          const over = t.clientX >= r.left && t.clientX <= r.right
                    && t.clientY >= r.top  && t.clientY <= r.bottom;
          slot.classList.toggle('drag-over', over);
        });
      }, { passive: false });

      document.addEventListener('touchend', e => {
        if (!_ghostEl || !_touchDragItem) return;
        const t = e.changedTouches[0];
        _ghostEl.remove(); _ghostEl = null;
        _touchDragOrigin?.classList.remove('dragging');
        document.querySelectorAll('.doll-slot').forEach(slot => {
          slot.classList.remove('drag-over');
          const r = slot.getBoundingClientRect();
          if (t.clientX >= r.left && t.clientX <= r.right
           && t.clientY >= r.top  && t.clientY <= r.bottom) {
            _tryEquip(slot.dataset.slot, _touchDragItem);
          }
        });
        _touchDragItem = null; _touchDragOrigin = null;
      }, { passive: true });
    }
    return; // 아래 기존 코드 실행 방지
  }


  function escHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ══════════════════════════════════════════════════════════════
  // 입력 설정
  // ══════════════════════════════════════════════════════════════
  function setupInput() {
    // 방향키 → 달리기 더블 입력 감지 맵
    const DIR_MAP = {
      ArrowUp:'u', w:'u', W:'u',
      ArrowDown:'d', s:'d', S:'d',
      ArrowLeft:'l', a:'l', A:'l',
      ArrowRight:'r', d:'r', D:'r',
    };

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

      // 같은 방향 더블 입력 → 달리기
      if (!ev.repeat && gameState === 'playing') {
        const dir = DIR_MAP[ev.key];
        if (dir) {
          const now2 = performance.now();
          if (dir === _lastDirKey && now2 - _lastDirAt < RUN_DOUBLE_MS) {
            player.runUntil = now2 + RUN_DURATION;
            _lastDirKey = null; // 연속 트리거 방지
            SFX.run();
            spawnFx(player.px + TS/2, player.py + TS/2, '💨', '#80cbc4', 500);
          } else {
            _lastDirKey = dir;
            _lastDirAt  = now2;
          }
        }
      }
    });
    document.addEventListener('keyup', (ev) => { keys[ev.key]=false; });

    // 모바일 D패드 (이동 버튼)
    $dpad.querySelectorAll('[data-dx]').forEach(btn => {
      const dx=parseInt(btn.dataset.dx), dy=parseInt(btn.dataset.dy);
      const dirKey = `${dx},${dy}`;
      let holdTimer=null;

      const start=(ev)=>{
        ev.preventDefault();
        // 더블 탭 → 달리기
        if (gameState === 'playing') {
          const now2 = performance.now();
          if (dirKey === _lastDirKey && now2 - _lastDirAt < RUN_DOUBLE_MS) {
            player.runUntil = now2 + RUN_DURATION;
            _lastDirKey = null;
            SFX.run();
            spawnFx(player.px + TS/2, player.py + TS/2, '💨', '#80cbc4', 500);
          } else {
            _lastDirKey = dirKey;
            _lastDirAt  = now2;
          }
        }
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

    document.getElementById('btn-enter').addEventListener('click', () => {
      const weaponArr  = selectedSlots.weapon ? [selectedSlots.weapon] : [];
      const armorSlots = Object.fromEntries(
        Object.entries(selectedSlots).filter(([k, v]) => k !== 'weapon' && v)
      );
      startGame(weaponArr, armorSlots);
    });
    $btnRestart.addEventListener('click', ()=>{
      if(animId){ cancelAnimationFrame(animId); animId=null; }
      setGameState('equip_select');
      loadEquipment();
    });

    const $btnEscapedBack = document.getElementById('btn-escaped-back');
    if ($btnEscapedBack) {
      $btnEscapedBack.addEventListener('click', () => {
        // 플랫폼 URL이 있으면 뒤로, 없으면 장비 선택 화면으로
        if (document.referrer && document.referrer !== window.location.href) {
          history.back();
        } else {
          setGameState('equip_select');
          loadEquipment();
        }
      });
    }
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
    $equipList    = null; // 구 equip-list 제거됨 (inv-grid로 대체)
    $equipStatus  = document.getElementById('equip-status');
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

    initTooltip();
    setupInput();
    loadEquipment();
    initEquipPanel();
    setGameState('equip_select');
  }

  // ══════════════════════════════════════════════════════════════
  // 인게임 장비 패널 (일시정지 + 수리)
  // ══════════════════════════════════════════════════════════════
  function initEquipPanel() {
    const overlay   = document.getElementById('equip-panel-overlay');
    const closeBtn  = document.getElementById('equip-panel-close');
    const openBtn   = document.getElementById('btn-equip-panel');
    if (!overlay) return;

    openBtn?.addEventListener('click', openEquipPanel);
    openBtn?.addEventListener('touchstart', e => { e.preventDefault(); openEquipPanel(); }, { passive: false });
    closeBtn?.addEventListener('click', closeEquipPanel);
    closeBtn?.addEventListener('touchstart', e => { e.preventDefault(); closeEquipPanel(); }, { passive: false });
    overlay.addEventListener('click', e => { if (e.target === overlay) closeEquipPanel(); });
  }

  function openEquipPanel() {
    if (gameState !== 'playing') return;
    // 게임 루프 일시정지
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    renderEquipPanel();
    document.getElementById('equip-panel-overlay')?.classList.remove('hidden');
  }

  function closeEquipPanel() {
    document.getElementById('equip-panel-overlay')?.classList.add('hidden');
    // 게임 루프 재개
    if (gameState === 'playing' && !animId) {
      lastFrameAt = 0;
      animId = requestAnimationFrame(loop);
    }
  }

  function renderEquipPanel() {
    const body   = document.getElementById('equip-panel-body');
    const footer = document.getElementById('equip-panel-footer');
    if (!body || !footer) return;

    // 수리 아이템 수량
    const repCount     = player.inventory.filter(it => it.type === 'repair').length;
    const repFullCount = player.inventory.filter(it => it.type === 'repair_full').length;
    const hasAnyKit    = repCount > 0 || repFullCount > 0;

    body.innerHTML = '';

    const SLOT_ICON = { head:'🪖', chest:'🧥', pants:'👖', gloves:'🧤', boots:'👢', accessory:'💍' };

    // 무기 행
    if (player.equipment) {
      body.appendChild(_makeEpRow({
        icon: player.equipment.itemEmoji || '⚔️',
        name: player.equipment.name || '무기',
        curDur: player.durability,
        maxDur: player.durabilityMax,
        onRepair20: repCount > 0 ? () => _repairWeapon(20) : null,
        onRepairFull: repFullCount > 0 ? () => _repairWeapon(Infinity) : null,
      }));
    }

    // 방어구 행
    const SLOT_ORDER = ['head','chest','gloves','pants','boots','accessory'];
    for (const slotId of SLOT_ORDER) {
      const wrapper = player.equippedSlots?.[slotId];
      if (!wrapper) continue;
      const eq = wrapper.equip || wrapper;
      body.appendChild(_makeEpRow({
        icon: SLOT_ICON[slotId] || '🛡️',
        name: eq.name || slotId,
        curDur: wrapper.curDur,
        maxDur: wrapper.maxDur,
        onRepair20:   repCount > 0 ? () => _repairArmor(slotId, 20) : null,
        onRepairFull: repFullCount > 0 ? () => _repairArmor(slotId, Infinity) : null,
      }));
    }

    if (body.children.length === 0) {
      body.innerHTML = '<p style="color:var(--dim);text-align:center;padding:1rem">장착된 장비가 없습니다</p>';
    }

    // 푸터: 수리 키트 현황 + 전체 수리
    footer.innerHTML = '';
    const kitInfo = document.createElement('span');
    kitInfo.className = 'ep-kit-info';
    kitInfo.textContent = hasAnyKit
      ? `🔧 수리키트 ×${repCount}  🔩 완전수리 ×${repFullCount}`
      : '수리 아이템 없음';
    footer.appendChild(kitInfo);

    const repAllBtn = document.createElement('button');
    repAllBtn.className = 'ep-repair-all-btn';
    repAllBtn.textContent = '🔧 전체 수리';
    repAllBtn.disabled = !hasAnyKit;
    repAllBtn.addEventListener('click', () => {
      _repairAll();
      renderEquipPanel();
    });
    footer.appendChild(repAllBtn);
  }

  function _makeEpRow({ icon, name, curDur, maxDur, onRepair20, onRepairFull }) {
    const pct    = maxDur > 0 ? curDur / maxDur : 0;
    const broken = curDur <= 0;
    const color  = broken ? '#555' : pct > 0.5 ? '#4caf50' : pct > 0.3 ? '#ff9800' : '#f44336';

    const row = document.createElement('div');
    row.className = 'ep-row' + (broken ? ' ep-broken' : '');
    row.innerHTML = `
      <span class="ep-icon">${icon}</span>
      <div class="ep-info">
        <div class="ep-name">${name}</div>
        <div class="ep-dur-row">
          <div class="ep-dur-bar-bg">
            <div class="ep-dur-bar-fill" style="width:${(pct*100).toFixed(1)}%;background:${color}"></div>
          </div>
          <span class="ep-dur-val" style="color:${color}">${curDur}/${maxDur}</span>
        </div>
      </div>
      <div class="ep-repair-wrap"></div>`;

    const wrap = row.querySelector('.ep-repair-wrap');
    if (onRepair20) {
      const btn = document.createElement('button');
      btn.className = 'ep-repair-btn';
      btn.textContent = '🔧 +20';
      btn.addEventListener('click', () => { onRepair20(); renderEquipPanel(); });
      wrap.appendChild(btn);
    }
    if (onRepairFull) {
      const btn = document.createElement('button');
      btn.className = 'ep-repair-btn';
      btn.textContent = '🔩 완전';
      btn.addEventListener('click', () => { onRepairFull(); renderEquipPanel(); });
      wrap.appendChild(btn);
    }
    return row;
  }

  function _repairWeapon(amount) {
    const isFullKit = amount === Infinity;
    const kitType   = isFullKit ? 'repair_full' : 'repair';
    const idx = player.inventory.findIndex(it => it.type === kitType);
    if (idx === -1) return;
    player.inventory.splice(idx, 1);

    const add = isFullKit ? (player.durabilityMax - player.durability) : Math.min(20, player.durabilityMax - player.durability);
    player.durability = Math.min(player.durabilityMax, player.durability + (isFullKit ? player.durabilityMax : 20));
    const activeEq = player.inventory.find(it => it.type === 'equip' && it.active);
    if (activeEq) activeEq.curDur = player.durability;
    if (player.durBroken && player.durability > 0) {
      player.durBroken = false;
      _recomputePlayerStats();
    }
    hudDirty = true;
    toast(`🔧 무기 내구도 +${add} 회복`);
  }

  function _repairArmor(slotId, amount) {
    const isFullKit = amount === Infinity;
    const kitType   = isFullKit ? 'repair_full' : 'repair';
    const idx = player.inventory.findIndex(it => it.type === kitType);
    if (idx === -1) return;
    player.inventory.splice(idx, 1);

    const wrapper = player.equippedSlots?.[slotId];
    if (!wrapper) return;
    const wasBroken = wrapper.curDur <= 0;
    const add = isFullKit ? (wrapper.maxDur - wrapper.curDur) : Math.min(20, wrapper.maxDur - wrapper.curDur);
    wrapper.curDur = Math.min(wrapper.maxDur, wrapper.curDur + (isFullKit ? wrapper.maxDur : 20));
    const eq = wrapper.equip || wrapper;
    if (wasBroken && wrapper.curDur > 0) _recomputePlayerStats();
    hudDirty = true;
    toast(`🔧 ${eq.name} 내구도 +${add} 회복`);
  }

  function _repairAll() {
    // 보유한 수리 아이템을 소진하며 내구도가 낮은 순으로 수리
    const slots = ['weapon', ...Object.keys(player.equippedSlots || {})];
    let repaired = 0;
    while (player.inventory.some(it => it.type === 'repair' || it.type === 'repair_full')) {
      // 가장 낮은 내구도 슬롯 선택
      let lowestPct = 1, lowestSlot = null;
      if (player.equipment && player.durabilityMax > 0) {
        const p = player.durability / player.durabilityMax;
        if (p < lowestPct) { lowestPct = p; lowestSlot = 'weapon'; }
      }
      for (const [sid, w] of Object.entries(player.equippedSlots || {})) {
        if (!w || w.maxDur <= 0) continue;
        const p = w.curDur / w.maxDur;
        if (p < lowestPct) { lowestPct = p; lowestSlot = sid; }
      }
      if (!lowestSlot || lowestPct >= 1) break;
      if (lowestSlot === 'weapon') _repairWeapon(20);
      else _repairArmor(lowestSlot, 20);
      repaired++;
    }
    if (repaired > 0) toast(`🔧 전체 수리 완료 (${repaired}회)`);
    updateArmorHud();
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

    /* ── 튜토리얼 ───────────────────────────────────────── */
    mountTutorial({
      storageKey: 'game7_tutorial',
      steps: [
        { emoji: '⚔️', title: '던전 탐험에 오신 걸 환영해요!',
          body: '몬스터를 처치하고 층을 내려가며 보상을 모으세요.<br>죽지 않고 탈출하는 게 핵심이에요!' },
        { emoji: '🎮', title: '조작법',
          body: '<b>마우스 클릭</b>: 이동/공격<br><b>스킬 버튼</b>: 액티브 스킬 사용<br>몬스터에 가까이 가면 자동으로 공격해요.' },
        { emoji: '🛡️', title: '장비 장착',
          body: '입장 전 <b>장비 슬롯</b>(무기/머리/상의/하의/손/발/악세서리)에<br>대장간에서 만든 장비를 끼우세요.<br>장비 없이도 진입은 가능하지만 약해요.' },
        { emoji: '⚠️', title: '내구도 주의',
          body: '몬스터에 맞으면 장비 <b>내구도가 닳아요</b>.<br>30% 이하면 경고 표시, 0이 되면 파괴됩니다!<br>대장간에서 미리 수리하세요.' },
        { emoji: '💀', title: '사망 vs 탈출',
          body: '<b>탈출 성공</b>: 층수 × 8 + 킬 × 1 코인 + 아이템 드롭<br><b>사망</b>: 장착 장비 <b>전부 파괴</b> + 층수만큼 코인.<br>위험할 땐 빨리 탈출하세요!' },
        { emoji: '⭐', title: '스킬 포인트',
          body: '5층마다 <b>스킬 포인트(SP)</b>를 얻어요.<br>전사 훈련/철벽 방어/신속/강인함 등 <b>패시브</b>를 강화하세요.<br>죽어도 SP는 유지돼요.' },
        { emoji: '🏆', title: '도전!',
          body: '깊이 들어갈수록 몬스터가 강해지고 보상도 커져요.<br>장비 → 던전 → 코인 → 더 좋은 장비의 사이클!' },
      ],
    });
  });
})();
