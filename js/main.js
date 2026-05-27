/* main.js — setMode, 레이아웃 동기화, 이벤트 바인딩, 진입점 */

function showSheetNote(name) {
  Object.values(NOTE_SHEET_IDS).forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  const label = document.getElementById('sheetNoteLabel');
  const hint  = document.getElementById('sheetHint');
  const sheetId = NOTE_SHEET_IDS[name];
  if (sheetId) {
    const el = document.getElementById(sheetId);
    if (el) el.style.display = 'inline';
    if (label) label.textContent = NOTES[name].label;
    if (hint)  hint.textContent = '';
  } else {
    if (label) label.textContent = NOTES[name]?.label || name;
    if (hint)  hint.textContent = '악보 준비중';
  }
}
function resetSheetNote() {
  Object.values(NOTE_SHEET_IDS).forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  const label = document.getElementById('sheetNoteLabel');
  const hint  = document.getElementById('sheetHint');
  if (label) label.textContent = '';
  if (hint)  hint.textContent = '버튼을 눌러봐요!';
  document.getElementById('sheetWrap').classList.remove('visible');
}

let currentMode = 'learn';
let _pendingQuitMode = null;

function setMode(mode) {
  AudioManager.stopAll();
  updatePlayButtons(false);
  _hlStop();
  if (mode === 'quiz' && currentMode !== 'quiz') {
    quizConfig.count = 10;
    quizConfig.type = 'ALL';
  }
  currentMode = mode;
  document.querySelectorAll('.tab').forEach((t, i) => {
    t.classList.toggle('active', (i===0&&mode==='learn')||(i===1&&mode==='practice')||(i===2&&mode==='quiz'));
  });
  document.querySelectorAll('.mobile-tab').forEach((t, i) => {
    t.classList.toggle('active',
      (i === 0 && mode === 'learn') ||
      (i === 1 && mode === 'practice') ||
      (i === 2 && mode === 'quiz')
    );
  });
  // quiz 모드: 사이드바/하단바는 엔트리 화면에서 숨기고, 플레이 화면 진입 시 showQuestion()이 다시 켬
  document.getElementById('quizSideInfo').style.display    = 'none';
  document.getElementById('recorderStage').style.display   = mode==='practice' ? 'none'  : (mode==='quiz' ? 'none' : '');
  document.getElementById('bottomBar').classList.toggle('is-hidden', mode!=='learn');
  document.getElementById('quizBar').classList.add('is-hidden');
  document.getElementById('quizEndBar').classList.add('is-hidden');
  _qzLeaveEndScrollMode();
  document.getElementById('practiceBar').classList.toggle('is-hidden', mode!=='practice');
  document.getElementById('volumeWrap').style.display      = (mode==='quiz'||mode==='practice') ? 'none' : 'flex';
  document.getElementById('practiceSubtabs').classList.toggle('open', mode==='practice');
  document.getElementById('practiceGroup').classList.toggle('active', mode==='practice');
  if (mode !== 'practice') {
    document.getElementById('practiceStage').style.display    = 'none';
    document.getElementById('comingSoonStage').style.display  = 'none';
    document.getElementById('scoreTitleBar').style.display    = 'none';
  }
  // quiz 모드 외에는 quiz 전용 스테이지 모두 닫기
  if (mode !== 'quiz') {
    ['quizEntryStage','quizGridStage','quizSheetStage','quizDrawStage','quizEndStage'].forEach(id => {
      const el = document.getElementById(id); if (el) el.classList.remove('show');
    });
    document.getElementById('recorderStage').classList.remove('quiz-rec', 'quiz-play-stage');
    _hideCelebration();
    quizState = 'idle';
    currentQuestion = null;
  }
  HOLES.forEach(id => { const el = document.getElementById(id); if (el) el.style.cursor = mode==='quiz' ? 'pointer' : 'default'; });
  document.querySelectorAll('[data-pad-for]').forEach(ov => { ov.style.cursor = mode==='quiz' ? 'pointer' : 'default'; });
  const _rec = document.getElementById('recorderStage');
  if (_rec) _rec.classList.add('no-hole-fade');
  resetHoles();
  if (_rec) { void _rec.offsetHeight; requestAnimationFrame(() => _rec.classList.remove('no-hole-fade')); }
  document.querySelectorAll('.note-btn').forEach(b => { b.classList.remove('active','disabled'); b.disabled = false; });
  if (mode==='quiz') showQuizEntry();
  else if (mode==='practice') {
    const isMobile = window.innerWidth <= 767;
    setPracticeView(isMobile ? 'score' : 'both');
    setPracticeSong('airplane');
  }
  else { stopPractice(); resetSheetNote(); setVolume(0.8); _mutedVol = 0.8; }
  if (mode !== 'learn') resetSheetNote();
  _learnLayoutLastW = 0;
  _practiceBarLastR = 0;
  requestAnimationFrame(_learnSyncRun);
}

