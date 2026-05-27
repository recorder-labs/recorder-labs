/* practice.js — 연습 재생, 하이라이트, 카운트다운 */

let NOTE_TIMELINE = [];
let PERF_NOTE_TO_NAME = {};
let PERF_NOTE_TO_LINE = {};   // 노트 id → 악보 줄 인덱스(0,1,2,...) — score.json LineSets 기준
let _loadedSong = null;
let _scoreData = null;
let _playbackRate = 1.0;

/* ── 악보/싱크 JSON 파싱 헬퍼 ── */
function _parseBeat(L) {
  if (!L) return 1;
  const dot = L.endsWith('.');
  const n = parseInt(dot ? L.slice(0, -1) : L);
  return (4 / n) * (dot ? 1.5 : 1);
}
function _parseTimeStr(s) {
  const [min, sec] = s.split(':');
  return parseFloat(min) * 60 + parseFloat(sec);
}
function _buildPracticeData(syncData, scoreData) {
  const beat = syncData.Beat;
  const beatChanges = {};
  (syncData.beats || []).forEach(b => {
    const [m, v] = b.split(',');
    beatChanges[parseInt(m)] = parseFloat(v);
  });
  const chapters = syncData.Chapters.map(ch => ({
    timeStart: _parseTimeStr(ch.TimeStart),
    measures: ch.Measures.split(',').map(Number)
  }));
  // allMeasures 와 함께 measure→line 매핑을 동시에 구축: 여러 LineSets/Lines 구조를 평탄화하면서 줄 인덱스 추적
  const allMeasures = [];
  const measureToLine = [];   // index parallel to allMeasures
  {
    let lineIdx = 0;
    for (const ls of scoreData.LineSets) {
      for (const line of ls.Lines) {
        for (const m of line.Measures) {
          allMeasures.push(m);
          measureToLine.push(lineIdx);
        }
        lineIdx++;
      }
    }
  }
  const noteToName = {}, noteToLine = {}, beatCounts = [], noteIds = [];
  allMeasures.forEach((m, mIdx) => {
    const notes = m.Layers[0].Notes;
    const ids   = notes.map((_, i) => `_${i + 1}_${mIdx + 1}`);
    const beats = notes.map(n => _parseBeat(n.L));
    notes.forEach((n, i) => {
      if (n.ly) noteToName[ids[i]] = n.ly;
      noteToLine[ids[i]] = measureToLine[mIdx];
    });
    noteIds.push(ids);
    beatCounts.push(beats);
  });
  const tl = [];
  for (const ch of chapters) {
    let t = ch.timeStart;
    for (const mIdx of ch.measures) {
      const b = beatChanges[mIdx] ?? beat;
      const ids = noteIds[mIdx] || [], bc = beatCounts[mIdx] || [];
      for (let i = 0; i < ids.length; i++) {
        const dur = (bc[i] || 1) * b;
        tl.push({ id: ids[i], start: t, end: t + dur });
        t += dur;
      }
    }
  }
  // 카운트다운: 첫 마디(Chapters[0].TimeStart) 직전 한 마디(beatsPerMeasure × Beat) 동안 표시.
  // 박자표는 score.json 첫 마디의 time 필드(예: "4/4") 분자.
  let countdownInfo = null;
  try {
    const firstTime = (allMeasures[0] && allMeasures[0].time) || '4/4';
    const beatsPerMeasure = parseInt(String(firstTime).split('/')[0], 10) || 4;
    const chapterStart = chapters[0] ? chapters[0].timeStart : 0;
    const countStartTime = Math.max(0, chapterStart - beat * beatsPerMeasure);
    if (chapterStart > 0) {
      countdownInfo = { beat, beatsPerMeasure, countStartTime, chapterStart };
    }
  } catch (e) { countdownInfo = null; }
  return { tl, noteToName, noteToLine, countdownInfo };
}

/* ── score.json → SVG 자체 렌더링 (score.svg가 없는 곡용) ── */
const _TREBLE_CLEF_PATH = 'M35.401,24.855c-3.623-10.948-9.226-7.872-12.993,1.803-4.615,8.872-1.855,21.78.159,28.424-7.452,7.167-21.24,23.486-20.151,31.447-.297,16.403,15.909,27.822,31.234,24.022l2.705,15.061c1.809,8.376-9.274,16.778-15.962,9.811,14.514.574,7.374-21.115-4.243-12.621-7.932,6.256,2.383,19.059,10.766,16.863,16.273-3.682,9.642-18.46,7.954-29.697,22.148-3.952,15.886-40.145-6.788-35.106l-2.015-10.712c11.756-9.228,14.713-25.542,9.333-39.296M34.075,28.567c3.938,9.197-2.889,20.419-10.023,25.349l-1.326-12.409c.878-5.13,5.785-20.903,11.349-12.939M15.568,75.499c3.217-4.49,6.311-7.866,9.28-10.129l1.803,9.758c-17.044,4.301-14.656,28.026,2.068,30.864v-.795c-13.341-2.126-15.175-20.523-1.008-23.121l5.409,26.091C13.328,113.649.194,91.577,15.568,75.499M39.166,84.621c8.648,5.917,6.067,20.901-4.614,22.697l-5.144-25.243c3.535-.601,6.788.247,9.758,2.545Z';
// 비행기 탭의 score.svg에서 가져온 "8" subscript path. 비행기 SVG에선 클립 rect가 x=7.222
// 위치이고 클레프도 그 만큼 우측으로 이동된 좌표(M42.623…)로 작성돼 있음. hans 심볼은
// 원본 좌표(M35.401…)를 사용하므로 "8"의 모든 절대 X(M 명령)를 7.222만큼 좌측으로 이동시킴.
const _TREBLE_CLEF_8VA_PATH = 'M34.176,4.563c-.56-.581-1.281-.876-2.142-.876-.883,0-1.768.338-2.634,1.007-.879.7-1.42,1.613-1.607,2.714-.271,1.543.198,2.695,1.395,3.43l-.07.032c-.821.419-1.467.845-1.918,1.266-.478.448-.792,1.121-.932,1.996-.208,1.153.028,2.106.699,2.829.62.702,1.402,1.059,2.326,1.059,1.03,0,2.014-.379,2.923-1.126.923-.759,1.5-1.802,1.716-3.099.174-1.034.043-1.907-.393-2.595-.354-.54-.815-.933-1.372-1.172l.126-.104c.721-.34,1.286-.709,1.684-1.096.4-.406.667-.967.795-1.668.193-1.115-.007-1.989-.594-2.598ZM27.671,14.356c.096-.565.312-1.083.643-1.543.339-.49.695-.871,1.064-1.136.503-.383.715-.44.797-.44.296,0,.65.131,1.051.39.395.254.705.621.922,1.091l.01.019c.25.439.326.936.234,1.516-.153.892-.498,1.569-1.057,2.073-.557.52-1.185.783-1.867.783-.662,0-1.147-.244-1.49-.757-.355-.474-.456-1.126-.306-1.995ZM29.743,8.736c-.427-.534-.576-1.146-.457-1.87.123-.714.418-1.276.902-1.719.498-.461,1.023-.695,1.558-.695.646,0,1.117.235,1.441.721.329.473.416,1.088.268,1.878v.006c-.109.649-.415,1.239-.91,1.752-.481.496-.907.747-1.264.747-.593,0-1.096-.269-1.538-.822Z';