HOLES.forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', () => {
    if (currentMode !== 'quiz' || !currentQuestion || quizState !== 'playing' || quizDone) return;
    // Type A: 토글로 사용자 선택 누적 → [제출] 활성/비활성 갱신
    // 짝구멍(h6_1↔h6_2, h7_1↔h7_2)은 Type A 한정으로 동시 토글 (실제 리코더처럼 한 손가락이 두 구멍을 같이 막음).
    if (currentQuestion.type === 'A') {
      const TYPE_A_PAIRS = { h6_1: 'h6_2', h6_2: 'h6_1', h7_1: 'h7_2', h7_2: 'h7_1' };
      const partnerId = TYPE_A_PAIRS[id];
      const turningOn = !userSelected.has(id);
      const apply = (hid) => {
        const e = document.getElementById(hid);
        if (turningOn) { userSelected.add(hid);    if (e) e.style.fill = '#442AFF'; }
        else           { userSelected.delete(hid); if (e) e.style.fill = EMPTY; }
      };
      apply(id);
      if (partnerId) apply(partnerId);
      _setSubmitEnabled(userSelected.size > 0);
      return;
    }
    // Type E: 한 "그룹" 만 picked 상태 (h6_1↔h6_2, h7_1↔h7_2 는 짝구멍 → 한 묶음으로 처리)
    if (currentQuestion.type === 'E') {
      const TYPE_E_PAIRS = { h6_1: 'h6_2', h6_2: 'h6_1', h7_1: 'h7_2', h7_2: 'h7_1' };
      const partnerId = TYPE_E_PAIRS[id] || null;
      const targets   = [id, partnerId].filter(Boolean); // 이 클릭으로 함께 동작할 hole(들)
      // displayed 상태(showTypeE 가 그린 fill)로 되돌리는 헬퍼 — stroke/strokeWidth 도 함께 제거.
      const restoreToDisplayed = (hid) => {
        const hel = document.getElementById(hid);
        if (!hel) return;
        const correctClosed = new Set(NOTES[currentQuestion.note].closed);
        const shouldClose = correctClosed.has(hid);
        const isFlipped   = currentQuestion.flippedHoles.has(hid);
        hel.style.fill = (isFlipped ? !shouldClose : shouldClose) ? FILLED : EMPTY;
        hel.style.stroke = '';
        hel.style.strokeWidth = '';
      };
      // 같은 그룹 재클릭 → deselect (자신 + partner 모두 displayed 로 복원)
      const isSameGroupAsPicked = (currentQuestion.pickedHole === id)
        || (partnerId && currentQuestion.pickedHole === partnerId);
      if (isSameGroupAsPicked) {
        targets.forEach(restoreToDisplayed);
        currentQuestion.pickedHole = null;
        _setSubmitEnabled(false);
        return;
      }
      // 다른 그룹으로 pick 이동 → 이전 pick 의 자신 + partner 모두 displayed 로 복원
      if (currentQuestion.pickedHole) {
        const prevId      = currentQuestion.pickedHole;
        const prevPartner = TYPE_E_PAIRS[prevId] || null;
        [prevId, prevPartner].filter(Boolean).forEach(restoreToDisplayed);
      }
      // 새 그룹 선택 — 자신 + partner 모두 fill 토글 (FILLED ↔ EMPTY) + 보라 stroke 부여
      const correctClosed = new Set(NOTES[currentQuestion.note].closed);
      targets.forEach((tid) => {
        const tel = document.getElementById(tid);
        if (!tel) return;
        const shouldClose      = correctClosed.has(tid);
        const isFlipped        = currentQuestion.flippedHoles.has(tid);
        const displayedFilled  = isFlipped ? !shouldClose : shouldClose;
        tel.style.fill        = displayedFilled ? EMPTY : FILLED;
        tel.style.stroke      = '#442AFF';
        tel.style.strokeWidth = '4';
      });
      currentQuestion.pickedHole = id;
      _setSubmitEnabled(true);
      return;
    }
  });
});

/* ── Type A hole 드래그 채우기/비우기 (단순 클릭과 공존) ──
   pointerdown 시점엔 capture/preventDefault 를 하지 않고 보류만 한다 → 움직임이 없으면
   기존 click 핸들러(HOLES.forEach)가 그대로 토글을 처리(단순 클릭 유지).
   임계값(5px) 초과로 드래그가 확정될 때 비로소 capture + 시작 hole 적용, 이후 지나치는 hole 연속 적용.
   터치 스크롤은 #recorderSvg { touch-action: none } 으로 차단되므로 pointerdown preventDefault 불필요. */
(function _initTypeADrag() {
  const TYPE_A_PAIRS = { h6_1: 'h6_2', h6_2: 'h6_1', h7_1: 'h7_2', h7_2: 'h7_1' };
  const DRAG_THRESHOLD = 5; // px — 이 이상 움직여야 드래그로 판정

  let _pendingId  = null;   // pointerdown 시점의 hole — 드래그 확정 전까지 보류
  let _dragging   = false;
  let _turningOn  = false;
  let _touched    = new Set(); // 이번 세션에서 이미 처리한 hole id
  let _startX     = 0;
  let _startY     = 0;

  function _applyToHole(id) {
    if (_touched.has(id)) return;
    const partner = TYPE_A_PAIRS[id];
    const targets = partner ? [id, partner] : [id];
    targets.forEach(hid => {
      _touched.add(hid);
      const el = document.getElementById(hid);
      if (!el) return;
      if (_turningOn) { userSelected.add(hid);    el.style.fill = '#442AFF'; }
      else            { userSelected.delete(hid); el.style.fill = EMPTY; }
    });
    _setSubmitEnabled(userSelected.size > 0);
  }

  function _getHoleIdFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    if (el.dataset && el.dataset.padFor) return el.dataset.padFor; // overlay
    if (el.id && HOLES.includes(el.id)) return el.id;             // hole 직접
    return null;
  }

  function _isTypeAActive() {
    return currentMode === 'quiz'
      && currentQuestion
      && currentQuestion.type === 'A'
      && quizState === 'playing'
      && !quizDone;
  }

  const svg = document.getElementById('recorderSvg');
  if (!svg) return;

  svg.addEventListener('pointerdown', (e) => {
    if (!_isTypeAActive()) return;
    const holeId = _getHoleIdFromPoint(e.clientX, e.clientY);
    if (!holeId) return;
    // 보류만 — capture/preventDefault 안 함 → 움직임 없으면 기존 click 핸들러가 토글.
    _pendingId = holeId;
    _dragging  = false;
    _startX    = e.clientX;
    _startY    = e.clientY;
    _turningOn = !userSelected.has(holeId); // 첫 hole 상태 기준으로 방향 고정
  });

  svg.addEventListener('pointermove', (e) => {
    if (_pendingId === null) return;
    if (!_dragging) {
      if (Math.hypot(e.clientX - _startX, e.clientY - _startY) < DRAG_THRESHOLD) return;
      // 임계값 초과 → 드래그 확정: 지금 캡처 + 시작 hole 적용.
      _dragging = true;
      _touched  = new Set();
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      _applyToHole(_pendingId);
    }
    e.preventDefault();
    const holeId = _getHoleIdFromPoint(e.clientX, e.clientY);
    if (holeId) _applyToHole(holeId);
  });

  // 드래그 직후 발생하는 click 을 1회 흡수해 토글 중복을 막는다. 플래그 방식이라
  // (마우스처럼) click 이 곧바로 오면 그 click 에서 해제되고, (터치 드래그처럼) click 이
  // 아예 오지 않아도 다음 tick 에 해제되어 이후 정상 클릭에 영향을 주지 않는다.
  let _suppressClick = false;
  svg.addEventListener('click', (ce) => {
    if (_suppressClick) { ce.stopPropagation(); _suppressClick = false; }
  }, true);

  function _endPointer() {
    if (_pendingId !== null && _dragging) {
      _suppressClick = true;
      setTimeout(() => { _suppressClick = false; }, 0);
    }
    _pendingId = null;
    _dragging  = false;
    _touched   = new Set();
  }

  svg.addEventListener('pointerup', _endPointer);
  svg.addEventListener('pointercancel', _endPointer);
})();

/* 리코더 hole 클릭/터치 영역 확장 — 시각적 hole 반경이 작아 모바일 터치하기 어려운 문제 보정.
   투명 overlay circle/ellipse 를 hole 위에 더 큰 반경으로 배치 → overlay 클릭 시 원본 hole 의 click 이벤트 dispatch.
   PAD=10 (viewBox 단위): 가장 좁은 인접쌍 h2-h3(중심간격 45.1, r합 20 → 양쪽 최대 12.5) 기준
     안전 마진 두고 10 사용 → 어떤 인접 non-pair hole 과도 충돌 없음.
   짝구멍(h6_1↔h6_2, h7_1↔h7_2)은 한 손가락이 두 구멍 동시에 막는 구조라 overlay 겹침 허용. */
(function _injectHoleClickPadding() {
  const PAD = 10;
  const NS = 'http://www.w3.org/2000/svg';
  Object.entries(_WRONG_HOLE_POS).forEach(([hid, pos]) => {
    const hole = document.getElementById(hid);
    if (!hole) return;
    let overlay;
    if (pos.shape === 'ellipse') {
      overlay = document.createElementNS(NS, 'ellipse');
      overlay.setAttribute('cx', pos.cx);
      overlay.setAttribute('cy', pos.cy);
      overlay.setAttribute('rx', pos.rx + PAD);
      overlay.setAttribute('ry', pos.ry + PAD);
    } else {
      overlay = document.createElementNS(NS, 'circle');
      overlay.setAttribute('cx', pos.cx);
      overlay.setAttribute('cy', pos.cy);
      overlay.setAttribute('r', pos.r + PAD);
    }
    overlay.setAttribute('fill', 'transparent');
    overlay.style.pointerEvents = 'all';
    overlay.style.cursor = 'default';
    overlay.dataset.padFor = hid;
    // 원본 hole 의 부모에 hole 다음 형제로 삽입 — SVG render 순서상 hole 위에 표시되지만 fill 투명이라 시각 변화 없음.
    hole.parentNode.insertBefore(overlay, hole.nextSibling);
    // overlay 클릭/터치 → 원본 hole 의 click 이벤트 dispatch 로 기존 핸들러 동작 재사용.
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      hole.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  });
})();


function syncSheetSvgHeight() {
  const h = document.getElementById('recorderSvg').getBoundingClientRect().height;
  if (h <= 0) return;
  const svgH = h / 5;
  document.getElementById('sheetSvg').style.height = svgH + 'px';
  // viewBox "315 810 240 160": 음표 중심 x≈448, 범위 315~555(폭 240)
  // 비율 = (448-315)/240 = 0.554 → SVG 중심(0.5) 대비 오프셋
  const svgW = svgH * (240 / 160);
  const offset = svgW * (0.554 - 0.5);
  const fontSize = svgH * 0.35;
  const labelH   = fontSize * 1.24;
  const label = document.getElementById('sheetNoteLabel');
  label.style.fontSize   = fontSize.toFixed(1) + 'px';
  label.style.height     = labelH.toFixed(1)   + 'px';
  label.style.lineHeight = labelH.toFixed(1)   + 'px';
  label.style.transform  = `translateX(${offset.toFixed(1)}px)`;
}
requestAnimationFrame(syncSheetSvgHeight);
window.addEventListener('resize', syncSheetSvgHeight);

/* ── 운지법 익히기 탭: 악보(sheetWrap) ↔ 리코더(.recorder-wrap) 비율 동기화
   sheetWrap 너비 × 2.0 = recorder-wrap maxHeight → 뷰포트 너비가 좁아질수록 리코더도 함께 축소.
   주의: transition 중인 실시간 sheetWrap.width 를 쓰면, ResizeObserver 가 매 프레임 발화하면서
   리코더 maxHeight 가 작은 값으로 점프했다가 다시 커지는 "한 번 깜빡임" 발생.
   → .visible 상태일 때 부모의 35% (sheet 최종 너비) 로 계산해서 리코더는 즉시 최종 크기로 안착. */
function syncLearnBalance() {
  const sheetWrap = document.getElementById('sheetWrap');
  if (!sheetWrap) return;
  let w = 0;
  // 모바일(≤767px)에서는 sheet-wrap 이 절대 오버레이라 recorder-panel 크기가 불변
  // → maxHeight 계산 불필요. 데스크탑 전용 로직.
  if (sheetWrap.classList.contains('visible') && window.innerWidth > 767) {
    const parent = sheetWrap.parentElement;
    w = parent ? parent.clientWidth * 0.35 : sheetWrap.getBoundingClientRect().width;
  }
  const recWrap = document.querySelector('.recorder-panel:not(.practice-recorder-panel) > .recorder-wrap');
  if (w > 0) {
    const targetHeight = w * 2.0;
    if (recWrap) {
      recWrap.style.maxHeight = targetHeight + 'px';
      // sheetWrap 열림 시 recorder 세로 가운데 정렬: recorder-row 높이 기준으로 top 조정
      const rowH = sheetWrap.parentElement ? sheetWrap.parentElement.getBoundingClientRect().height : 0;
      const topPx = Math.max(16, rowH > targetHeight ? Math.round((rowH - targetHeight) / 2) : 16);
      recWrap.style.top = topPx + 'px';
    }
  } else if (recWrap) {
    recWrap.style.maxHeight = '';
    recWrap.style.top = '';
  }
  syncSheetSvgHeight();
}
let _learnBalanceObs = null;
if (typeof ResizeObserver !== 'undefined') {
  const _learnBalanceTarget = document.getElementById('sheetWrap');
  if (_learnBalanceTarget) {
    // 같은 rAF 큐(_learnSyncSchedule)를 공유 → sheetWrap과 recorderSvg 변경이 동시에 와도 1프레임 1회 실행
    _learnBalanceObs = new ResizeObserver(_learnSyncSchedule);
    _learnBalanceObs.observe(_learnBalanceTarget);
  }
}
requestAnimationFrame(syncLearnBalance);

/* ── learn/quiz 모드 레이아웃 실시간 가변
      기준: 1920x1080에서 리코더 SVG 너비 ≈ 158px → 현재 디자인 값
      .hand-legend / .legend / #volumeWrap / .bottom-bar 모두 비례 스케일 ── */
const _LEARN_REF_W = RECORDER_SVG.REF_W_AT_1920;
let _learnLayoutLastW = 0;
let _learnModeR = 0;  // 학습 모드 기준 r — 퀴즈에서도 학습 모드의 버튼 dim 을 그대로 사용해 시각적 일관성 유지.