function renderScoreFromJson(scoreData, opts) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1200;
  const SYS_LEFT = 18, SYS_RIGHT = W - 18;
  const STAFF_LEFT = SYS_LEFT + 100;
  const LINE_SP = 14;
  const STAFF_H = LINE_SP * 4;
  const SYS_H = 145;
  const TOP_PAD = 20;
  const BOTTOM_PAD = 30;
  const NOTE_RX = 7.6, NOTE_RY = 5.6;
  const STEM_LEN = LINE_SP * 3.2;
  const STEM_W = 1.5;

  const lineSets = (scoreData.LineSets || []).map(ls => (ls.Lines && ls.Lines[0]) ? ls.Lines[0].Measures : []);
  const totalH = TOP_PAD + lineSets.length * SYS_H + BOTTOM_PAD;

  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  const svg = el('svg', {
    xmlns: NS,
    'xmlns:xlink': 'http://www.w3.org/1999/xlink',
    viewBox: '0 0 ' + W + ' ' + totalH
  });
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Treble clef 렌더 파라미터 (라인 루프에서 인라인 사용)
  // 비행기 SVG는 클레프를 inline path로 직접 그리므로, hans도 동일하게 inline.
  // (이전 symbol+use 방식은 동적으로 생성한 use의 xlink:href가 일부 환경에서
  //  심볼을 찾지 못해 클레프가 렌더되지 않는 문제가 있었음)
  const CLEF_W = 32, CLEF_H = LINE_SP * 7.2;
  const CLEF_VB_W = 54, CLEF_VB_H = 150;
  // preserveAspectRatio xMidYMid meet 동작과 동일하게 작은 축 기준 균일 스케일 + 중앙 배치
  const CLEF_SCALE = Math.min(CLEF_W / CLEF_VB_W, CLEF_H / CLEF_VB_H);
  const CLEF_RENDER_W = CLEF_VB_W * CLEF_SCALE;
  const CLEF_RENDER_H = CLEF_VB_H * CLEF_SCALE;
  const CLEF_OFFSET_X = (CLEF_W - CLEF_RENDER_W) / 2;
  const CLEF_OFFSET_Y = (CLEF_H - CLEF_RENDER_H) / 2;

  const POS = { c:0, d:1, e:2, f:3, g:4, a:5, b:6 };
  const pitchY = (p, o, top) => {
    const dn = (o || 0) * 7 + (POS[p] != null ? POS[p] : 0);
    return top + (10 - dn) * (LINE_SP / 2);  // F5(o=1,p=f) at top line
  };

  let globalMIdx = 0;

  lineSets.forEach((measures, sIdx) => {
    const sysTop = TOP_PAD + sIdx * SYS_H;
    const staffTop = sysTop + 50;

    // 5 staff lines
    for (let i = 0; i < 5; i++) {
      el('line', {
        x1: SYS_LEFT, x2: SYS_RIGHT,
        y1: staffTop + i * LINE_SP, y2: staffTop + i * LINE_SP,
        stroke: '#000', 'stroke-width': '1.2'
      }, svg);
    }

    // Treble clef + 작은 8 (8va) — 인라인 path 두 개로 렌더
    const clefBaseX = SYS_LEFT + 4 + CLEF_OFFSET_X;
    const clefBaseY = staffTop - LINE_SP * 1.2 + CLEF_OFFSET_Y;
    const clefG = el('g', {
      transform: 'translate(' + clefBaseX + ' ' + clefBaseY + ') scale(' + CLEF_SCALE + ')'
    }, svg);
    el('path', { d: _TREBLE_CLEF_PATH, fill: '#000' }, clefG);
    el('path', { d: _TREBLE_CLEF_8VA_PATH, fill: '#000' }, clefG);

    // Key signature: G major = 1 sharp on F5 line
    if (opts && opts.keySig === 'G') {
      const sharp = el('text', {
        x: SYS_LEFT + 46, y: staffTop + 1,
        'font-size': '28', 'font-family': 'serif',
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-weight': '700', fill: '#000'
      }, svg);
      sharp.textContent = '♯';
    }

    // Time signature on first system only
    if (sIdx === 0 && opts && opts.timeSig === '4/4') {
      const tsX = SYS_LEFT + 74;
      const tsAttrs = {
        x: tsX, 'font-size': '28', 'font-family': 'serif',
        'font-weight': '900', 'text-anchor': 'middle',
        'dominant-baseline': 'middle', fill: '#000'
      };
      const t1 = el('text', Object.assign({}, tsAttrs, { y: staffTop + LINE_SP - 1 }), svg);
      t1.textContent = '4';
      const t2 = el('text', Object.assign({}, tsAttrs, { y: staffTop + LINE_SP * 3 - 1 }), svg);
      t2.textContent = '4';
    }

    // Measures
    const measureWidth = (SYS_RIGHT - STAFF_LEFT) / measures.length;

    measures.forEach((m, mi) => {
      const mStart = STAFF_LEFT + mi * measureWidth;
      const mEnd = mStart + measureWidth;
      const notes = (m.Layers && m.Layers[0]) ? m.Layers[0].Notes : [];

      const beats = notes.map(n => _parseBeat(n.L));
      const totalBeats = beats.reduce((a, b) => a + b, 0) || 1;

      const innerStart = mStart + 14;
      const innerEnd = mEnd - 8;
      const innerWidth = innerEnd - innerStart;

      let cum = 0;
      notes.forEach((n, ni) => {
        const cx = innerStart + (cum + beats[ni] * 0.4) * innerWidth / totalBeats;
        cum += beats[ni];
        const id = '_' + (ni + 1) + '_' + (globalMIdx + mi + 1);

        if (n.P) {
          const cy = pitchY(n.P, n.o, staffTop);
          const isHollow = n.L === '2' || n.L === '2.' || n.L === '1';
          const stemDown = n.d === true;
          const dotted = (n.L || '').endsWith('.');

          const g = el('g', { id: id, class: 'perf-note' }, svg);
          el('ellipse', {
            cx: cx, cy: cy, rx: NOTE_RX, ry: NOTE_RY,
            transform: 'rotate(-22 ' + cx + ' ' + cy + ')',
            fill: isHollow ? 'none' : '#000',
            stroke: '#000',
            'stroke-width': isHollow ? '1.7' : '0'
          }, g);

          if (n.L !== '1') {
            const sx = stemDown ? cx - NOTE_RX + 0.6 : cx + NOTE_RX - 0.6;
            const ey = stemDown ? cy + STEM_LEN : cy - STEM_LEN;
            el('line', {
              x1: sx, y1: cy, x2: sx, y2: ey,
              stroke: '#000', 'stroke-width': STEM_W,
              'stroke-linecap': 'round'
            }, g);
          }

          if (dotted) {
            const stepsFromTop = Math.round((cy - staffTop) * 2 / LINE_SP);
            const onLine = (stepsFromTop % 2 === 0);
            const dy = onLine ? cy - LINE_SP / 2 : cy;
            el('circle', {
              cx: cx + NOTE_RX + 5, cy: dy, r: 1.9, fill: '#000'
            }, g);
          }
        } else if (n.L) {
          // Rest
          const r = el('text', {
            x: cx, y: staffTop + LINE_SP * 1.5,
            'font-size': '34', 'font-family': 'serif',
            'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#000'
          }, svg);
          r.textContent = n.L === '2' ? '𝄼' : n.L === '8' ? '𝄾' : '𝄽';
        }
      });

      // Bar lines
      const isLastInSys = mi === measures.length - 1;
      const isLastSys = sIdx === lineSets.length - 1;
      if (!isLastInSys) {
        el('line', {
          x1: mEnd, x2: mEnd,
          y1: staffTop, y2: staffTop + STAFF_H,
          stroke: '#000', 'stroke-width': '1.2'
        }, svg);
      } else if (isLastSys) {
        el('line', {
          x1: SYS_RIGHT - 7, x2: SYS_RIGHT - 7,
          y1: staffTop, y2: staffTop + STAFF_H,
          stroke: '#000', 'stroke-width': '1.2'
        }, svg);
        el('line', {
          x1: SYS_RIGHT - 1.5, x2: SYS_RIGHT - 1.5,
          y1: staffTop, y2: staffTop + STAFF_H,
          stroke: '#000', 'stroke-width': '4'
        }, svg);
      } else {
        el('line', {
          x1: SYS_RIGHT, x2: SYS_RIGHT,
          y1: staffTop, y2: staffTop + STAFF_H,
          stroke: '#000', 'stroke-width': '1.2'
        }, svg);
      }
    });

    globalMIdx += measures.length;
  });

  return svg;
}

/* ── 비행기 악보 두 번째 줄을 40px 아래로 이동 ── */
function _shiftAirplaneLine2(svg) {
  const SHIFT = 60;
  const vb = svg.viewBox && svg.viewBox.baseVal;
  if (!vb || !vb.height) return;
  const threshold = vb.y + vb.height / 2;

  const candidates = [];
  Array.from(svg.children).forEach(c => {
    if (c.tagName.toLowerCase() === 'g' && /^_\d+_\d+$/.test(c.id)) candidates.push(c);
  });
  const perf = svg.querySelector('[id$="performance_body_1"]');
  if (perf) Array.from(perf.children).forEach(c => candidates.push(c));

  let shifted = 0;
  candidates.forEach(el => {
    try {
      const bb = el.getBBox();
      if (bb.y + bb.height / 2 > threshold) {
        const t = el.getAttribute('transform');
        el.setAttribute('transform', (t ? t + ' ' : '') + `translate(0, ${SHIFT})`);
        el.dataset.line2 = '1';
        shifted++;
      }
    } catch (e) {}
  });

  if (shifted > 0) svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height + SHIFT}`);
}

/* ── score.svg 인라인 삽입용 충돌 방지 처리 ── */
function _scopeSvgForInject(svgText) {
  const prefix = 'psc', NOTE_ID_RE = /^_\d+_\d+$/;
  const ids = new Set();
  const re = /\bid="([^"]+)"/g; let m;
  while ((m = re.exec(svgText)) !== null) ids.add(m[1]);
  const idMap = {};
  for (const id of ids) { if (!NOTE_ID_RE.test(id)) idMap[id] = `${prefix}_${id}`; }
  let s = svgText;
  s = s.replace(/\bid="([^"]+)"/g,               (_, id)    => `id="${idMap[id] || id}"`);
  s = s.replace(/url\(#([^)]+)\)/g,               (_, id)    => `url(#${idMap[id] || id})`);
  s = s.replace(/((?:xlink:)?href)="#([^"]+)"/g,  (_, a, id) => `${a}="#${idMap[id] || id}"`);
  s = s.replace(/\bcls-(\d+)/g,                  `${prefix}-cls-$1`);
  return s;
}