/* 학습 SVG width / window.innerWidth 비율 — 학습 모드 w 산출용.
   학습 SVG 가시일 때마다 실측으로 캘리브.
   _learnSvgHRatio: 학습 SVG width / window.innerHeight 비율 — 연습·퀴즈 모드 w 산출용.
   리코더 SVG 는 height:100% + width:auto (종횡비 ≈ 0.18) → SVG 너비는 뷰포트 너비가 아닌
   뷰포트 높이에 비례한다. 연습/퀴즈 모드에서 너비 기반 공식을 쓰면 브라우저를 가로로 늘릴 때
   w 가 선형 증가하여 학습 바보다 훨씬 커지는 문제가 생긴다.
   높이 기반 공식(_learnSvgHRatio)을 쓰면 가로 리사이즈에 불변 → 학습 바와 동일 크기 유지. */
let _learnSvgRatio  = 135 / 1920;
let _learnSvgHRatio = 0;
/* 학습 모드 한정 캘리브 (note-btn / quiz-action-btn 의 rBtn 산출 전용) — 모드 간 동일 사이즈 보장.
   _learnSvgHRatio 는 모드 무관 갱신(fallback w 계산용)이라 quiz Type A/E 의 더 짧은 recorder 로 덮어써질 수 있음.
   이 변수는 학습 모드에서만 갱신해 cross-mode 일관성 유지. viewport 변화에는 innerHeight × ratio_pure 로 추정. */
let _learnSvgHRatio_pure = 0;

/* 세 bottom-bar (학습 note-btn / 연습 star / 퀴즈 action-btn) 내부 콘텐츠 높이 단일 공식.
   note-btn 자연 height 모델: padding 14r(상하) + font line-height(1.2배). border 0, box-shadow 는 layout 미포함.
   셋 다 같은 height 를 explicit 적용 → 세 바의 총 높이가 픽셀 단위로 일치.
   최솟값은 CSS .note-btn / .quiz-action-btn !important 기준과 일치:
     padV min=8 ← $sp-8, fontSize min=14 ← $fs-md, 최종 높이 min=44 ← min-height:44px.
     (min-height:44 는 모바일 전용 @media 라 >767px 에선 미적용 → 여기서 전 뷰포트에 floor 적용.) */
function _computeBarContentH(r) {
  const padV     = Math.max(8,  Math.round(14 * r));  // CSS min: $sp-8 = 8px
  const fontSize = Math.max(14, Math.round(26 * r));  // CSS min: $fs-md = 14px
  const lineH    = Math.round(fontSize * 1.2);
  return Math.max(44, padV * 2 + lineH);              // CSS min-height: 44px — 전 뷰포트 보장
}
function _syncLearnLayout() {
  const svg = document.getElementById('recorderSvg');
  if (!svg) return;
  const liveW = svg.getBoundingClientRect().width;
  // ratio 캘리브: liveW 가 실측 가능 + sheetWrap 안정 시 모드 무관 갱신.
  // 이전엔 learn 모드 한정이었으나, quiz 모드에서 viewport 가 크게 변하면 ratio 가
  // stale 되어 버튼 사이즈가 리사이즈에 둔감해지는 문제 발생 → 모드 무관 캘리브로 변경.
  // 트레이드오프: quiz Type A/E 의 (header 차지로) 짧은 recorder 가 ratio 를 덮어쓰면
  // Type B/C/D 폴백 사이즈가 그만큼 작아질 수 있지만, 같은 quiz 모드 내에선 일관 유지.
  // sheetWrap 열림 중·닫힘 트랜지션 중에는 liveW 가 과도기 값이므로 ratio 동결.
  // 트랜지션 완료 기준: 모바일은 sheetWrap height ≤ 2px, 데스크탑은 width ≤ 2px.
  if (liveW > 0 && window.innerWidth > 0) {
    const _sw = document.getElementById('sheetWrap');
    const _swRect = _sw ? _sw.getBoundingClientRect() : null;
    const _swBusy = _sw && (
      _sw.classList.contains('visible') ||
      (window.innerWidth <= 767 ? (_swRect && _swRect.height > 2) : (_swRect && _swRect.width > 2))
    );
    if (!_swBusy) {
      _learnSvgRatio = liveW / window.innerWidth;
      if (window.innerHeight > 0) _learnSvgHRatio = liveW / window.innerHeight;
      // 학습 모드 한정 캘리브 — 버튼 rBtn 산출용. quiz Type A/E 의 더 짧은 recorder 가
      // 덮어쓰지 않도록 별도 분리. 학습 → 퀴즈 전환 후 viewport 변경 시에도 이 비율로 추정.
      if (currentMode === 'learn' && window.innerHeight > 0) {
        _learnSvgHRatio_pure = liveW / window.innerHeight;
      }
    }
  }
  // w 산출 우선순위:
  //   1) liveW > 0 (SVG 가시) → 실측값 직접 사용 = 최정확. learn / quiz Type A/E 공통.
  //   2) 폴백 (quiz Type B/C/D 같이 recorder 숨김 상태):
  //      가로 > 세로 + ratio_h 캘리브됨 → innerHeight × ratio_h
  //      세로 > 가로 또는 ratio_h 미캘리브 → innerWidth × ratio_w
  //      (학습 모드는 SVG 가시 시 항상 1) 로 처리되므로 폴백 진입 없음 — 안전망으로만 두 번째 줄 유지.)
  const isLandscape = window.innerWidth >= window.innerHeight;
  const w = liveW > 0
    ? liveW
    : ((currentMode !== 'learn')
        ? (isLandscape && _learnSvgHRatio > 0
            ? window.innerHeight * _learnSvgHRatio
            : window.innerWidth  * _learnSvgRatio)
        : window.innerWidth * _learnSvgRatio);
  if (!w) return;
  // hysteresis: 1px 미만 차이는 스킵 (rAF 디바운스 + ResizeObserver 진동 흡수).
  if (Math.abs(w - _learnLayoutLastW) < 1) return;
  _learnLayoutLastW = w;
  const r = w / _LEARN_REF_W;
  // _learnModeR: 학습 모드 + SVG 실측 시에만 갱신 (별도 용도 캐시).
  if (currentMode === 'learn' && liveW > 0) _learnModeR = r;
  // 버튼(.note-btn / .quiz-action-btn) 전용 r — 학습 모드 등가값으로 계산해 cross-mode 동일 사이즈 보장.
  //   _learnSvgHRatio_pure: 학습 모드에서만 캘리브된 SVG너비/viewport높이 비율.
  //   innerHeight × pure ratio = 현재 viewport 의 "학습 모드 등가 SVG 너비"
  //   → 퀴즈 모드의 더 짧은 recorder 에 영향 받지 않고, 동시에 viewport 리사이즈에는 비례 반응.
  // 폴백: _learnSvgHRatio_pure 미캘리브 (학습 모드 미방문) 시 live r 사용.
  const _learnEquivW = (_learnSvgHRatio_pure > 0 && window.innerHeight > 0)
    ? window.innerHeight * _learnSvgHRatio_pure
    : 0;
  const rBtn = _learnEquivW > 0 ? _learnEquivW / _LEARN_REF_W : r;

  const px = (v) => Math.max(1, Math.round(v * r)) + 'px';
  const fs = (v, min) => Math.max(min, Math.round(v * r)) + 'px';
  // 버튼(note-btn, quiz-action-btn) 전용 — _learnModeR 기반으로 모드 무관 일관 스케일.
  const pxBtn = (v) => Math.max(1, Math.round(v * rBtn)) + 'px';
  const fsBtn = (v, min) => Math.max(min, Math.round(v * rBtn)) + 'px';
  // padding/border-radius 최솟값 부여 (전 뷰포트). CSS .note-btn/.quiz-action-btn !important 최솟값과 일치: pad 8·16, radius 8.
  const pxBtnMin = (v, min) => Math.max(min, Math.round(v * rBtn)) + 'px';

  // legend (.hand-legend / .legend / .legend-circle) — learn/quiz 모드 리코더 패널만.
  // 연습하기 탭 _syncLegendSize()와 동일한 방식으로 통일:
  //   1) 뷰포트 비례 (1920에서 18px, 최소 14px) → vpFontPx
  //   2) 리코더 SVG 내 숫자 텍스트 렌더 px (22 × recH / 722.994)를 상한으로 캡
  //   3) hysteresis: 직전 적용된 값과 1px 미만 차이는 스킵 (Math.round 경계 진동 흡수)
  //   4) gap/padding/원형은 legendFontPx 기반 동일 비율
  //      (1920 baseline 18px 텍스트 ↔ hand-legend gap 16(0.875), legend gap 11(0.625),
  //       legend padding 9/16(0.5/0.875), 원형 12(0.6875), 최소 8px)
  const recPanel = svg.closest('.recorder-panel');
  if (recPanel && !recPanel.classList.contains('practice-recorder-panel')) {
    const vpFontPx = Math.max(RECORDER_SVG.LEGEND_FONT_MIN, window.innerWidth * RECORDER_SVG.LEGEND_FONT_AT_1920 / 1920);
    let numberPx = Infinity;
    const recH = svg.getBoundingClientRect().height;
    if (recH > 0) numberPx = RECORDER_SVG.HOLE_LABEL_FONT * (recH / RECORDER_SVG.VIEW_H);
    const legendFontPx = Math.min(vpFontPx, numberPx);
    const _legendSample = recPanel.querySelector('.hand-legend');
    const _curFontPx = _legendSample ? parseFloat(_legendSample.style.fontSize) : 0;
    const _skipLegend = _curFontPx > 0 && Math.abs(legendFontPx - _curFontPx) < 1;
    if (!_skipLegend) {
      const fontStr = legendFontPx + 'px';
      const handGap = Math.round(legendFontPx * 0.875) + 'px';
      const legGap  = Math.round(legendFontPx * 0.625) + 'px';
      const legPadV = Math.round(legendFontPx * 0.5)   + 'px';
      const legPadH = Math.round(legendFontPx * 0.875) + 'px';
      const circleSize = Math.max(8, Math.round(legendFontPx * 0.6875)) + 'px';

      recPanel.querySelectorAll('.hand-legend').forEach(el => {
        el.style.fontSize = fontStr;
        el.style.gap = handGap;
      });
      recPanel.querySelectorAll('.legend').forEach(el => {
        el.style.fontSize = fontStr;
        el.style.gap = legGap;
        el.style.padding = legPadV + ' ' + legPadH;
      });
      recPanel.querySelectorAll('.legend-circle').forEach(el => {
        el.style.width  = circleSize;
        el.style.height = circleSize;
      });
    }
  }

  // #volumeWrap — 위치/패딩/래퍼/슬라이더/아이콘
  const vw = document.getElementById('volumeWrap');
  if (vw) {
    vw.style.right = px(30);
    vw.style.bottom = px(30);
    vw.style.gap = '9px';
    vw.style.padding = window.innerWidth > 767 ? '15px ' + px(11) : '';
    // border-radius 는 실시간 가변 대상에서 제외 — CSS(#volumeWrap)의 고정값 사용.
    vw.querySelectorAll('span').forEach(s => {
      s.style.fontSize = fs(24, 17);
    });
    const vb = document.getElementById('volumeBar');
    if (vb) vb.style.height = '84px';
  }

  // 세 bottom-bar 공통 내부 콘텐츠 높이 — 단일 공식으로 픽셀 일치 보장.
  const barContentH = _computeBarContentH(rBtn);

  // .bottom-bar (learn) — 패딩/라벨/그리드/노트 버튼
  const bb = document.getElementById('bottomBar');
  if (bb) {
    bb.style.padding = px(18);   // .bottom-bar 균일 패딩 0.75rem 대응 (네 면 동일)
    const lbl = document.getElementById('barLabel');
    if (lbl) {
      lbl.style.fontSize = fs(18, 14);
      lbl.style.marginBottom = Math.max(8, Math.round(9 * r)) + 'px';  // 최소 8px (CSS .bar-label margin-bottom 과 일치)
    }
    const grid = document.getElementById('noteGrid');
    if (grid) {
      // 모바일(<=767px) 에선 8px floor 보장 — CSS @media 의 gap:8px 와 일치.
      // 데스크탑/태블릿 에선 r 비례 + 1px floor (기존 동작 유지).
      const _gridMin = window.innerWidth <= 767 ? 8 : 1;
      grid.style.gap = Math.max(_gridMin, Math.round(11 * r)) + 'px';
    }
    const noteSamples = bb.querySelectorAll('.note-btn');
    noteSamples.forEach(btn => {
      btn.style.padding = pxBtnMin(14, 8) + ' ' + pxBtnMin(23, 16);
      btn.style.fontSize = fsBtn(26, 16);
      btn.style.borderRadius = pxBtnMin(15, 8);
      // 자연 height 대신 단일 공식으로 explicit — star/quiz-btn 과 픽셀 일치.
      btn.style.height = barContentH + 'px';
      btn.style.boxSizing = 'border-box';
    });
  }

  // .bottom-bar (quiz) — 학습 bottomBar 와 동일 dim 보장: padding/label/gap/버튼 모두 _learnModeR 기반(pxBtn/fsBtn).
  const qb = document.getElementById('quizBar');
  if (qb) {
    qb.style.padding = pxBtn(18);   // .bottom-bar 균일 패딩 0.75rem 대응 (네 면 동일)
    const qLbl = document.getElementById('quizBarLabel');
    if (qLbl) {
      qLbl.style.fontSize = fsBtn(18, 14);
      qLbl.style.marginBottom = pxBtnMin(9, 8);  // 최소 8px
    }
    const qbtns = qb.querySelector('.quiz-btns');
    if (qbtns) qbtns.style.gap = pxBtn(11);
    qb.querySelectorAll('.quiz-action-btn').forEach(btn => {
      btn.style.padding = pxBtnMin(14, 8) + ' ' + pxBtnMin(23, 16);
      btn.style.fontSize = fsBtn(26, 16);
      btn.style.borderRadius = pxBtnMin(15, 8);
      // _computeBarContentH 단일 공식 → note-btn/star 와 동일 px 높이.
      btn.style.height = barContentH + 'px';
      btn.style.boxSizing = 'border-box';
    });
  }

  // #quizEndBar (.qz-end-actions) 영역은 실시간 리사이징 계산값에서 제외 — CSS 베이스만 적용.

  // 스타일 적용 후 hysteresis 기준을 실측 SVG 너비로 즉시 갱신.
  // note-btn / quiz-action-btn height 변경 → bottom-bar → stage → SVG 높이 → SVG 너비
  // (width:auto + 종횡비) 가 연쇄적으로 변해 ResizeObserver 가 재발화한다. 적용 전 w 로
  // 기준을 세워 두면 변화량이 hysteresis 임계(1px)를 넘을 때마다 반복 실행되어 진동이 생긴다.
  // 적용 후 실측값으로 갱신하면 다음 콜백에서 |Δ|=0 이 되어 루프를 1회로 막는다.
  // liveW > 0 (recorder 가시) 면 learn / quiz Type A·E 동일 적용 — 두 모드 모두 자체 피드백 루프 발생 가능.
  if (liveW > 0) {
    const postW = svg.getBoundingClientRect().width;
    if (postW > 0 && window.innerWidth > 0) {
      _learnLayoutLastW = postW;
      const _sw = document.getElementById('sheetWrap');
      if (!(window.innerWidth <= 767 && _sw && _sw.classList.contains('visible'))) {
        _learnSvgRatio  = postW / window.innerWidth;
        if (window.innerHeight > 0) _learnSvgHRatio = postW / window.innerHeight;
        // _learnSvgHRatio_pure 도 학습 모드 한정으로 postW 기반 갱신 — calibration 블록은
        // 스타일 적용 BEFORE liveW 를 캡처해 PRE 상태 (큰 값) 가 남아 있을 수 있음.
        // STEADY 수렴 전 사용자가 퀴즈 탭 클릭하면 중간값으로 버튼 사이즈가 어긋남 → 매 콜백에서
        // 스타일 적용 후 실측값으로 갱신해 다음 콜백 시점엔 항상 최신 안정값 보장.
        if (currentMode === 'learn' && window.innerHeight > 0) {
          _learnSvgHRatio_pure = postW / window.innerHeight;
        }
      }
    }
  }
}
// rAF 디바운스: 한 프레임 내에 여러 번 발화돼도 _syncLearnLayout / syncLearnBalance는 한 번만 실행
let _learnSyncRAF = null;
function _learnSyncRun() {
  _learnSyncRAF = null;
  syncLearnBalance();   // sheet/recorder maxHeight 동기화 (내부에서 syncSheetSvgHeight 호출)
  _syncLearnLayout();   // 비례 가변 (hysteresis로 미세 진동 흡수)
  _syncPracticeBarLayout();  // 연습하기 바 비례 가변
}
function _learnSyncSchedule() {
  if (_learnSyncRAF !== null) return;
  _learnSyncRAF = requestAnimationFrame(_learnSyncRun);
}