/* ── 하이라이트 루프 ── */
let _hlRAF = null;
let _hlCur = null;

/* ── 카운트다운 ── */
let _countdownInfo = null;   // { beat, beatsPerMeasure, countStartTime, chapterStart }
let _countdownLastNum = null;
// note-btn 도/레/미/파/솔/라 박스 컬러 (파♯, 시♭ 등 변화음 제외) 순서대로 카운트다운 숫자에 적용
const _COUNTDOWN_COLORS = ['#ff6b6b', '#ff9f43', '#f0c000', '#6ab04c', '#4a90d9', '#9b7fe8'];
// HSL 명도 기반 darken — 같은 hue/saturation, L × factor (1보다 작으면 어두워짐)
function _darkenHsl(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  l = Math.max(0, Math.min(1, l * factor));
  const k = n => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
  return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}
function _setCountdownNumber(num, beatSec, color) {
  const el = document.getElementById('countdownNum');
  if (!el) return;
  if (num === null) {
    if (_countdownLastNum !== null) {
      el.classList.remove('cycle');
      el.textContent = '';
    }
    _countdownLastNum = null;
    return;
  }
  if (num === _countdownLastNum) return;
  _countdownLastNum = num;
  el.textContent = num;
  if (color) {
    // 위(베이스) → 아래(L × 0.5, 명도 50% 어둡게) 그라데이션.
    const darker = _darkenHsl(color, 0.5);
    el.style.backgroundImage = 'linear-gradient(to bottom, ' + color + ' 0%, ' + darker + ' 100%)';
  }
  if (beatSec) el.style.setProperty('--beat-dur', (beatSec / _playbackRate) + 's');
  // 표시 직전 위치 갱신 (윈도우 리사이즈/뷰 전환 등에 의한 좌표 변경 반영)
  _positionCountdown();
  el.classList.remove('cycle');
  void el.offsetWidth;
  el.style.animationPlayState = 'running';
  el.classList.add('cycle');
}
function _updateCountdownFromTime(t) {
  if (!_countdownInfo) return;
  const { beat, beatsPerMeasure, countStartTime, chapterStart } = _countdownInfo;
  if (t >= countStartTime && t < chapterStart) {
    const idx = Math.floor((t - countStartTime) / beat);
    const num = Math.max(1, beatsPerMeasure - idx);
    const color = _COUNTDOWN_COLORS[Math.min(num - 1, _COUNTDOWN_COLORS.length - 1)];
    _setCountdownNumber(num, beat, color);
  } else {
    _setCountdownNumber(null);
  }
}
// 카운트다운을 악보 SVG의 박자표 바로 위, 박자표 왼쪽 끝과 좌측 정렬되도록 배치 (position: fixed).
// 박자표 LEFT X 위치 — airplane viewBox(1210)에서 clippath-1 x=75.444, hans viewBox(1200)에서 박자표 텍스트 좌측 ≈78
// → 둘 다 약 6.2% 지점. transform-origin: left bottom + keyframe의 translate(0, -100%)로
// 요소의 bottom-left가 (left, top) = (박자표 좌측, 악보 SVG 상단)에 정렬됨.
function _positionCountdown() {
  const cd = document.getElementById('countdownNum');
  const scoreSvg = document.querySelector('.perf-score-svg');
  if (!cd || !scoreSvg) return;
  const r = scoreSvg.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;
  cd.style.left = (r.left + r.width * 0.062) + 'px';
  cd.style.top  = r.top + 'px';
}