// 연습하기 바 — 운지법 익히기 바와 동일한 reference 사용 (recorder SVG width / _LEARN_REF_W).
// 연습 모드에선 learn SVG가 display:none이라 width=0 → 마지막 알려진 너비 또는 viewport 환산 fallback.
let _practiceBarLastR = 0;
function _syncPracticeBarLayout() {
  const bb = document.getElementById('practiceBar');
  if (!bb) return;
  // _learnSyncRun 에서 _syncLearnLayout 이 먼저 호출되어 _learnLayoutLastW 가 이번 프레임의 w 로 갱신됨.
  // 그 값을 그대로 공유 → 학습/연습 두 함수가 항상 동일 w/r 사용 → _computeBarContentH 결과 픽셀 일치.
  // 폴백: 높이 기반 → 너비 기반 순으로 시도. 너비 기반 폴백은 가로 리사이즈 시 선형 증가하므로 최후 수단.
  const _wFallback = _learnSvgHRatio > 0
    ? window.innerHeight * _learnSvgHRatio
    : window.innerWidth * _learnSvgRatio;
  const w = _learnLayoutLastW > 0 ? _learnLayoutLastW : _wFallback;
  if (w <= 0) return;
  const r = w / _LEARN_REF_W;
  if (Math.abs(r - _practiceBarLastR) < 0.005) return;
  _practiceBarLastR = r;
  const px = (v) => Math.max(1, Math.round(v * r)) + 'px';
  const fs = (v, min) => Math.max(min, Math.round(v * r)) + 'px';
  bb.style.padding = px(18);   // .bottom-bar 균일 패딩 0.75rem 대응 (네 면 동일)
  const lbl = document.getElementById('practiceBarLabel');
  if (lbl) {
    lbl.style.fontSize = fs(18, 14);
    lbl.style.marginBottom = Math.max(8, Math.round(9 * r)) + 'px';  // 최소 8px (CSS .bar-label margin-bottom 과 일치)
  }
  const gapPx = Math.max(1, Math.round(10 * r));
  const grid = document.getElementById('practiceStarGrid');
  if (grid) grid.style.gap = gapPx + 'px';
  // 세 bottom-bar 공통 _computeBarContentH(r) 사용 → note-btn / quiz-action-btn 과 동일 px.
  const starPx = _computeBarContentH(r);
  const isMobile = window.innerWidth <= 767;
  let finalStarPx = starPx;
  if (isMobile) {
    // 10개 별 + 9개 gap이 화면 폭에 딱 맞도록 크기를 줄임
    const padH = Math.max(1, Math.round(18 * r));
    const available = window.innerWidth - 2 * padH;
    const maxFit = Math.floor((available - 9 * gapPx) / 10);
    finalStarPx = Math.min(starPx, Math.max(20, maxFit));
  }
  bb.querySelectorAll('.star').forEach(s => {
    s.style.width      = finalStarPx + 'px';
    s.style.height     = finalStarPx + 'px';
    s.style.flexShrink = isMobile ? '0' : '';
  });
}