function _ppUpdateSeek() {
  if (!AudioManager.practice || !AudioManager.practice.duration) return;
  const t   = AudioManager.practice.currentTime;
  const dur = AudioManager.practice.duration;
  if (!_ppSeeking) {
    const seek = document.getElementById('ppSeek');
    if (seek) { seek.value = (t / dur) * 100; _ppSeekRefreshFill(seek); }
  }
  const timeEl = document.getElementById('ppTime');
  if (timeEl) timeEl.textContent = _fmt(t) + ' / ' + _fmt(dur);
}
function _fmt(s) {
  if (!isFinite(s)) return '00:00';
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

function _hlTick() {
  if (!AudioManager.practice || AudioManager.practice.paused) { _hlRAF = null; return; }
  const t = AudioManager.practice.currentTime;
  _ppUpdateSeek();
  _updateCountdownFromTime(t);
  const active = NOTE_TIMELINE.find(n => t >= n.start && t < n.end);
  const newId = active ? active.id : null;
  if (newId !== _hlCur) {
    if (_hlCur) document.getElementById(_hlCur)?.classList.remove('highlight');
    if (newId)  document.getElementById(newId)?.classList.add('highlight');
    _hlCur = newId;
    applyFingering(newId ? (PERF_NOTE_TO_NAME[newId] || null) : null);
  }
  _hlRAF = requestAnimationFrame(_hlTick);
}
function _hlStart() {
  if (!_hlRAF) _hlRAF = requestAnimationFrame(_hlTick);
  const cdEl = document.getElementById('countdownNum');
  if (cdEl) cdEl.style.animationPlayState = 'running';
}
function _hlPause() {
  if (_hlRAF) { cancelAnimationFrame(_hlRAF); _hlRAF = null; }
  const cdEl = document.getElementById('countdownNum');
  if (cdEl) cdEl.style.animationPlayState = 'paused';
}
function _hlStop()  {
  if (_hlRAF) { cancelAnimationFrame(_hlRAF); _hlRAF = null; }
  if (_hlCur) { document.getElementById(_hlCur)?.classList.remove('highlight'); _hlCur = null; }
  resetHoles();
  _setCountdownNumber(null);
}

async function initPractice(songKey) {
  stopPractice();
  const song = SONGS[songKey];
  if (!song) return;
  const wrap = document.querySelector('.score-img-wrap');

  if (_loadedSong !== songKey) {
    if (AudioManager.practice) { AudioManager.practice.pause(); AudioManager.practice = null; }
    NOTE_TIMELINE = []; PERF_NOTE_TO_NAME = {}; PERF_NOTE_TO_LINE = {}; _loadedSong = null;
    wrap.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-light);font-size:14px;font-weight:600">악보 불러오는 중...</div>';
    try {
      const useJson = song.scoreMode === 'json';
      let svgText, syncData, scoreData;
      if (useJson) {
        [syncData, scoreData] = await Promise.all([
          fetch(song.base + 'sync.json').then(r => r.json()),
          fetch(song.base + 'score.json').then(r => r.json()),
        ]);
      } else {
        [svgText, syncData, scoreData] = await Promise.all([
          fetch(song.base + 'score.svg').then(r => r.text()),
          fetch(song.base + 'sync.json').then(r => r.json()),
          fetch(song.base + 'score.json').then(r => r.json()),
        ]);
      }
      wrap.innerHTML = '';
      let svg;
      if (useJson) {
        svg = renderScoreFromJson(scoreData, { keySig: song.keySig, timeSig: song.timeSig });
      } else {
        const tmp = document.createElement('div');
        tmp.innerHTML = _scopeSvgForInject(svgText);
        svg = tmp.querySelector('svg');
      }
      if (svg) { svg.classList.add('perf-score-svg'); wrap.appendChild(svg); }
      if (svg && songKey === 'airplane' && !useJson) _shiftAirplaneLine2(svg);
      const { tl, noteToName, noteToLine, countdownInfo } = _buildPracticeData(syncData, scoreData);
      // hans score.json 의 ly 가 high-octave 음(C5/D5)을 '도'/'레' 로 잘못 표기 → 곡 단위 보정.
      // (소년 한스 노트 시퀀스 상 모든 도/레 가 5옥타브이므로 일괄 치환 안전.)
      // 결과: 악보 아래 계이름 라벨 + 리코더 운지가 모두 NOTES['높은도']/['높은레'] 매핑을 따라감.
      if (songKey === 'hans') {
        Object.keys(noteToName).forEach(id => {
          if (noteToName[id] === '도')      noteToName[id] = '높은도';
          else if (noteToName[id] === '레') noteToName[id] = '높은레';
        });
      }
      NOTE_TIMELINE = tl; PERF_NOTE_TO_NAME = noteToName; PERF_NOTE_TO_LINE = noteToLine; _loadedSong = songKey; _scoreData = scoreData;
      _countdownInfo = countdownInfo;
      // 곡 로드 시점에 항상 계이름 그룹을 빌드해서 viewBox를 미리 확장 → 토글 시 악보 y가 흔들리지 않음.
      // _buildNoteLabels는 그룹을 display:none으로 만들어 두므로 OFF 상태에선 안 보이고 공간만 확보됨.
      const _oldNoteLabel = document.querySelector('#noteLabelGroup');
      if (_oldNoteLabel) _oldNoteLabel.remove();
      _buildNoteLabels();
      const _newNoteLabel = document.getElementById('noteLabelGroup');
      if (_newNoteLabel) _newNoteLabel.classList.toggle('is-hidden', !_noteLabelVisible);
    } catch (e) {
      wrap.innerHTML = '<div class="practice-error">악보를 불러올 수 없어요.<br>네트워크를 확인해 주세요.</div>';
      return;
    }
  }

  const titleBar = document.getElementById('scoreTitleBar');
  if (titleBar) {
    document.getElementById('scoreTitle').textContent    = song.title;
    document.getElementById('scoreTempoText').textContent = song.tempo;
    document.getElementById('scoreComposer').textContent = song.composer;
    titleBar.style.display = '';
  }

  const slot = document.getElementById('practiceRecorderSlot');
  if (slot && !slot.querySelector('svg')) {
    const orig = document.getElementById('recorderSvg');
    if (orig) {
      const clone = orig.cloneNode(true);
      clone.removeAttribute('id');
      const idMap = {};
      clone.querySelectorAll('[id]').forEach(el => {
        if (!HOLES.includes(el.id)) { idMap[el.id] = 'pr_' + el.id; el.id = 'pr_' + el.id; }
      });
      clone.querySelectorAll('*').forEach(el => {
        ['fill','stroke','clip-path','filter','mask'].forEach(attr => {
          const v = el.getAttribute(attr);
          if (v) { const u = v.replace(/url\(#([^)]+)\)/g, (_, id) => 'url(#' + (idMap[id] || id) + ')'); if (u !== v) el.setAttribute(attr, u); }
        });
        ['xlink:href','href'].forEach(attr => {
          const v = el.getAttribute(attr);
          if (v && v[0] === '#') { const id = v.slice(1); if (idMap[id]) el.setAttribute(attr, '#' + idMap[id]); }
        });
      });
      clone.querySelectorAll('style').forEach(s => {
        s.textContent = s.textContent
          .replace(/url\(#([^)]+)\)/g, (_, id) => 'url(#' + (idMap[id] || id) + ')')
          .replace(/\bcls-(\d+)/g, 'pr-cls-$1');
      });
      clone.querySelectorAll('[class]').forEach(el => {
        const cls = el.getAttribute('class');
        if (cls) el.setAttribute('class', cls.replace(/\bcls-(\d+)/g, 'pr-cls-$1'));
      });
      HOLES.forEach(hid => { const h = clone.querySelector('#' + hid); if (h) h.id = 'pr_' + hid; });
      slot.appendChild(clone);
    }
  }
  // 타임코드 갱신: 같은 곡 재진입(quiz/learn → practice) 시에도 duration 반영
  const _ppTimeEl = document.getElementById('ppTime');
  if (_ppTimeEl) {
    if (AudioManager.practice && AudioManager.practice.duration) {
      _ppTimeEl.textContent = _fmt(AudioManager.practice.currentTime || 0) + ' / ' + _fmt(AudioManager.practice.duration);
    } else {
      const _metaAudio = new Audio(song.base + 'song.mp3');
      _metaAudio.preload = 'metadata';
      _metaAudio.addEventListener('loadedmetadata', () => {
        const el = document.getElementById('ppTime');
        if (el && _loadedSong === songKey) el.textContent = _fmt(0) + ' / ' + _fmt(_metaAudio.duration);
      }, { once: true });
    }
  }
  resetHoles();
  _setupPracticeResizeObserver();
  _syncRecorderHeight();
  _syncTitleFontSize();
}

let _noteLabelVisible = true;   // 디폴트: 계이름 ON (악보 진입 시 라벨 표시)
function toggleNoteLabel() {
  _noteLabelVisible = !_noteLabelVisible;
  const btn = document.getElementById('ppNoteLabel');
  // 버튼 텍스트는 "다음 액션" 기준 표기:
  //   현재 ON 상태  → "계이름 OFF" (클릭 시 끔)
  //   현재 OFF 상태 → "계이름 ON"  (클릭 시 켬)
  if (btn) btn.textContent = _noteLabelVisible ? '계이름 OFF' : '계이름 ON';
  if (_noteLabelVisible) _buildNoteLabels();
  const g = document.getElementById('noteLabelGroup');
  if (g) g.classList.toggle('is-hidden', !_noteLabelVisible);
}
function _buildNoteLabels() {
  const svg = document.querySelector('.perf-score-svg');
  if (!svg || svg.querySelector('#noteLabelGroup')) return;
  const NS = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(NS, 'g');
  g.id = 'noteLabelGroup';
  g.setAttribute('font-family', "'Pretendard',-apple-system,sans-serif");
  g.setAttribute('font-size', '32');
  g.setAttribute('font-weight', '600');
  g.setAttribute('text-anchor', 'start');
  g.setAttribute('dominant-baseline', 'hanging');
  g.style.fill = 'var(--text)';

  // 음표별 getBBox 수집
  const bboxMap = {};
  Object.keys(PERF_NOTE_TO_NAME).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    try { bboxMap[id] = el.getBBox(); } catch(e) {}
  });

  // 줄 인덱스: score.json LineSets 기반(PERF_NOTE_TO_LINE) 사용 — N줄 일반화.
  // PERF_NOTE_TO_LINE 가 비어있을 경우(데이터 누락)에만 yCenter 가장 큰 gap 기준 2줄 분할로 폴백.
  const ids = Object.keys(bboxMap);
  const hasLineInfo = ids.some(id => PERF_NOTE_TO_LINE[id] !== undefined);
  const noteToLine = {};
  if (hasLineInfo) {
    ids.forEach(id => { noteToLine[id] = PERF_NOTE_TO_LINE[id] ?? 0; });
  } else {
    const yCenters = ids.map(id => bboxMap[id].y + bboxMap[id].height / 2);
    const sorted = [...yCenters].sort((a, b) => a - b);
    let splitY = sorted[sorted.length - 1];
    let maxGap = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i] - sorted[i - 1];
      if (gap > maxGap) { maxGap = gap; splitY = (sorted[i - 1] + sorted[i]) / 2; }
    }
    ids.forEach((id, i) => { noteToLine[id] = yCenters[i] <= splitY ? 0 : 1; });
  }

  // 줄별 최저 하단 y 산출
  // perf-note 그룹(hans JSON 렌더)은 getBBox()가 기둥(stem)까지 포함해 lineMaxBottom 이
  // 과도하게 내려가므로, 첫 번째 자식(note head ellipse)의 bottom Y만 사용.
  // airplane 등 외부 SVG 요소는 perf-note 클래스가 없어 기존 방식 그대로 동작.
  const lineMaxBottom = {};
  ids.forEach(id => {
    const bb = bboxMap[id];
    const li = noteToLine[id];
    const noteEl = document.getElementById(id);
    let bot = bb.y + bb.height;
    if (noteEl && noteEl.classList.contains('perf-note') && noteEl.firstElementChild) {
      try { const hbb = noteEl.firstElementChild.getBBox(); bot = hbb.y + hbb.height; } catch(e) {}
    }
    if (lineMaxBottom[li] === undefined || bot > lineMaxBottom[li]) lineMaxBottom[li] = bot;
  });

  // 줄별 동일 y에 계이름 배치
  Object.entries(PERF_NOTE_TO_NAME).forEach(([id, name]) => {
    const bb = bboxMap[id];
    if (!bb) return;
    const li = noteToLine[id] ?? 0;
    const noteEl = document.getElementById(id);
    const extraShift = (noteEl && noteEl.dataset.line2 === '1') ? 60 : 0;
    const labelY = (lineMaxBottom[li] ?? bb.y + bb.height) + PRACTICE_SVG.NOTE_LABEL_GAP + extraShift;
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', bb.x);
    text.setAttribute('y', labelY);
    // 악보 아래 라벨은 '높은' prefix 생략 — 운지/내부 매핑은 PERF_NOTE_TO_NAME 의 원본 키('높은도'/'높은레')를 그대로 사용하지만,
    // 시각 라벨은 옥타브 정보 없이 음 이름만 노출.
    text.textContent = name.replace(/^높은\s*/, '');
    g.appendChild(text);
  });

  svg.appendChild(g);

  // viewBox 확장: 계이름 텍스트가 잘리지 않도록
  try {
    const vb = svg.viewBox.baseVal;
    const gbb = g.getBBox();
    const newBottom = gbb.y + gbb.height + 10;
    if (newBottom > vb.y + vb.height) {
      svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${newBottom - vb.y}`);
    }
  } catch(e) {}

  // viewBox 확장(위 getBBox)을 측정한 "뒤"에 숨김 처리.
  // display:none(is-hidden) 상태에서 getBBox 를 부르면 0 을 반환(특히 모바일 WebKit)해
  // 확장이 실패하고 계이름 라벨이 viewBox 밖으로 잘리기 때문 — 반드시 측정 후에 숨길 것.
  // 표시 여부는 호출부에서 _noteLabelVisible 기준으로 다시 토글함.
  g.classList.add('is-hidden');
}

let _currentPracticeView = null;
let _practiceResizeObs = null;
let _titleFontLastW = 0;

function _syncTitleFontSize() {
  const scoreSvg = document.querySelector('.perf-score-svg');
  if (!scoreSvg) return;
  const w = scoreSvg.getBoundingClientRect().width;
  if (!w) return;
  // hysteresis 2px: titleBar.padding round step 으로 만들어지는 svgW 진동 흡수
  // (titleBar.height → availH → scoreSvg.W → 다시 여기 → titleBar.height의 피드백 루프 차단)
  if (Math.abs(w - _titleFontLastW) < 2) return;
  _titleFontLastW = w;
  const main     = document.getElementById('scoreTitle');
  const tempo    = document.getElementById('scoreTempo');
  const composer = document.getElementById('scoreComposer');
  if (main)     main.style.fontSize     = Math.round(w * PRACTICE_SVG.TITLE_FONT_RATIO) + 'px';
  if (tempo)    tempo.style.fontSize    = Math.round(w * PRACTICE_SVG.TEMPO_FONT_RATIO) + 'px';
  if (composer) composer.style.fontSize = Math.round(w * PRACTICE_SVG.TEMPO_FONT_RATIO) + 'px';
  // 카운트다운 숫자 — 1920×1080(SVG w≈1146) 기준 100px 가시 사이즈에 맞춰 비율 0.087.
  const countdown = document.getElementById('countdownNum');
  if (countdown) countdown.style.fontSize = Math.round(w * PRACTICE_SVG.COUNTDOWN_FONT_RATIO) + 'px';
  // 곡 템포/작곡가가 악보 SVG의 좌우 끝과 정렬되도록 title-bar 너비를 SVG 렌더 너비와 동기화
  // padding도 SVG 너비 기준으로 실시간 가변 (1920×1080 기준 32px → 비율 환산).
  // 비율 산출 근거: 메인 폰트 0.0384 비율과 같은 baseline w=44/0.0384≈1146px 사용.
  //   padding-top/bottom 32 / 1146 ≈ 0.0279
  const titleBar = document.getElementById('scoreTitleBar');
  if (titleBar) {
    titleBar.style.width = w + 'px';
    const padY = Math.round(w * 0.0279) + 'px';
    titleBar.style.paddingTop    = padY;
    titleBar.style.paddingBottom = padY;
  }
  // SVG 크기 변경 후 카운트다운 위치도 동기화
  _positionCountdown();
  // legend(왼손/오른손/열기/닫기) 사이즈는 _syncLegendSize에서 별도 처리
}

/* ── 연습하기 탭 legend(왼손/오른손/열기/닫기) 텍스트·원형·간격 동기화 ──
   1) 텍스트는 뷰포트 기준 비례(1920에서 18px, 최소 14px)로 계산하되
      리코더 SVG 내 숫자 텍스트(viewBox에서 font-size=22, viewBoxH=722.994)의
      실제 렌더 px(=22 × recH / 722.994)를 상한으로 캡 → 숫자보다 커지지 않음.
   2) 원형(.legend-circle)은 텍스트와 비례(1920 기준 18px 텍스트 ↔ 12px 원형 = ratio 0.6875)
      유지, 최소 8px.
   3) .hand-legend gap, .legend gap/padding도 텍스트 비율 기반으로 같이 가변
      (1920 baseline: hand-legend gap 16px=0.875, legend gap 11px=0.625, padding 9/16px=0.5/0.875). */
function _syncLegendSize() {
  if (_currentPracticeView === 'score') return;
  const recPanel = document.getElementById('practiceRecPanel');
  if (!recPanel) return;
  const vpFontPx = Math.max(RECORDER_SVG.LEGEND_FONT_MIN, window.innerWidth * RECORDER_SVG.LEGEND_FONT_AT_1920 / 1920);
  let numberPx = Infinity;
  const recSvg = document.querySelector('#practiceRecorderSlot svg');
  if (recSvg) {
    const recH = recSvg.getBoundingClientRect().height;
    if (recH > 0) numberPx = RECORDER_SVG.HOLE_LABEL_FONT * (recH / RECORDER_SVG.VIEW_H);
  }
  const legendFontPx = Math.min(vpFontPx, numberPx);
  // 진동 방지 hysteresis: 직전 적용 값(정수)과 새 계산값(부동소수)의 차이가 1px 미만이면 스킵.
  // legend 폰트 → panel-top 높이 → recorder-wrap 높이 → recSvg 높이 → numberPx → legend 폰트
  // 의 피드백 루프에서 Math.round 경계 미세 흔들림이 두 정수 사이를 왔다 갔다 하는 것을 흡수.
  const _legendSample = recPanel.querySelector('.hand-legend');
  const _curFontPx = _legendSample ? parseFloat(_legendSample.style.fontSize) : 0;
  if (_curFontPx > 0 && Math.abs(legendFontPx - _curFontPx) < 1) return;
  const fontStr = legendFontPx + 'px';

  // .hand-legend (왼손/오른손) — gap 14px @ 1920 → ratio 0.875
  const handGap = Math.round(legendFontPx * 0.875) + 'px';
  recPanel.querySelectorAll('.hand-legend').forEach(el => {
    el.style.fontSize = fontStr;
    el.style.gap = handGap;
  });
  // .legend (열기/닫기) — gap 10px(0.625), padding 8px 14px(0.5 / 0.875)
  const legGap  = Math.round(legendFontPx * 0.625) + 'px';
  const legPadV = Math.round(legendFontPx * 0.5) + 'px';
  const legPadH = Math.round(legendFontPx * 0.875) + 'px';
  recPanel.querySelectorAll('.legend').forEach(el => {
    el.style.fontSize = fontStr;
    el.style.gap = legGap;
    el.style.padding = legPadV + ' ' + legPadH;
  });

  // 원형 = 텍스트 × 0.6875 (1920 기준 11/16 비율 유지), 최소 8px
  const circleSize = Math.max(8, Math.round(legendFontPx * 0.6875)) + 'px';
  recPanel.querySelectorAll('.legend-circle').forEach(el => {
    el.style.width  = circleSize;
    el.style.height = circleSize;
  });
}

/* ── [악보] 단독 뷰: 비율 고정으로 가용 영역 안에 최대 크기로 맞춤 ──
   너비 또는 높이 중 먼저 닿는 쪽에 맞춰 sizing → 다른 축은 비율로 결정.
   가로 제약이면 SVG가 wrap 가로폭을 다 차지하고, 세로 여유는 auto-margin이 흡수해 세로 중앙 정렬.
   세로 제약이면 SVG가 가용 세로를 다 차지하고, 가로 여유는 .score-img-wrap의 justify-content:center로 수평 중앙 정렬. */
let _scoreOnlyLastW = 0;
function _syncScoreOnlySize() {
  if (_currentPracticeView !== 'score') return;
  const scoreSvg   = document.querySelector('.perf-score-svg');
  const scorePanel = document.getElementById('practiceScorePanel');
  const scoreWrap  = document.querySelector('#practiceScorePanel .score-img-wrap');
  const scoreTop   = document.querySelector('#practiceScorePanel .practice-score-top');
  const titleBar   = document.getElementById('scoreTitleBar');
  if (!scoreSvg || !scorePanel || !scoreWrap) return;
  const vb = scoreSvg.viewBox.baseVal;
  if (!vb || !vb.width || !vb.height) return;
  const aspect = vb.height / vb.width;  // height/width

  // 가용 가로: score-img-wrap의 콘텐츠 영역 너비
  const wrapCs = getComputedStyle(scoreWrap);
  const wrapPadX = parseFloat(wrapCs.paddingLeft) + parseFloat(wrapCs.paddingRight);
  const availW = scoreWrap.clientWidth - wrapPadX;

  // 가용 세로: 패널 콘텐츠 - 패널 padding-bottom - score-top - title-bar - wrap의 세로 패딩
  const panelCs = getComputedStyle(scorePanel);
  const panelPadBottom = parseFloat(panelCs.paddingBottom);
  const panelInnerH = scorePanel.clientHeight - panelPadBottom;
  const scoreTopH = scoreTop ? scoreTop.getBoundingClientRect().height : 0;
  const titleBarH = titleBar ? titleBar.getBoundingClientRect().height : 0;
  const wrapPadY = parseFloat(wrapCs.paddingTop) + parseFloat(wrapCs.paddingBottom);
  const availH = panelInnerH - scoreTopH - titleBarH - wrapPadY;

  if (availW <= 0 || availH <= 0) return;

  // 비율 고정으로 영역 안 최대 크기 (가로/세로 중 먼저 닿는 쪽 기준)
  let svgW;
  if (availW * aspect <= availH) {
    svgW = availW;          // 가로 제약: 가로 꽉 채우기
  } else {
    svgW = availH / aspect; // 세로 제약: 세로 꽉 채우고 가로는 비율로
  }
  // floor: SVG 가 wrap 보다 sub-pixel 더 커지면서 overflow-y:auto 가 깜빡이는 것을 차단.
  // 2px hysteresis: titleBar padding round step (~36px 마다 1px) 으로 발생하는
  //   svgW 진동(amplitude = round step × aspect, hans 는 airplane 보다 aspect 가 작아 더 큼)을 흡수.
  // 진동 경로: scoreSvg.width → titleBar.width(_syncTitleFontSize) → titleBar.height → availH → svgW
  svgW = Math.floor(svgW);
  if (Math.abs(svgW - _scoreOnlyLastW) < 2) return;
  _scoreOnlyLastW = svgW;
  scoreSvg.style.width = svgW + 'px';
  scoreSvg.style.maxWidth = '100%';
  scoreSvg.style.maxHeight = '';
}

/* ── [리코더] 단독 뷰: 비율 고정으로 가용 영역 안에 최대 크기로 맞춤 ──
   [악보] 탭과 동일한 fit-with-aspect 전략. recorder-wrap의 가용 영역 안에서
   가로/세로 중 먼저 닿는 쪽 기준으로 sizing → 다른 축은 viewBox 비율로 결정.
   (가운데 정렬은 .recorder-wrap의 justify-content:center / align-items:center가 처리) */
let _recOnlyLastW = 0;
function _syncRecorderOnlySize() {
  if (_currentPracticeView !== 'recorder') return;
  const recSvg  = document.querySelector('#practiceRecorderSlot svg');
  const recWrap = document.querySelector('#practiceRecPanel .recorder-wrap');
  const recTop  = document.querySelector('#practiceRecPanel .recorder-panel-top');
  if (!recSvg || !recWrap) return;
  // 리코더 단독 뷰에서만, recorder-panel-top 높이만큼 recorder-wrap 하단에 여백 추가 (시각적 균형)
  // padding-top은 0으로 처리 — 리코더 SVG 윗 여유는 recorder-panel-top legend가 이미 차지함
  recWrap.style.paddingTop = '0px';
  if (recTop) {
    const topH = recTop.getBoundingClientRect().height;
    if (topH > 0) recWrap.style.paddingBottom = topH + 'px';
  }
  const vb = recSvg.viewBox.baseVal;
  if (!vb || !vb.width || !vb.height) return;
  const aspect = vb.height / vb.width;  // height/width

  const wrapCs = getComputedStyle(recWrap);
  const wrapPadX = parseFloat(wrapCs.paddingLeft) + parseFloat(wrapCs.paddingRight);
  const wrapPadY = parseFloat(wrapCs.paddingTop)  + parseFloat(wrapCs.paddingBottom);
  const availW = recWrap.clientWidth  - wrapPadX;
  const availH = recWrap.clientHeight - wrapPadY;

  if (availW <= 0 || availH <= 0) return;

  let svgW;
  if (availW * aspect <= availH) {
    svgW = availW;          // 가로 제약: 가로 꽉 채우기
  } else {
    svgW = availH / aspect; // 세로 제약: 세로 꽉 채우고 가로는 비율로
  }
  // floor + 2px hysteresis: sub-pixel 진동/round step 진동 흡수 (_syncScoreOnlySize 와 동일 사유)
  svgW = Math.floor(svgW);
  if (Math.abs(svgW - _recOnlyLastW) < 2) return;
  _recOnlyLastW = svgW;
  // CSS의 height:100% / width:auto를 인라인으로 덮어 쓰기 위해 명시적으로 둘 다 지정
  recSvg.style.width  = svgW + 'px';
  recSvg.style.height = (svgW * aspect) + 'px';
  recSvg.style.maxWidth  = '';
  recSvg.style.maxHeight = '';
}

let _recHeightLastMax = 0;
function _syncRecorderHeight() {
  if (_currentPracticeView !== 'both') return;
  const recSvg  = document.querySelector('#practiceRecorderSlot svg');
  const recWrap = document.querySelector('#practiceRecPanel .recorder-wrap');
  if (!recSvg || !recWrap) return;
  // (1) 가로 캡: 리코더 wrap 너비 × SVG 종횡비(722.994/130 ≈ 5.56)
  const w = recWrap.getBoundingClientRect().width;
  const maxByRec = w * PRACTICE_SVG.REC_ASPECT;
  // (2) 가로 캡: 악보 wrap 내부 너비. 악보 SVG width = recH × 1.6 이므로 recH ≤ innerW / 1.6
  const scoreWrap  = document.querySelector('#practiceScorePanel .score-img-wrap');
  const scorePanel = document.getElementById('practiceScorePanel');
  const scoreTop   = document.querySelector('#practiceScorePanel .practice-score-top');
  const titleBar   = document.getElementById('scoreTitleBar');
  const scoreSvgEl = document.querySelector('.perf-score-svg');
  let maxByScoreW = Infinity;
  if (scoreWrap) {
    const cs = getComputedStyle(scoreWrap);
    const innerW = scoreWrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (innerW > 0) maxByScoreW = innerW / PRACTICE_SVG.SCORE_W_PER_REC_H;
  }
  // (3) 세로 캡: 악보 패널의 SVG 가용 세로 → scoreH = recH × 1.6 / scoreAspect ≤ availH
  //   → recH ≤ availH × scoreAspect / 1.6  (세로가 짧을 때 recH·scoreH 동시 축소)
  let maxByScoreH = Infinity;
  if (scoreWrap && scorePanel && scoreSvgEl && scoreSvgEl.viewBox && scoreSvgEl.viewBox.baseVal) {
    const vb = scoreSvgEl.viewBox.baseVal;
    if (vb.width > 0 && vb.height > 0) {
      const wrapCs  = getComputedStyle(scoreWrap);
      const panelCs = getComputedStyle(scorePanel);
      const panelInnerH = scorePanel.clientHeight - parseFloat(panelCs.paddingTop) - parseFloat(panelCs.paddingBottom);
      const scoreTopH = scoreTop ? scoreTop.getBoundingClientRect().height : 0;
      const titleBarH = titleBar ? titleBar.getBoundingClientRect().height : 0;
      const wrapPadY  = parseFloat(wrapCs.paddingTop) + parseFloat(wrapCs.paddingBottom);
      const availH = panelInnerH - scoreTopH - titleBarH - wrapPadY;
      if (availH > 0) {
        const scoreAspect = vb.width / vb.height;
        maxByScoreH = availH * scoreAspect / 1.6;
      }
    }
  }
  // (4) 세로 캡: 리코더 패널의 가용 세로 → recH 직접 한계
  let maxByRecH = Infinity;
  const recPanel    = document.getElementById('practiceRecPanel');
  const recPanelTop = document.querySelector('#practiceRecPanel .recorder-panel-top');
  if (recPanel) {
    const panelCs = getComputedStyle(recPanel);
    const wrapCs  = getComputedStyle(recWrap);
    const panelInnerH = recPanel.clientHeight - parseFloat(panelCs.paddingTop) - parseFloat(panelCs.paddingBottom);
    const topH = recPanelTop ? recPanelTop.getBoundingClientRect().height : 0;
    const wrapPadY = parseFloat(wrapCs.paddingTop) + parseFloat(wrapCs.paddingBottom);
    const avail = panelInnerH - topH - wrapPadY;
    if (avail > 0) maxByRecH = avail;
  }

  // floor + 2px hysteresis: scoreSvg.width = recH × 1.6 으로 묶여 있어, recH 변동이
  // scoreSvg 너비로 1.6 배 증폭되어 titleBar.padding round step 진동을 일으킴 →
  // 보수적으로 floor 후 2px 미만 차이는 스킵.
  const newMax = Math.floor(Math.min(maxByRec, maxByScoreW, maxByScoreH, maxByRecH));
  if (Math.abs(newMax - _recHeightLastMax) < 2) return;
  _recHeightLastMax = newMax;
  recSvg.style.maxHeight = newMax + 'px';
  // 악보 SVG width = 리코더 height × 1.6 (모든 곡 동일 규칙)
  // 패널이 더 넓으면 score-img-wrap / recorder-wrap의 justify-content:center로 중앙 정렬됨
  const recH = recSvg.getBoundingClientRect().height;
  if (recH > 0) {
    if (scoreSvgEl) {
      scoreSvgEl.style.width = (recH * PRACTICE_SVG.SCORE_W_PER_REC_H) + 'px';
      scoreSvgEl.style.maxWidth = '100%';
      scoreSvgEl.style.maxHeight = '';
    }
    // 이전 cap 잔여값 정리
    if (titleBar) titleBar.style.maxHeight = '';
  }
}

// rAF 디바운스 큐: 짧은 시간 안에 여러 번 호출돼도 다음 프레임에 sync 체인을 한 번만 실행.
let _practicePerfSyncRAF = null;
function _practicePerfSyncRun() {
  _practicePerfSyncRAF = null;
  // sync 체인 1패스는 self-consistent 가 아님:
  //   _syncScoreOnlySize 가 stale titleBar.height 로 svgW 계산 → _syncTitleFontSize 가
  //   새 svgW 로 titleBar 갱신 → 다음 sync 시점엔 새 titleBar.h 반영된 svgW 가 다시 필요.
  // 3패스로 한 프레임 안에서 수렴시킴 (RO 가 더 이상 내부 변화를 catch 하지 않으므로 안전).
  // 패스 수 = "최악의 round step 진동 사이클 길이 + 1 마진". 2 로는 1~2패스 진동이 남을 수 있어 3 채택.
  for (let pass = 0; pass < 3; pass++) {
    _syncRecorderHeight();    // 'both' 모드 sizing
    _syncScoreOnlySize();     // 'score' 단독 모드 악보 sizing
    _syncRecorderOnlySize();  // 'recorder' 단독 모드 리코더 sizing
    _syncTitleFontSize();     // 위 sizing 결과를 반영해 title-bar 너비/폰트/패딩 동기화
    _syncLegendSize();
  }
}
function _practicePerfSyncSchedule() {
  if (_practicePerfSyncRAF !== null) return;
  _practicePerfSyncRAF = requestAnimationFrame(_practicePerfSyncRun);
}

// .practice-content 의 직전 사이즈 — RO 콜백에서 외부 vs 내부(피드백) 변화를 구분하는 기준.
const _lastPracticeContentSize = { w: 0, h: 0 };
function _setupPracticeResizeObserver() {
  // 이전 옵저버 해제 후 재설정 (곡 전환 시 새 SVG 감시 컨텍스트 리셋)
  if (_practiceResizeObs) { _practiceResizeObs.disconnect(); _practiceResizeObs = null; }
  // 새 곡 로드 시 hysteresis / 외부 사이즈 캐시 리셋
  _scoreOnlyLastW = 0;
  _recOnlyLastW = 0;
  _recHeightLastMax = 0;
  _titleFontLastW = 0;
  _lastPracticeContentSize.w = 0;
  _lastPracticeContentSize.h = 0;
  if (typeof ResizeObserver === 'undefined') return;
  const content = document.querySelector('.practice-content');
  if (!content) return;
  // 외부 컨테이너(.practice-content) 한 곳만 감시 → 내부 sync 가 만들어내는 score-img-wrap /
  // recorder-wrap / scoreSvg / recSvg 의 height 변화는 RO 를 깨우지 않음. 이로써 sync 체인이
  // 자기 자신을 무한 재트리거하는 피드백 루프가 원천 차단됨.
  // viewport 변화 / 25-75 비율 변화 / 하단바 변화 등 모든 "외부" 트리거는 .practice-content 의
  // clientWidth/Height 에 그대로 반영되므로 감시 누락 없음.
  // 추가로 W/H 변화량 1px 미만은 무시 (sub-pixel 진동 컷).
  _practiceResizeObs = new ResizeObserver(() => {
    const w = content.clientWidth;
    const h = content.clientHeight;
    if (Math.abs(w - _lastPracticeContentSize.w) < 1 &&
        Math.abs(h - _lastPracticeContentSize.h) < 1) return;
    _lastPracticeContentSize.w = w;
    _lastPracticeContentSize.h = h;
    _practicePerfSyncSchedule();
  });
  _practiceResizeObs.observe(content);
}

function setPracticeView(mode, fromResize = false) {
  if (window.innerWidth <= 767 && mode === 'both') mode = 'score';
  // 사용자가 모바일에서 직접 뷰를 바꿨을 때 → 데스크탑 복원 취소
  if (!fromResize && window.innerWidth <= 767 && typeof _pracViewBeforeMobile !== 'undefined') {
    _pracViewBeforeMobile = null;
  }
  // 같은 뷰 재클릭 시 캐시 리셋 + sync 재실행이 진동을 유발하므로 early return
  // (클래스/active 상태는 이미 같은 모드라 동기화되어 있음)
  if (_currentPracticeView === mode) return;
  _currentPracticeView = mode;
  document.getElementById('pvtBoth').classList.toggle('active',  mode === 'both');
  document.getElementById('pvtScore').classList.toggle('active', mode === 'score');
  document.getElementById('pvtRec').classList.toggle('active',   mode === 'recorder');
  document.getElementById('practiceScorePanel').classList.toggle('hidden', mode === 'recorder');
  document.getElementById('practiceRecPanel').classList.toggle('hidden',   mode === 'score');
  const content = document.querySelector('.practice-content');
  if (content) {
    content.classList.toggle('view-both',     mode === 'both');
    content.classList.toggle('view-score',    mode === 'score');
    content.classList.toggle('view-recorder', mode === 'recorder');
  }
  // 모드 전환 시 리코더 SVG 인라인 sizing 초기화
  // ('both'는 CSS height:100%+max-height 인라인 사용, 'recorder'는 width/height 인라인 사용 →
  //  모드마다 적용 방식이 달라 잔여 인라인이 충돌하지 않도록 매 전환마다 클린)
  const _recSvgEl = document.querySelector('#practiceRecorderSlot svg');
  if (_recSvgEl) {
    _recSvgEl.style.maxHeight = '';
    _recSvgEl.style.height = '';
    _recSvgEl.style.width = '';
  }
  // 뷰 전환 시 scoreSvg 인라인 sizing도 초기화 (이전 뷰에서 설정한 width/maxHeight 잔재 제거)
  const _scoreSvgEl = document.querySelector('.perf-score-svg');
  if (_scoreSvgEl) {
    _scoreSvgEl.style.width = '';
    _scoreSvgEl.style.maxWidth = '';
    _scoreSvgEl.style.maxHeight = '';
  }
  // recorder 단독 뷰에서만 적용한 paddingTop/Bottom 인라인을 다른 모드 전환 시 초기화 (view-both 보호)
  if (mode !== 'recorder') {
    const _recWrapEl = document.querySelector('#practiceRecPanel .recorder-wrap');
    if (_recWrapEl) {
      _recWrapEl.style.paddingTop = '';
      _recWrapEl.style.paddingBottom = '';
    }
  }
  // 뷰 전환 시 sync 함수의 hysteresis 캐시 리셋 (이전 뷰에서 캐시된 값이 현재 뷰의 첫 sync를 스킵하지 않도록)
  _scoreOnlyLastW = 0;
  _recOnlyLastW = 0;
  _recHeightLastMax = 0;
  _titleFontLastW = 0;

  if (mode === 'both') {
    // sync 체인: sizing → title-bar 동기화 → 다시 sizing(수렴) → title-bar 재동기화(최종 매칭).
    // 마지막 _syncTitleFontSize 가 빠지면 titleBar.width = pass1 svgW 인데 scoreSvg.width = pass2 svgW 가
    // 되어 두 값이 다르면 tempo/composer 가 SVG 좌우 끝과 어긋남.
    _syncRecorderHeight();
    _syncTitleFontSize();   // SVG 너비 변경 후 title-bar 동기화
    _syncRecorderHeight();  // title-bar 높이 변화 반영해서 한 번 더 (수렴)
    _syncTitleFontSize();   // 최종 svgW 에 title-bar 너비 매칭 (양끝 정렬 보장)
  } else if (mode === 'score') {
    // 악보 단독: 비율 고정으로 가용 영역 안 최대 크기로 맞춤.
    // 마지막 _syncTitleFontSize 로 titleBar.width = 최종 svgW 보장 → 직전 모드와 무관하게 SVG 좌우 끝 정렬.
    _syncScoreOnlySize();
    _syncTitleFontSize();   // SVG 너비 변경 후 title-bar 동기화
    _syncScoreOnlySize();   // title-bar 높이 변화 반영해서 한 번 더 (수렴)
    _syncTitleFontSize();   // 최종 svgW 에 title-bar 너비 매칭 (양끝 정렬 보장)
  } else {
    // 리코더 단독: 비율 고정으로 가용 영역 안 최대 크기로 맞춤
    _syncRecorderOnlySize();
  }
  // 모든 뷰에서 legend 텍스트/원형 재계산 (view-recorder에서도 cap 적용)
  _syncLegendSize();
}

function setPracticeSong(song) {
  document.querySelectorAll('.subtab').forEach((t, i) => {
    t.classList.toggle('active', (i===0 && song==='airplane') || (i===1 && song==='hans'));
  });
  const known = !!SONGS[song];
  document.getElementById('practiceStage').style.display    = known ? 'flex' : 'none';
  document.getElementById('comingSoonStage').style.display  = known ? 'none' : 'flex';
  const titleBar = document.getElementById('scoreTitleBar');
  if (titleBar) titleBar.style.display = known ? '' : 'none';
  _currentPracticeSong = song;
  // 별 게이지 초기화
  PRACTICE_STARS[song] = 0;
  _renderPracticeStars(song);
  // 계이름 상태를 ON 으로 초기화 (디폴트). 버튼 텍스트는 액션 기준 "계이름 OFF" (끄려면 클릭).
  _noteLabelVisible = true;
  const noteBtn = document.getElementById('ppNoteLabel');
  if (noteBtn) noteBtn.textContent = '계이름 OFF';
  const noteGroup = document.getElementById('noteLabelGroup');
  if (noteGroup) noteGroup.classList.remove('is-hidden');
  // 배속 초기화 (x1.0)
  _ppSetRate(1.0);
  // 볼륨 초기화 (0.8 / 80%)
  volume = 0.8; _mutedVol = 0.8;
  const ppSlider = document.getElementById('ppVolSlider');
  if (ppSlider) { ppSlider.value = 0.8; _ppSeekRefreshFill(ppSlider); }
  _ppUpdateVolIcon();
  // 플레이어 바(재생/정지/seek/시간) 초기화 — 이전 곡의 재생 상태/위치가 잔존하지 않도록.
  updatePlayButtons(false);                                // ▶ 상태로
  const seek = document.getElementById('ppSeek');
  if (seek) { seek.value = 0; _ppSeekRefreshFill(seek); }  // seek 바 0
  const timeEl = document.getElementById('ppTime');
  if (timeEl) timeEl.textContent = _fmt(0) + ' / ' + _fmt(0); // 00:00 / 00:00
  // 항상 [악보+리코더] 서브뷰로 초기화 (모바일에서는 score로 가드됨)
  // fromResize=true 로 호출해 _pracViewBeforeMobile 을 초기화하지 않음
  // (모바일에서 곡 전환 시 "desktop 복원 예약"이 지워지는 문제 방지)
  if (known) setPracticeView('both', true);
  if (known) initPractice(song);
  else stopPractice();
  // 모바일 곡 선택 바 동기화
  const mobileAirplane = document.getElementById('mobileSongAirplane');
  const mobileHans     = document.getElementById('mobileSongHans');
  if (mobileAirplane && mobileHans) {
    mobileAirplane.classList.toggle('active', song === 'airplane');
    mobileHans.classList.toggle('active',     song === 'hans');
  }
}

/* ── 연습하기 별 게이지 ── */
const PRACTICE_STARS = { airplane: 0, hans: 0 };
let _currentPracticeSong = 'airplane';
const _STAR_OUTER = 'M10.1011 2.3961C10.5777 1.77363 11.1669 1.25 12 1.25C12.8331 1.25 13.4223 1.77363 13.899 2.3961C14.3674 3.00773 14.864 3.89876 15.471 4.98776L15.8296 5.63106C16.2222 6.33523 16.3226 6.48482 16.4486 6.58044C16.5698 6.67247 16.7262 6.7238 17.4896 6.89654L18.1897 7.05492C19.3653 7.32088 20.3338 7.53999 21.0392 7.81796C21.7714 8.10651 22.4121 8.5318 22.6588 9.32502C22.9029 10.1101 22.6285 10.8323 22.2045 11.5059C21.7925 12.1604 21.1344 12.9298 20.3306 13.8698L19.8561 14.4247C19.3391 15.0292 19.2311 15.1772 19.1803 15.3404C19.1286 15.5069 19.1334 15.6992 19.2115 16.5052L19.2831 17.2433C19.4048 18.4994 19.5041 19.5236 19.4693 20.3037C19.434 21.0977 19.2536 21.8601 18.5984 22.3576C17.9308 22.8643 17.1542 22.8072 16.4044 22.5924C15.6774 22.3841 14.7711 21.9667 13.6705 21.46L13.0149 21.1581C12.2975 20.8278 12.1439 20.7748 12 20.7748C11.8561 20.7748 11.7025 20.8278 10.9852 21.1581L10.3295 21.46C9.22898 21.9667 8.32265 22.3841 7.59565 22.5924C6.84587 22.8072 6.0692 22.8643 5.40168 22.3576C4.7464 21.8601 4.56607 21.0977 4.5307 20.3037C4.49595 19.5236 4.59523 18.4993 4.71697 17.2433L4.7885 16.5052C4.8666 15.6992 4.87147 15.5069 4.81971 15.3404C4.76894 15.1772 4.66094 15.0292 4.14393 14.4247L3.66945 13.8698C2.8656 12.9299 2.20753 12.1604 1.79553 11.5059C1.37149 10.8323 1.09714 10.1101 1.34127 9.32502C1.58794 8.5318 2.22867 8.10651 2.96086 7.81796C3.66622 7.53999 4.63474 7.32088 5.81038 7.05492L5.87404 7.04052L6.51039 6.89654C7.27382 6.72381 7.43023 6.67247 7.55148 6.58044C7.67743 6.48482 7.77785 6.33523 8.17039 5.63106L8.52899 4.98775C9.13601 3.89876 9.63268 3.00773 10.1011 2.3961Z';
const _STAR_INNER = 'M11.292 3.30809C10.8982 3.82224 10.4538 4.61551 9.80827 5.77355L9.48057 6.36141C9.46082 6.39684 9.44132 6.43194 9.42201 6.4667C9.12127 7.0079 8.86745 7.46469 8.45844 7.77518C8.04503 8.08901 7.54106 8.20227 6.95535 8.3339C6.91771 8.34235 6.87973 8.35089 6.84141 8.35956L6.20506 8.50354C4.94974 8.78757 4.09576 8.98299 3.51082 9.21351C2.94002 9.43845 2.81953 9.62275 2.77361 9.77044C2.72514 9.9263 2.7237 10.1647 3.06494 10.7068C3.41129 11.257 3.99558 11.9432 4.85011 12.9425L5.28393 13.4498C5.30914 13.4793 5.33413 13.5084 5.35886 13.5373C5.76188 14.0074 6.09791 14.3993 6.25205 14.895C6.40526 15.3877 6.35448 15.9054 6.29291 16.5331C6.28913 16.5716 6.28532 16.6105 6.2815 16.6499L6.21591 17.3267C6.08682 18.6589 5.99978 19.5762 6.02922 20.2369C6.05859 20.8965 6.1979 21.0788 6.30865 21.1628C6.40716 21.2376 6.58925 21.3204 7.18248 21.1504C7.78535 20.9777 8.58659 20.6111 9.76202 20.0699L10.3578 19.7956C10.3945 19.7787 10.4309 19.7619 10.4669 19.7452C11.0117 19.4934 11.4843 19.2748 12 19.2748C12.5157 19.2748 12.9883 19.4934 13.5331 19.7452C13.5692 19.7619 13.6055 19.7787 13.6422 19.7956L14.238 20.0699C15.4134 20.6111 16.2147 20.9777 16.8176 21.1504C17.4108 21.3204 17.5929 21.2376 17.6914 21.1628C17.8021 21.0788 17.9414 20.8965 17.9708 20.2369C18.0002 19.5762 17.9132 18.6589 17.7841 17.3267L17.7185 16.6499C17.7147 16.6105 17.7109 16.5716 17.7071 16.5331C17.6456 15.9054 17.5948 15.3877 17.748 14.895C17.9021 14.3993 18.2382 14.0074 18.6412 13.5372C18.6659 13.5084 18.6909 13.4793 18.7161 13.4498L19.1499 12.9425C20.0044 11.9432 20.5887 11.257 20.9351 10.7068C21.2763 10.1647 21.2749 9.9263 21.2264 9.77044C21.1805 9.62275 21.06 9.43845 20.4892 9.21351C19.9043 8.98299 19.0503 8.78757 17.795 8.50354L17.1586 8.35956C17.1203 8.35089 17.0823 8.34235 17.0447 8.33389C16.459 8.20227 15.955 8.08901 15.5416 7.77518C15.1326 7.46469 14.8788 7.0079 14.578 6.4667C14.5587 6.43194 14.5392 6.39684 14.5195 6.36141L14.1918 5.77355C13.5462 4.61551 13.1018 3.82224 12.7081 3.30809C12.3147 2.79443 12.1138 2.75 12 2.75C11.8863 2.75 11.6853 2.79443 11.292 3.30809Z';
function _buildPracticeStars() {
  const grid = document.getElementById('practiceStarGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < PRACTICE_STAR_TOTAL; i++) {
    const el = document.createElement('div');
    el.className = 'star';
    el.dataset.idx = i;
    el.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<path class="s-outer" d="' + _STAR_OUTER + '"/>'
      + '<path class="s-inner" d="' + _STAR_INNER + '"/>'
      + '</svg>';
    grid.appendChild(el);
  }
}
function _renderPracticeStars(songKey) {
  const grid = document.getElementById('practiceStarGrid');
  if (!grid) return;
  const filled = PRACTICE_STARS[songKey] || 0;
  grid.querySelectorAll('.star').forEach((el, i) => {
    el.classList.toggle('filled', i < filled);
    el.classList.remove('pop');
  });
}
function _addPracticeStar(songKey) {
  if (!songKey || !(songKey in PRACTICE_STARS)) return;
  const cur = PRACTICE_STARS[songKey];
  if (cur >= PRACTICE_STAR_TOTAL) return;
  PRACTICE_STARS[songKey] = cur + 1;
  if (_currentPracticeSong !== songKey) return;
  const grid = document.getElementById('practiceStarGrid');
  if (!grid) return;
  const next = grid.querySelector('.star[data-idx="' + cur + '"]');
  if (next) {
    next.classList.add('filled');
    next.classList.remove('pop');
    void next.offsetWidth;
    next.classList.add('pop');
  }
}
_buildPracticeStars();
_renderPracticeStars(_currentPracticeSong);