let _learnLayoutObs = null;
if (typeof ResizeObserver !== 'undefined') {
  const _learnSvg = document.getElementById('recorderSvg');
  if (_learnSvg) {
    _learnLayoutObs = new ResizeObserver(_learnSyncSchedule);
    _learnLayoutObs.observe(_learnSvg);
  }
}
// rAF 콜백은 _learnSyncRun 으로 — 초기 레이아웃 완료 후 liveW 가 viewport 폴백에서 실제값으로
// 바뀔 때 세 바(_syncLearnLayout + _syncPracticeBarLayout) 모두 함께 갱신되어야 픽셀 일치 유지.
// (이전엔 _syncLearnLayout 만 단독 호출되어 learn/quiz 만 갱신, practice 는 폴백값 고정 → 1~2px 분기)
requestAnimationFrame(_learnSyncRun);
window.addEventListener('resize', _learnSyncSchedule);
let _pracViewBeforeMobile = null;
window.addEventListener('resize', () => {
  if (currentMode !== 'practice') { _pracViewBeforeMobile = null; return; }
  if (window.innerWidth <= 767) {
    if (_currentPracticeView === 'both') {
      _pracViewBeforeMobile = 'both';
      setPracticeView('score', true);
    }
  } else {
    if (_pracViewBeforeMobile === 'both') {
      _pracViewBeforeMobile = null;
      setPracticeView('both', true);
    }
  }
});

buildButtons();
_syncLearnLayout();

_syncPracticeBarLayout();

/* ── 탭/창 이탈 시 통합 visibilitychange 핸들러 ── */
// 등록이 한 번만 일어나도록 IIFE 외부 전역 콜백으로 선언.
// Lottie 배경(anim)은 _initQuizStageBg 완료 후 참조 가능하도록
// window._quizStageBgAnim 에 저장하고 여기서 읽는다.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    const wasPracticePlaying = AudioManager.practice && !AudioManager.practice.paused;
    AudioManager.stopAll();
    if (wasPracticePlaying) _showPracticeSeekPopup();
    if (window._quizStageBgAnim) window._quizStageBgAnim.pause();
  } else {
    // 탭 복귀 시 Lottie 재개 (엔트리 스테이지가 보이는 경우만)
    const entry = document.getElementById('quizEntryStage');
    if (window._quizStageBgAnim && entry && entry.classList.contains('show')) {
      window._quizStageBgAnim.play();
    }
  }
});

// 정답 폭죽 Lottie (Bubble Explosion.json) — 페이지 로드 시 사전 fetch.
// 첫 정답 시 네트워크 대기 없이 즉시 재생 시작하도록 JSON 을 모듈 변수에 캐시.
// (path 로 매번 로드하면 첫 회 fetch 지연으로 feedback-flash 보다 늦게 등장하는 문제 해결)
let _bubbleExplosionData = null;
(function _preloadBubbleExplosion() {
  const url = RESOURCE_URLS.LOTTIE_BUBBLE;
  fetch(url).then(r => r.json()).then(data => { _bubbleExplosionData = data; }).catch(() => {});
})();

// 헤더 멜로디 Lottie 애니메이션 (Melody.json) — 무한 loop
(function _initHeaderMelody() {
  const container = document.getElementById('headerMelody');
  if (!container || typeof lottie === 'undefined') return;
  lottie.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    path: RESOURCE_URLS.LOTTIE_MELODY
  });
})();

// 퀴즈 엔트리 화면 커서 follower Lottie (AI Searching.json) — lead + ghost 트레일
(function _initQuizDecoLottie() {
  const lead = document.getElementById('qeDecoLottie');
  if (!lead || typeof lottie === 'undefined') return;
  const LOTTIE_PATH = RESOURCE_URLS.LOTTIE_AI;

  const elements = [lead];
  lead.style.opacity = QE_TRAIL[0].opacity;
  lead.style.zIndex  = 1000;
  // ghost(트레일) 요소를 lead 앞에 삽입 → z-index로 lead가 최상단
  for (let i = 1; i < QE_TRAIL.length; i++) {
    const g = document.createElement('div');
    g.className = 'qe-deco qe-deco-ghost';
    g.style.opacity = QE_TRAIL[i].opacity;
    g.style.zIndex  = 1000 - i;
    lead.parentNode.insertBefore(g, lead);
    elements.push(g);
  }
  // 모든 인스턴스에 동일한 Lottie 로드 (autoplay 시점 차이로 잔상 사이에 미세한 위상차 발생 → 분신 느낌 강조)
  elements.forEach(el => {
    lottie.loadAnimation({
      container: el,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: LOTTIE_PATH,
    });
  });
  qeTrailElements = elements;
})();

// 퀴즈 스테이지 배경 Lottie (Note Pattern.json) — 엔트리 스테이지(quizEntryStage)에만 주입.
// JSON 을 fetch 한 뒤 색상 스왑 + 음표 사이즈 25% 축소:
//   원본 노란색 [1,0.843137254902,0,1] (= #FFD700) → #FFFFFF  (배경)
//   원본 흰색   [1,1,1,1]                          → #BBE0FA (음표)
//   comp_0 내부 305개 note 레이어 scale 100 → 25 (음표 사이즈 1/4, 기존 50 의 절반)
// 단순 순차 치환 시 yellow→white 후 white→BBE0FA 단계에서 충돌하므로 임시 플레이스홀더 경유.
// 엔트리 .show 토글에 맞춰 play/pause:
//   - 다른 스테이지로 넘어가면 Lottie 가 안 보이므로 pause → 메모리/CPU 절약.
//   - 다시 엔트리 진입 시 play 재개.
//   - MutationObserver 로 quizEntryStage 의 class 변화를 감시 (.show on/off).
// ResizeObserver 로 컨테이너 사이즈 변경 감지 → anim.resize() 호출.
(function _initQuizStageBg() {
  const entry = document.getElementById('quizEntryStage');
  if (!entry || typeof lottie === 'undefined') return;
  const URL = RESOURCE_URLS.LOTTIE_NOTE_PAT;
  const SRC_YELLOW = '[1,0.843137254902,0,1]';
  const SRC_WHITE  = '[1,1,1,1]';
  const NEW_WHITE  = '[1,1,1,1]';                                            // #FFFFFF (= 노란색이 이걸로 변경됨)
  const NEW_BBE0FA = '[0.7333333333333333,0.8784313725490196,0.9803921568627451,1]'; // #BBE0FA (= 원본 흰색이 이걸로 변경됨)
  const TMP        = '[0.123456789,0.987654321,0.456789123,1]';              // 충돌 회피용 임시 플레이스홀더

  fetch(URL)
    .then(r => r.text())
    .then(text => {
      const patched = text
        .split(SRC_WHITE).join(TMP)            // 1) 원본 흰색을 임시값으로 옮겨두고
        .split(SRC_YELLOW).join(NEW_WHITE)     // 2) 노란색 → 흰색
        .split(TMP).join(NEW_BBE0FA);          // 3) 임시값 → #BBE0FA
      const data = JSON.parse(patched);
      // 음표 사이즈 1/4: comp_0 내부 305개 note 레이어의 scale 만 [25,25,100] 으로 변경.
      // 외곽 Note_Pattern_base / BG_Yellow 레이어는 건드리지 않아 패턴 분포는 유지됨 → 음표만 작아지고 간격이 늘어남.
      if (Array.isArray(data.assets)) {
        const comp0 = data.assets.find(a => a.id === 'comp_0');
        if (comp0 && Array.isArray(comp0.layers)) {
          comp0.layers.forEach(layer => {
            if (layer.ks && layer.ks.s && Array.isArray(layer.ks.s.k)) {
              layer.ks.s.k = [25, 25, 100];
            }
          });
        }
      }
      let bg = entry.querySelector(':scope > .quiz-stage-bg');
      if (!bg) {
        bg = document.createElement('div');
        bg.className = 'quiz-stage-bg';
        bg.setAttribute('aria-hidden', 'true');
        entry.insertBefore(bg, entry.firstChild);
      }
      const anim = lottie.loadAnimation({
        container: bg,
        renderer: 'svg',
        loop: true,
        autoplay: false,  // .show 토글 시점에 명시적으로 play
        animationData: data,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid slice',  // 영역 꽉 채우기 (cover)
        },
      });
      window._quizStageBgAnim = anim;  // 통합 visibilitychange 핸들러에서 참조
      // 엔트리가 현재 .show 상태면 즉시 play
      if (entry.classList.contains('show')) anim.play();
      // .show 토글에 맞춰 play/pause — 다른 스테이지에서는 메모리/CPU 점유 ↓
      new MutationObserver(() => {
        if (entry.classList.contains('show')) anim.play();
        else anim.pause();
      }).observe(entry, { attributes: true, attributeFilter: ['class'] });
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          if (bg.offsetWidth > 0 && bg.offsetHeight > 0) anim.resize();
        });
        ro.observe(bg);
      }
    });
  // 윈도우 리사이즈 시에도 명시적으로 한 번 더 호출 (일부 브라우저에서 ResizeObserver 지연 대응)
  window.addEventListener('resize', () => {
    if (typeof lottie !== 'undefined' && lottie.resize) lottie.resize();
  });
})();

// ── Type B 그리드 배치: 컨테이너 비율 기반 1×4 / 2×2 토글 ──
// .qb-grid 자기 자신을 ResizeObserver 로 관찰.
//   width >= height (가로가 더 넓음) → .qb-grid--row (1행 4열): 카드가 세로로 길어 리코더가 크게 보임.
//   width <  height (세로가 더 길음) → 기본 (.qb-grid 2×2): 카드가 정사각형에 가까움.
// .quiz-stage 가 display:none 일 땐 0×0 으로 관찰되지만 시각상 차이 없음.
// stage 가 show 되며 실제 dimensions 가 측정되는 순간 정확한 클래스가 토글됨.
(function setupQbGridLayout() {
  const grid = document.getElementById('qbGrid');
  if (!grid || !('ResizeObserver' in window)) return;
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width === 0 && height === 0) continue;        // hidden 상태 무시
      // 모바일(<=767px)에선 2×2 강제 — 가로가 살짝 더 넓어도 카드가 너무 작아져 리코더가 안 보임.
      const isMobile = window.innerWidth <= 767;
      grid.classList.toggle('qb-grid--row', !isMobile && width >= height);
    }
  });
  ro.observe(grid);
})();

// ── 탭/팝업 이벤트 바인딩 ──
// 인라인 onclick 대신 data-action 으로 식별 → 한 곳에서 분기.
// quiz.js / practice.js 가 자체적으로 바인딩하는 요소(qe-start, pvt/ppr/pp 버튼 등)는
// 여기서 다루지 않음 — 중복 바인딩 방지.
document.querySelectorAll('[data-action]').forEach(el => {
  el.addEventListener('click', () => {
    const action = el.dataset.action;
    switch (action) {
      case 'mode-learn':
      case 'mode-practice':
      case 'mode-quiz': {
        const target = action === 'mode-learn' ? 'learn' : action === 'mode-practice' ? 'practice' : 'quiz';
        if (currentMode === 'quiz' && (quizState === 'playing' || quizState === 'feedback')) {
          _pendingQuitMode = target;
          document.getElementById('quizQuitPopup').classList.add('show');
        } else {
          setMode(target);
        }
        break;
      }
      case 'song-airplane':        setPracticeSong('airplane');                       break;
      case 'song-hans':            setPracticeSong('hans');                           break;
      case 'practice-popup-yes':   _practicePopupYes();                               break;
      case 'practice-popup-no':    _practicePopupNo();                                break;
      case 'quiz-start':           startQuizSession();                                break;
      case 'show-quiz-entry':      showQuizEntry();                                   break;
      case 'review-tab-all':       _setReviewTab('all');                              break;
      case 'review-tab-wrong':     _setReviewTab('wrong');                            break;
      case 'song-airplane-mobile': setPracticeSong('airplane');                       break;
      case 'song-hans-mobile':     setPracticeSong('hans');                           break;
      case 'view-both':            setPracticeView('both');                           break;
      case 'view-score':           setPracticeView('score');                          break;
      case 'view-recorder':        setPracticeView('recorder');                       break;
      case 'play-pause':           togglePlayPause();                                 break;
      case 'stop-reset':           stopAndReset();                                    break;
      case 'toggle-mute-practice': _ppToggleMute();                                   break;
      case 'rate-05':              _ppSetRate(0.5);                                   break;
      case 'rate-10':              _ppSetRate(1.0);                                   break;
      case 'rate-15':              _ppSetRate(1.5);                                   break;
      case 'toggle-note-label':    toggleNoteLabel();                                 break;
      case 'toggle-mute-learn':    _toggleLearnMute();                                break;
      case 'quiz-quit-yes':
        document.getElementById('quizQuitPopup').classList.remove('show');
        if (_pendingQuitMode) { setMode(_pendingQuitMode); _pendingQuitMode = null; }
        break;
      case 'quiz-quit-no':
        document.getElementById('quizQuitPopup').classList.remove('show');
        _pendingQuitMode = null;
        break;
      case 'quiz-submit':          submitQuiz();                                      break;
      case 'quiz-next':            nextQuestion();                                    break;
    }
  });
});

