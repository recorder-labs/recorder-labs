﻿/* quiz.js — 퀴즈 상태, 문제 출제, 채점 */

let quizConfig = { count: 10, type: 'ALL' };
let quizQueue = [];
let quizIndex = 0;
let quizScore = 0;       // 맞힌 개수 (✓ chip)
let quizWrongCount = 0;  // 틀린 개수 (× chip)
let quizState = 'idle';
let currentQuestion = null;
let userSelected = new Set();
let quizDone = false;

function resetHoles() {
  HOLES.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.fill = EMPTY; el.style.stroke = ''; el.style.strokeWidth = ''; }
    const pel = document.getElementById('pr_' + id);
    if (pel) { pel.style.fill = EMPTY; pel.style.stroke = ''; pel.style.strokeWidth = ''; }
  });
}
function applyFingering(note, color) {
  resetHoles();
  if (!note) return;
  NOTES[note].closed.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.fill = color || FILLED;
    const pel = document.getElementById('pr_' + id);
    if (pel) pel.style.fill = color || FILLED;
  });
}

function buildButtons() {
  const grid = document.getElementById('noteGrid');
  grid.innerHTML = '';
  NOTE_NAMES.forEach((n, i) => {
    const btn = document.createElement('button');
    btn.className = 'note-btn';
    btn.dataset.nidx = String(i);
    btn.textContent = NOTES[n].label;
    btn.onclick = () => selectNote(n, btn);
    grid.appendChild(btn);
  });
}
function selectNote(name, btn) {
  if (currentMode !== 'learn') return;
  document.querySelectorAll('#noteGrid .note-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  applyFingering(name);
  showSheetNote(name);
  const sheetWrap = document.getElementById('sheetWrap');
  const alreadyVisible = sheetWrap.classList.contains('visible');
  sheetWrap.classList.add('visible');
  if (alreadyVisible) {
    playNote(name);
  } else {
    setTimeout(() => playNote(name), 200);
  }
}

/* ── 엔트리 폼 가변 (1920px 뷰포트에서 qe-scroll ≈ 1075px 기준) ──
   r = liveW / QUIZ_ENTRY.REF_W. 폰트·여백 모두 r 비례.
   MIN 값은 1280px CSS 미디어쿼리값과 일치 → 좁은 폭에서 JS 가 CSS 에 자연 hand-off.
   최댓값 없음 → 4K 에서도 상한 없이 비례 증가 (_syncLearnLayout 과 동일).
   _syncLearnLayout 과 동일한 패턴: hysteresis(2px) + rAF 디바운스.

   추가 클램프: qe-scroll-frame 이 overflow:hidden 이고 qe-scroll-row 가
   height:100% 로 잠겨 있어 콘텐츠가 길어지면 잘림 → qe-form 의 border-box
   높이가 frame.clientHeight 를 넘으면 r 을 비례 축소 후 재적용 (최대 3회 반복,
   각 속성 MIN clamp 비선형 대응 위해 convergence 검사). */
let _qeFormLastW = 0;
let _qeFormLastFrameH = 0;
let _qeFormRAF = null;
let _qeFormObs = null;

function _applyQeFormScale(r) {
  const fs = (base, min) => Math.max(min, Math.round(base * r)) + 'px';
  const sp = (base, min) => Math.max(min, Math.round(base * r)) + 'px';

  // 폰트
  const title = document.querySelector('.qe-title');
  const labels = document.querySelectorAll('.qe-section-label');
  const chips  = document.querySelectorAll('.qe-chip');
  const descs  = document.querySelectorAll('.qe-desc');
  const start  = document.querySelector('.qe-start');

  if (title)  title.style.fontSize  = fs(QUIZ_ENTRY.TITLE_FONT, QUIZ_ENTRY.TITLE_FONT_MIN);
  labels.forEach(el => el.style.fontSize = fs(QUIZ_ENTRY.LABEL_FONT, QUIZ_ENTRY.LABEL_FONT_MIN));
  chips.forEach(el  => el.style.fontSize = fs(QUIZ_ENTRY.CHIP_FONT,  QUIZ_ENTRY.CHIP_FONT_MIN));
  descs.forEach(el  => el.style.fontSize = fs(QUIZ_ENTRY.DESC_FONT,  QUIZ_ENTRY.DESC_FONT_MIN));
  if (start)  start.style.fontSize  = fs(QUIZ_ENTRY.START_FONT, QUIZ_ENTRY.START_FONT_MIN);

  // 여백
  const qeForm = document.querySelector('.qe-form');
  const sections = document.querySelector('.qe-sections');
  const sectionList = document.querySelectorAll('.qe-section');

  if (qeForm) {
    const padV = sp(QUIZ_ENTRY.FORM_PAD_V, QUIZ_ENTRY.FORM_PAD_V_MIN);
    const padH = sp(QUIZ_ENTRY.FORM_PAD_H, QUIZ_ENTRY.FORM_PAD_H_MIN);
    qeForm.style.padding = padV + ' ' + padH;
    qeForm.style.gap = sp(QUIZ_ENTRY.FORM_GAP, QUIZ_ENTRY.FORM_GAP_MIN);
  }
  if (sections) sections.style.gap = sp(QUIZ_ENTRY.SECTIONS_GAP, QUIZ_ENTRY.SECTIONS_GAP_MIN);
  sectionList.forEach(el => el.style.gap = sp(QUIZ_ENTRY.SECTION_GAP, QUIZ_ENTRY.SECTION_GAP_MIN));

  // chip 그룹 gap
  document.querySelectorAll('.qe-chips').forEach(el =>
    el.style.gap = sp(QUIZ_ENTRY.CHIPS_GAP, QUIZ_ENTRY.CHIPS_GAP_MIN));

  // chip 개별 padding
  document.querySelectorAll('.qe-chip').forEach(el => {
    el.style.paddingTop    = sp(QUIZ_ENTRY.CHIP_PAD_V, QUIZ_ENTRY.CHIP_PAD_V_MIN);
    el.style.paddingBottom = sp(QUIZ_ENTRY.CHIP_PAD_V, QUIZ_ENTRY.CHIP_PAD_V_MIN);
    el.style.paddingLeft   = sp(QUIZ_ENTRY.CHIP_PAD_H, QUIZ_ENTRY.CHIP_PAD_H_MIN);
    el.style.paddingRight  = sp(QUIZ_ENTRY.CHIP_PAD_H, QUIZ_ENTRY.CHIP_PAD_H_MIN);
  });

  // desc 박스 padding
  document.querySelectorAll('.qe-desc').forEach(el => {
    el.style.paddingTop    = sp(QUIZ_ENTRY.DESC_PAD_V, QUIZ_ENTRY.DESC_PAD_V_MIN);
    el.style.paddingBottom = sp(QUIZ_ENTRY.DESC_PAD_V, QUIZ_ENTRY.DESC_PAD_V_MIN);
    el.style.paddingLeft   = sp(QUIZ_ENTRY.DESC_PAD_H, QUIZ_ENTRY.DESC_PAD_H_MIN);
    el.style.paddingRight  = sp(QUIZ_ENTRY.DESC_PAD_H, QUIZ_ENTRY.DESC_PAD_H_MIN);
  });

  // 시작 버튼 margin-top / padding
  const startBtn = document.querySelector('.qe-start');
  if (startBtn) {
    startBtn.style.marginTop     = sp(QUIZ_ENTRY.START_MARGIN_TOP, QUIZ_ENTRY.START_MARGIN_TOP_MIN);
    startBtn.style.paddingTop    = sp(QUIZ_ENTRY.START_PAD_V,      QUIZ_ENTRY.START_PAD_V_MIN);
    startBtn.style.paddingBottom = sp(QUIZ_ENTRY.START_PAD_V,      QUIZ_ENTRY.START_PAD_V_MIN);
    startBtn.style.paddingLeft   = sp(QUIZ_ENTRY.START_PAD_H,      QUIZ_ENTRY.START_PAD_H_MIN);
    startBtn.style.paddingRight  = sp(QUIZ_ENTRY.START_PAD_H,      QUIZ_ENTRY.START_PAD_H_MIN);
  }

  // section-label 내부 gap
  document.querySelectorAll('.qe-section-label').forEach(el =>
    el.style.gap = sp(QUIZ_ENTRY.LABEL_GAP, QUIZ_ENTRY.LABEL_GAP_MIN));

  // section-label::before 바 높이 — CSS 변수로 제어
  document.querySelectorAll('.qe-section-label').forEach(el =>
    el.style.setProperty('--qe-bar-h',
      sp(QUIZ_ENTRY.BAR_H, QUIZ_ENTRY.BAR_H_MIN)));
}

/* 767px 이하 모바일 진입 시 인라인 스타일 클리어 → CSS @media (max-width:767px) 블록이 담당.
   인라인 명시도(1,0,0,0) > @media 내 클래스(0,0,1,0) 이라 JS 인라인이 살아있으면
   미디어쿼리 값(.qe-chip 14px 등)을 적용 못 함. */
function _clearQeFormInlineStyles() {
  const qeForm = document.querySelector('.qe-form');
  if (qeForm) {
    qeForm.style.padding = '';
    qeForm.style.gap = '';
    qeForm.style.transform = '';
    qeForm.style.transformOrigin = '';
  }
  const title = document.querySelector('.qe-title');
  if (title) title.style.fontSize = '';
  const start = document.querySelector('.qe-start');
  if (start) {
    start.style.fontSize = '';
    start.style.marginTop = '';
    start.style.paddingTop = '';
    start.style.paddingBottom = '';
    start.style.paddingLeft = '';
    start.style.paddingRight = '';
  }
  document.querySelectorAll('.qe-section-label').forEach(el => {
    el.style.fontSize = '';
    el.style.gap = '';
    el.style.removeProperty('--qe-bar-h');
  });
  document.querySelectorAll('.qe-chip').forEach(el => {
    el.style.fontSize = '';
    el.style.paddingTop = '';
    el.style.paddingBottom = '';
    el.style.paddingLeft = '';
    el.style.paddingRight = '';
  });
  document.querySelectorAll('.qe-desc').forEach(el => {
    el.style.fontSize = '';
    el.style.paddingTop = '';
    el.style.paddingBottom = '';
    el.style.paddingLeft = '';
    el.style.paddingRight = '';
  });
  document.querySelectorAll('.qe-section').forEach(el => el.style.gap = '');
  document.querySelectorAll('.qe-sections').forEach(el => el.style.gap = '');
  document.querySelectorAll('.qe-chips').forEach(el => el.style.gap = '');
}

function _syncQeFormSize() {
  const form = document.querySelector('.qe-scroll');
  if (!form) return;
  const frame = document.querySelector('.qe-scroll-frame');
  const qeForm = document.querySelector('.qe-form');
  const w = form.getBoundingClientRect().width;
  const frameH = frame ? frame.clientHeight : 0;
  if (!w) return;
  // 모바일(<=767px) → CSS @media (max-width:767px) 가 담당. JS 인라인이 살아 있으면
  // 미디어쿼리 명시도(0,0,1,0)를 인라인(1,0,0,0)이 이겨 CSS 값이 안 보임 → 인라인 클리어.
  // hysteresis 리셋: 모바일→데스크탑 재진입 시 강제 재계산.
  // 추가: CSS @media 적용 후 qe-form 의 padding 포함 자연 높이(offsetHeight) 가
  //       frame.clientHeight 보다 크면 transform:scale 로만 시각 축소 → "퀴즈 시작!" 같은
  //       하단 요소가 잘리지 않음. 폰트/여백은 CSS @media 값 그대로 유지.
  if (window.innerWidth <= 767) {
    _clearQeFormInlineStyles();
    _qeFormLastW = 0;
    _qeFormLastFrameH = 0;
    if (frameH > 0 && qeForm) {
      const formH = qeForm.offsetHeight;
      if (formH > frameH) {
        const scale = frameH / formH;
        qeForm.style.transform = 'scale(' + scale + ')';
        qeForm.style.transformOrigin = '50% 0';
      }
    }
    return;
  }
  // 두 차원(뷰포트 너비 + frame 높이) 모두 hysteresis 통과해야 스킵.
  // 가로 리사이즈 → viewport 너비 변화로 catch, 세로 리사이즈 → frame 높이 변화로 catch.
  const vw = window.innerWidth;
  if (Math.abs(vw - _qeFormLastW) < 2 && Math.abs(frameH - _qeFormLastFrameH) < 2) return;
  _qeFormLastW = vw;
  _qeFormLastFrameH = frameH;

  // 측정 안정성: 이전 sync 에서 적용된 transform 잔재가 자식 측정에 간섭하지 않도록 클리어.
  // (offsetHeight 자체는 transform 무관이지만, transform 영향 받는 다른 측정 경로의 안전책)
  if (qeForm) {
    qeForm.style.transform = '';
    qeForm.style.transformOrigin = '';
  }

  let r = window.innerWidth / QUIZ_ENTRY.VIEWPORT_REF;
  _applyQeFormScale(r);

  // 높이 클램프: qe-form border-box 가 frame.clientHeight 보다 크면 r 을 축소 후 재적용.
  // 각 속성 MIN clamp 때문에 비선형 → 최대 3회 반복하며 convergence 검사.
  if (frameH > 0 && qeForm) {
    let prevH = Infinity;
    for (let i = 0; i < 3; i++) {
      const formH = qeForm.offsetHeight;
      if (formH <= frameH) break;
      if (Math.abs(prevH - formH) < 1) break;
      prevH = formH;
      r = r * (frameH / formH);
      _applyQeFormScale(r);
    }
    // 안전망: r 축소만으로 수렴 못 한 경우 transform:scale 로 시각적 축소.
    // MIN clamp 에 묶여 더 줄지 않는 세로 항목들(CHIP_PAD_V, DESC_PAD_V, LABEL_GAP, BAR_H 등 baseline=MIN)이
    // 지배적인 좁고 짧은 viewport 환경 대응. transformOrigin '50% 0' 으로 top-center 고정 →
    // 위쪽부터 채우고 frame 안에 시각적으로 정확히 fit. layout 박스는 그대로 커서 frame.overflow:hidden 이
    // 보이지 않는 영역을 잘라 가림 (시각적 잘림 없음).
    const finalH = qeForm.offsetHeight;
    if (finalH > frameH) {
      const scale = frameH / finalH;
      qeForm.style.transform = 'scale(' + scale + ')';
      qeForm.style.transformOrigin = '50% 0';
    }
  }
}

function _scheduleQeFormSync() {
  if (_qeFormRAF !== null) return;
  _qeFormRAF = requestAnimationFrame(() => {
    _qeFormRAF = null;
    _syncQeFormSize();
  });
}

function _setupQeFormObserver() {
  if (_qeFormObs) { _qeFormObs.disconnect(); _qeFormObs = null; }
  const form = document.querySelector('.qe-scroll');
  if (!form || typeof ResizeObserver === 'undefined') return;
  _qeFormObs = new ResizeObserver(_scheduleQeFormSync);
  _qeFormObs.observe(form);
  _syncQeFormSize(); // 초기 1회 실행
}

/* ── 엔트리 화면 ── */
function showQuizEntry() {
  quizState = 'entry';
  currentQuestion = null;
  _hideAllQuizStages();
  document.getElementById('recorderStage').classList.remove('quiz-rec', 'quiz-play-stage');
  document.getElementById('recorderStage').style.display = 'none';
  document.querySelectorAll('#qeCountChips .qe-chip').forEach(b => b.classList.toggle('active', +b.dataset.count === quizConfig.count));
  document.querySelectorAll('#qeTypeChips  .qe-chip').forEach(b => b.classList.toggle('active', b.dataset.type === quizConfig.type));
  document.getElementById('qeDesc').textContent = QUIZ_TYPE_DESC[quizConfig.type] || QUIZ_TYPE_DESC.ALL;
  document.getElementById('quizEntryStage').classList.add('show');
  document.getElementById('quizSideInfo').style.display = 'none';
  document.getElementById('quizBar').classList.add('is-hidden');
  document.getElementById('quizEndBar').classList.add('is-hidden');
  _qzLeaveEndScrollMode();
  // 엔트리 폼 가변: 옵저버 재등록 + 초기 1회 sync 실행.
  _setupQeFormObserver();
}
function _hideAllQuizStages() {
  ['quizEntryStage','quizGridStage','quizSheetStage','quizDrawStage','quizEndStage'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.remove('show');
  });
  _hideCelebration();
}

/* ── 큐 빌더 (유형 내 중복 없이 무작위) ── */
function _buildQuizQueue() {
  const types = quizConfig.type === 'ALL' ? QUIZ_TYPES_DEFAULT.slice() : [quizConfig.type];
  const usedByType = {}; types.forEach(t => usedByType[t] = []);
  const queue = [];
  for (let i = 0; i < quizConfig.count; i++) {
    const t = types[Math.floor(Math.random() * types.length)];
    // Type D 는 파♯/시♭ 가 자연음과 같은 staff 위치라 별도 풀 사용
    const fullPool = (t === 'D') ? QUIZ_TYPE_D_NOTES : NOTE_NAMES;
    let pool = fullPool.filter(n => !usedByType[t].includes(n));
    if (pool.length === 0) { usedByType[t] = []; pool = fullPool.slice(); }
    const note = pool[Math.floor(Math.random() * pool.length)];
    usedByType[t].push(note);
    queue.push({ type: t, note });
  }
  return queue;
}

/* ── 세션 시작 / 다음 / 종료 ── */
function startQuizSession() {
  quizQueue = _buildQuizQueue();
  quizIndex = 0;
  quizScore = 0;
  quizWrongCount = 0;
  showQuestion();
}
function nextQuestion() {
  _hideCelebration();
  document.getElementById('feedback').classList.add('is-hidden');
  quizIndex++;
  showQuestion();
}
function showQuestion() {
  if (quizIndex >= quizQueue.length) { showQuizEnd(); return; }
  quizState = 'playing';
  quizDone = false;
  userSelected = new Set();
  currentQuestion = quizQueue[quizIndex];
  _hideAllQuizStages();
  document.getElementById('quizSideInfo').style.display = 'flex';
  // 진행 바 + 라벨
  const total = quizQueue.length || 1;
  const pct = Math.round(((quizIndex + 1) / total) * 100);
  document.getElementById('quizProgressFill').style.width = pct + '%';
  document.getElementById('quizSideProgress').textContent = `${quizIndex+1}/${quizQueue.length}`;
  // 카운트
  document.getElementById('quizSideScore').textContent  = quizScore;
  document.getElementById('quizWrongCount').textContent = quizWrongCount;
  // 유형 배지
  document.getElementById('quizTypeBadge').textContent  = QUIZ_TYPE_UI_LABELS[currentQuestion.type] || '';
  document.getElementById('feedback').classList.add('is-hidden');
  document.getElementById('quizBar').classList.remove('is-hidden');
  document.getElementById('quizEndBar').classList.add('is-hidden');
  _qzLeaveEndScrollMode();
  // 모든 유형: [제출] 표시(비활성) + [다음] 숨김 → 사용자 선택 후에만 활성화
  document.getElementById('quizSubmitBtn').classList.remove('is-hidden');
  document.getElementById('quizSubmitBtn').disabled      = true;
  document.getElementById('quizNextBtn').classList.add('is-hidden');
  document.getElementById('quizBarLabel').textContent    = '✨ 선택했으면 제출해 주세요!';
  // Type A/E만 리코더 SVG 사용 → hand-legend / hole 숫자 라벨 숨김 토글
  const isRecType = (currentQuestion.type === 'A' || currentQuestion.type === 'E');
  document.getElementById('recorderStage').classList.toggle('quiz-rec', isRecType);
  // .quiz-play-stage 공통 클래스도 같은 조건으로 토글 (Type A/E 플레이 상태 마킹)
  document.getElementById('recorderStage').classList.toggle('quiz-play-stage', isRecType);
  // #quizHintArea(안내 chip + feedback)를 활성 stage의 hint-slot으로 reparent
  _moveHintArea(currentQuestion.type);
  if      (currentQuestion.type === 'A') showTypeA();
  else if (currentQuestion.type === 'B') showTypeB();
  else if (currentQuestion.type === 'C') showTypeC();
  else if (currentQuestion.type === 'D') showTypeD();
  else if (currentQuestion.type === 'E') showTypeE();
  // Type 전환마다 quiz-action-btn dim 재계산 (recorderSvg 가시성 변화에 따라 r 이 바뀌므로
  // type 간 일관성 보장 + 첫 진입 시 inline 스타일이 늦게 적용되는 케이스 차단)
  _learnSyncSchedule();
}
const _HINT_SLOT_ID = { A: 'recHintSlot', B: 'gridHintSlot', C: 'sheetHintSlot', D: 'drawHintSlot', E: 'recHintSlot' };
function _moveHintArea(type) {
  const slot = document.getElementById(_HINT_SLOT_ID[type]);
  const area = document.getElementById('quizHintArea');
  if (slot && area && area.parentElement !== slot) slot.appendChild(area);
}
function _setSubmitEnabled(on) {
  const btn = document.getElementById('quizSubmitBtn');
  if (btn) btn.disabled = !on;
}

/* ── Type A: 운지법 만들기 ── */
function showTypeA() {
  const rec = document.getElementById('recorderStage');
  rec.style.display = '';
  document.getElementById('sheetWrap').classList.remove('visible');
  document.getElementById('quizSideSub').textContent   = '구멍을 클릭해 알맞은 운지법을 만들어 보세요';
  // 스테이지 상단 프롬프트: 계이름 '<note>'의 운지법은?
  document.getElementById('quizStagePromptNote').textContent   = NOTES[currentQuestion.note].label;
  document.getElementById('quizStagePromptSuffix').textContent = '의 운지법은?';
  // 다음 문제 진입 시: 이전 문제에서 닫혀 있던 hole 이 .15s fade 로 천천히 열리던 동작 제거.
  // .no-hole-fade 부여 → resetHoles() 의 fill 변경이 transition 없이 즉시 commit →
  // 강제 reflow 로 paint 직전에 'transition:none + fill:EMPTY' 상태를 묶어서 flush →
  // 다음 프레임에 클래스 해제 → 이후 사용자 클릭은 원래 .15s 애니메이션 유지.
  rec.classList.add('no-hole-fade');
  resetHoles();
  void rec.offsetHeight;
  requestAnimationFrame(() => rec.classList.remove('no-hole-fade'));
  HOLES.forEach(id => { const el = document.getElementById(id); if (el) el.style.cursor = 'pointer'; });
  document.querySelectorAll('[data-pad-for]').forEach(ov => { ov.style.cursor = 'pointer'; });
}

/* ── [제출] 디스패처: 사용자 선택 → 제출 → 피드백 ── */
function submitQuiz() {
  if (!currentQuestion || quizState !== 'playing' || quizDone) return;
  const t = currentQuestion.type;
  if (t === 'A') {
    if (userSelected.size === 0) return;
    _submitTypeA();
  } else if (t === 'B') {
    if (!currentQuestion.pickedCard) return;
    _submitTypeB();
  } else if (t === 'C') {
    if (!currentQuestion.pickedOption) return;
    _submitTypeC();
  } else if (t === 'D') {
    if (!currentQuestion.pickedNote) return;
    _submitTypeD();
  } else if (t === 'E') {
    if (!currentQuestion.pickedHole) return;
    _submitTypeE();
  }
}
function _submitTypeA() {
  quizDone = true; quizState = 'feedback';
  const correct = new Set(NOTES[currentQuestion.note].closed);
  const ok = [...correct].every(h => userSelected.has(h)) && [...userSelected].every(h => correct.has(h));
  // 리뷰용 데이터 — userSelected 스냅샷 + 정답 여부 (currentQuestion 은 quizQueue 의 원소라 persist 됨)
  currentQuestion.userAnswer = new Set(userSelected);
  currentQuestion.isCorrect = ok;
  // 제출 직후 모든 hole 의 cursor 를 default 로 전환 (인터랙션 종료 시각화) — 정답/오답 공통.
  HOLES.forEach(hid => {
    const el = document.getElementById(hid);
    if (el) el.style.cursor = 'default';
  });
  document.querySelectorAll('[data-pad-for]').forEach(ov => { ov.style.cursor = 'default'; });
  if (ok) { _onCorrect(); return; }
  // 오답: 좌측은 사용자 클릭 상태 그대로 유지. 우측 5:5 분할로 정답 리코더 노출.
  _showAnswerRecorder(currentQuestion.note);
  _onWrong();
}
/* Type A 오답 시 정답 리코더(우측 5:5)를 #answerRecorderSlot 에 클론 삽입.
   _buildQuizRecorderClone 재사용 — 'qans' prefix 로 id/class 충돌 방지.
   닫힌(정답) hole 은 rgb(224,80,80) 빨강으로 재칠해 정답 위치 강조. */
function _showAnswerRecorder(noteName) {
  const slot = document.getElementById('answerRecorderSlot');
  if (!slot) return;
  slot.innerHTML = '';
  const closedSet = new Set(NOTES[noteName].closed);
  const clone = _buildQuizRecorderClone(closedSet, 'qans');
  if (!clone) return;
  HOLES.forEach(hid => {
    if (!closedSet.has(hid)) return;
    const el = clone.querySelector('#qans_' + hid);
    if (el) {
      el.style.fill = '#08bb68';
      el.classList.add('qans-hole');  // pulse 애니메이션 (연한 초록 ↔ 짙은 초록 4회)
    }
  });
  slot.appendChild(clone);
  const row = document.querySelector('#recorderStage .recorder-row');
  if (row) row.classList.add('quiz-wrong-split');
}
function _hideAnswerRecorder() {
  const slot = document.getElementById('answerRecorderSlot');
  if (slot) slot.innerHTML = '';
  const row = document.querySelector('#recorderStage .recorder-row');
  if (row) row.classList.remove('quiz-wrong-split');
}
function _submitTypeB() {
  quizDone = true; quizState = 'feedback';
  const card = currentQuestion.pickedCard;
  // 리뷰용 — 사용자가 고른 카드의 closedSet 스냅샷 + 정답 여부
  currentQuestion.userAnswer = card._closed ? new Set(card._closed) : new Set();
  currentQuestion.isCorrect = (card.dataset.correct === '1');
  // 리뷰 화면용 — 4지선다 중 사용자가 고른 카드 / 정답 카드의 인덱스(0~3) 보존.
  // 리뷰의 badge 에 '첫번째/두번째/세번째/네번째' 라벨로 표시하기 위함.
  const _qbCards = Array.from(document.querySelectorAll('#qbGrid .qb-card'));
  currentQuestion.qbPickedIndex  = _qbCards.indexOf(card);
  currentQuestion.qbCorrectIndex = _qbCards.findIndex(c => c.dataset.correct === '1');
  // 사용자가 선택한 카드는 .picked(보라 var(--cta) + var(--navi-light)) 컬러 그대로 유지 →
  //   correct/wrong 어느 경우든 본인 선택의 시각 상태는 바꾸지 않음.
  // 정답 카드(사용자가 선택하지 않은)에만 .correct(초록) 부여.
  document.querySelectorAll('#qbGrid .qb-card').forEach(c => {
    c.classList.add('disabled');
    if (c === card) return;
    c.classList.remove('picked');
    if (c.dataset.correct === '1') c.classList.add('correct');
  });
  if (card.dataset.correct === '1') _onCorrect();
  else _onWrong('정답 운지법을 살펴보세요!');
}
function _submitTypeC() {
  quizDone = true; quizState = 'feedback';
  const btn = currentQuestion.pickedOption;
  const picked = btn.dataset.note;
  // 리뷰용 — 사용자가 고른 옵션의 음이름 + 정답 여부
  currentQuestion.userAnswer = picked;
  currentQuestion.isCorrect = (picked === currentQuestion.note);
  // 사용자가 선택한 옵션은 .picked 컬러 그대로 유지 → correct/wrong 어느 경우든
  // 본인 선택의 시각 상태는 바꾸지 않음. 정답 옵션(사용자가 선택하지 않은)에만 .correct 부여.
  document.querySelectorAll('#qcOptions .qc-option').forEach(b => {
    b.classList.add('disabled');
    if (b === btn) return;
    b.classList.remove('picked');
    if (b.dataset.note === currentQuestion.note) b.classList.add('correct');
  });
  if (picked === currentQuestion.note) _onCorrect();
  else _onWrong('정답 계이름을 확인해 보세요!');
}
function _submitTypeE() {
  quizDone = true; quizState = 'feedback';
  HOLES.forEach(hid => { const he = document.getElementById(hid); if (he) he.style.cursor = 'default'; });
  document.querySelectorAll('[data-pad-for]').forEach(ov => { ov.style.cursor = 'default'; });
  // 정답 판정: 사용자 pick 이 flipped 그룹에 속하는지 확인 (짝구멍이면 둘 중 어느 쪽 클릭이든 인정).
  const isCorrect = currentQuestion.flippedHoles.has(currentQuestion.pickedHole);
  // 리뷰용 — 사용자가 클릭한 hole + 정답 여부 (flippedHoles 는 이미 currentQuestion 에 저장돼 있음)
  currentQuestion.userAnswer = currentQuestion.pickedHole;
  currentQuestion.isCorrect = isCorrect;
  if (isCorrect) {
    // 정답: 선택 그룹(자신 + partner) 모두를 원래 정답 상태(검정/흰색)로 복원 + 보라 테두리.
    const TYPE_E_PAIRS = { h6_1: 'h6_2', h6_2: 'h6_1', h7_1: 'h7_2', h7_2: 'h7_1' };
    const correctClosed = new Set(NOTES[currentQuestion.note].closed);
    const partnerId = TYPE_E_PAIRS[currentQuestion.pickedHole] || null;
    [currentQuestion.pickedHole, partnerId].filter(Boolean).forEach((tid) => {
      const tel = document.getElementById(tid);
      if (!tel) return;
      const shouldClose = correctClosed.has(tid);
      tel.style.fill = shouldClose ? FILLED : EMPTY;
      tel.style.stroke = '#442AFF';
      tel.style.strokeWidth = '4';
    });
    _onCorrect();
  } else {
    // 오답: 선택 구멍의 보라 stroke 는 그대로 유지 + 5:5 분할로 정답 운지법 표시
    _showAnswerRecorder(currentQuestion.note);
    _onWrong();
  }
}

/* ── Type B: 그림 찾기 (실제 #recorderSvg 클론 재활용) ──
   practiceRecorderSlot 클론 로직과 동일한 prefix 기반 ID/class 리매핑.
   prefix는 카드 인덱스별로 'qb0' ~ 'qb3'로 부여해 다중 클론 충돌 방지. */
function _buildQuizRecorderClone(closedSet, prefix) {
  const orig = document.getElementById('recorderSvg');
  if (!orig) return null;
  const clone = orig.cloneNode(true);
  clone.removeAttribute('id');
  // 1) 모든 [id]를 prefix_id로 리네임
  const idMap = {};
  clone.querySelectorAll('[id]').forEach(el => {
    const oldId = el.id;
    const newId = prefix + '_' + oldId;
    idMap[oldId] = newId;
    el.id = newId;
  });
  // 2) 속성 내 url(#..) / xlink:href 갱신
  clone.querySelectorAll('*').forEach(el => {
    ['fill','stroke','clip-path','filter','mask'].forEach(attr => {
      const v = el.getAttribute(attr);
      if (v) {
        const u = v.replace(/url\(#([^)]+)\)/g, (_, id) => 'url(#' + (idMap[id] || id) + ')');
        if (u !== v) el.setAttribute(attr, u);
      }
    });
    ['xlink:href','href'].forEach(attr => {
      const v = el.getAttribute(attr);
      if (v && v[0] === '#') {
        const id = v.slice(1);
        if (idMap[id]) el.setAttribute(attr, '#' + idMap[id]);
      }
    });
  });
  // 3) 인라인 <style>의 cls-N → prefix-cls-N (전역 CSS 충돌 방지)
  clone.querySelectorAll('style').forEach(s => {
    s.textContent = s.textContent
      .replace(/url\(#([^)]+)\)/g, (_, id) => 'url(#' + (idMap[id] || id) + ')')
      .replace(/\bcls-(\d+)/g, prefix + '-cls-$1');
  });
  clone.querySelectorAll('[class]').forEach(el => {
    const cls = el.getAttribute('class');
    if (cls) el.setAttribute('class', cls.replace(/\bcls-(\d+)/g, prefix + '-cls-$1'));
  });
  // 4) hole fill 적용 (closedSet에 따라 검정/흰색) + stroke 초기화.
  // 원본 #recorderSvg 에 사용자가 Type A 에서 클릭해 남긴 stroke(보라 #442AFF) 가
  // cloneNode(true) 로 그대로 복제될 수 있으므로 명시적으로 비워 깨끗한 상태로 표시.
  // (Type B 카드, Type A 정답 패널 qans 양쪽 모두 동일하게 적용 — 두 곳 다 stroke 가 없어야 자연스러움)
  HOLES.forEach(hid => {
    const h = clone.querySelector('#' + prefix + '_' + hid);
    if (h) {
      h.style.fill = closedSet.has(hid) ? FILLED : EMPTY;
      h.style.stroke = '';
      h.style.strokeWidth = '';
    }
  });
  // 5) hole 옆 숫자 라벨(holeLabels)은 카드 내 가독성 위해 숨김
  const labels = clone.querySelector('#' + prefix + '_holeLabels');
  if (labels) labels.classList.add('is-hidden');
  // 6) 카드 클릭이 SVG 내부에서도 일관되게 동작하도록
  clone.style.pointerEvents = 'none';
  return clone;
}
function _flipHoles(baseClosed, count) {
  const set = new Set(baseClosed);
  const idx = HOLES.slice();
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  for (let i = 0; i < count; i++) {
    const h = idx[i];
    if (set.has(h)) set.delete(h); else set.add(h);
  }
  return [...set];
}
/* Type B 보기 생성 — 정답 1 + 오답 3, 모든 보기가 NOTES 사전의 valid 계이름 운지.
   이전엔 _flipHoles 로 랜덤 hole 뒤집어서 'valid note 아님' 변형을 만들었는데, 그 결과
   h6_1/h6_2 또는 h7_1/h7_2 (더블홀 좌·우 분리) 중 한쪽만 막힌 비대칭 상태가 화면에 노출되는 문제 발생.
   현재는 정답을 제외한 NOTES 에서 3개를 랜덤 선택 → 더블홀 비대칭 불가, 리뷰 hint 도
   '내가 선택한 그림은 X 운지법이에요' 형태로 항상 valid 계이름 라벨 표기 가능. */
function _generateTypeBChoices(correctNoteName) {
  const correctClosed = NOTES[correctNoteName].closed;
  // 정답을 제외한 계이름 풀에서 Fisher-Yates 셔플 후 앞 3개를 오답으로
  const pool = NOTE_NAMES.filter(n => n !== correctNoteName);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const wrongs = pool.slice(0, 3).map(n => NOTES[n].closed.slice());
  const all = [{ closed: correctClosed.slice(), correct: true },
               ...wrongs.map(c => ({ closed: c, correct: false }))];
  // 4 카드의 화면 배치 순서 셔플 (정답 위치 랜덤)
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}
function showTypeB() {
  document.getElementById('recorderStage').style.display = 'none';
  document.getElementById('quizGridStage').classList.add('show');
  document.getElementById('qbPromptNote').textContent  = NOTES[currentQuestion.note].label;
  document.getElementById('quizSideSub').textContent   = '올바른 리코더 운지법을 골라 보세요';
  const choices = _generateTypeBChoices(currentQuestion.note);
  const grid = document.getElementById('qbGrid');
  // 카드만 제거 — feedback-flash 등 다른 자식(현재 #feedbackFlashGrid 가 같은 grid 안에 위치)은 보존.
  grid.querySelectorAll('.qb-card').forEach(c => c.remove());
  choices.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'qb-card';
    card.dataset.correct = c.correct ? '1' : '0';
    card._closed = new Set(c.closed); // 리뷰 화면용 — 카드의 closedSet 보존
    const svg = _buildQuizRecorderClone(new Set(c.closed), 'qb' + i);
    if (svg) card.appendChild(svg);
    card.onclick = () => _onTypeBClick(card);
    grid.appendChild(card);
  });
}
function _onTypeBClick(card) {
  if (quizState !== 'playing' || quizDone) return;
  document.querySelectorAll('#qbGrid .qb-card').forEach(c => c.classList.remove('picked'));
  card.classList.add('picked');
  currentQuestion.pickedCard = card;
  _setSubmitEnabled(true);
}

/* ── Type C: 계이름 읽기 ── */
function _generateTypeCOptions(correctName) {
  const opts = [correctName];
  const pool = NOTE_NAMES.filter(n => n !== correctName);
  while (opts.length < 4 && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    opts.push(pool[i]); pool.splice(i, 1);
  }
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}
function showTypeC() {
  document.getElementById('recorderStage').style.display = 'none';
  document.getElementById('quizSheetStage').classList.add('show');
  document.getElementById('quizSideSub').textContent   = '올바른 계이름을 골라 보세요';
  // 악보 SVG 클론 + 대상 음표만 노출
  const wrap = document.getElementById('qcSheetWrap');
  wrap.innerHTML = '';
  const svg = document.getElementById('sheetSvg').cloneNode(true);
  svg.removeAttribute('id');
  // CSS .qc-sheet-wrap svg 와 동일한 %로 인라인 설정 — 인라인 스타일이 우선이라
  // CSS 값이 무시되지 않도록 같은 값으로 맞춤.
  svg.style.height = '65%'; svg.style.width = '65%'; svg.style.maxHeight = '65%';
  Object.entries(NOTE_SHEET_IDS).forEach(([noteName, sheetId]) => {
    const el = svg.querySelector('#' + sheetId);
    if (el) {
      el.style.display = (noteName === currentQuestion.note) ? 'inline' : 'none';
      el.removeAttribute('id');
    }
  });
  wrap.appendChild(svg);
  const opts = _generateTypeCOptions(currentQuestion.note);
  currentQuestion.qcOptions = opts.slice(); // 리뷰 화면에서 사용할 4-옵션 스냅샷
  const container = document.getElementById('qcOptions');
  container.innerHTML = '';
  opts.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'qc-option';
    btn.textContent = NOTES[name].label;
    btn.dataset.note = name;
    btn.onclick = () => _onTypeCClick(btn);
    container.appendChild(btn);
  });
}
function _onTypeCClick(btn) {
  if (quizState !== 'playing' || quizDone) return;
  document.querySelectorAll('#qcOptions .qc-option').forEach(b => b.classList.remove('picked'));
  btn.classList.add('picked');
  currentQuestion.pickedOption = btn;
  _setSubmitEnabled(true);
}

/* ── Type D: 음표 그리기 (오선지 위 정답 위치 클릭) ──
   계이름이 주어지면 사용자가 빈 오선지 위 음표 위치(Y)를 클릭해 선택.
   구현 흐름:
     1) 원본 sheetSvg 의 각 노트 요소를 임시 표시 → bbox 로 Y 중심값 측정 → yToNote 매핑 구축.
        (파♯/시♭ 는 자연음과 동일 Y 라 풀에서 제외 = QUIZ_TYPE_D_NOTES)
     2) sheetSvg 를 클론해 모든 음표를 숨긴 빈 오선지 상태로 부착. 각 노트 요소에 qd-note-<sheetId>
        클래스를 부여해 클릭 시 preview 표시할 때 selector 로 찾을 수 있게 함.
     3) 클릭 핸들러: 클릭 좌표를 SVG viewBox 로 환산 → 가장 가까운 Y 의 노트로 snap → preview 표시. */
function showTypeD() {
  document.getElementById('recorderStage').style.display = 'none';
  document.getElementById('quizDrawStage').classList.add('show');
  document.getElementById('qdPromptNote').textContent = NOTES[currentQuestion.note].label;
  document.getElementById('quizSideSub').textContent = '오선지에서 음표 위치를 클릭해 보세요';
  // 1) 노트 Y 매핑 — 원본 sheetSvg 의 각 노트를 임시 표시해 bbox 측정 후 원상복구.
  //    주의: getBBox 는 display:none 조상 아래에선 0×0 을 반환하므로, 이전 stage 가 B/C/D 였다면
  //    recorderStage 가 이미 hidden 상태일 수 있음. 그래서 측정 동안만 화면 밖(left:-99999px)에서
  //    잠깐 렌더한 뒤 원상복구 + 명시적 hide.
  const recStage = document.getElementById('recorderStage');
  const saved = {
    display:    recStage.style.display,
    visibility: recStage.style.visibility,
    position:   recStage.style.position,
    left:       recStage.style.left,
    top:        recStage.style.top,
  };
  recStage.style.display    = 'block';
  recStage.style.visibility = 'hidden';
  recStage.style.position   = 'absolute';
  recStage.style.left       = '-99999px';
  recStage.style.top        = '0';
  const yToNote = [];  // [{name, y}]
  QUIZ_TYPE_D_NOTES.forEach(name => {
    const origEl = document.getElementById(NOTE_SHEET_IDS[name]);
    if (!origEl) return;
    const prev = origEl.style.display;
    origEl.style.display = 'inline';
    let bb = null;
    try { bb = origEl.getBBox(); } catch (e) { bb = null; }
    origEl.style.display = prev;
    if (bb && bb.height > 0) yToNote.push({ name, y: bb.y + bb.height / 2 });
  });
  // 측정 끝 — 위치/가시성 원상복구 후 명시적으로 hide (Type D 본 화면에선 recorderStage 가려야 함)
  recStage.style.position   = saved.position;
  recStage.style.left       = saved.left;
  recStage.style.top        = saved.top;
  recStage.style.visibility = saved.visibility;
  recStage.style.display    = 'none';
  // 2) 빈 오선지 클론 부착
  const wrap = document.getElementById('qdSheetWrap');
  wrap.innerHTML = '';
  const svg = document.getElementById('sheetSvg').cloneNode(true);
  svg.removeAttribute('id');
  // height/width/maxHeight 모두 70% — CSS .qd-sheet-wrap svg 와 동일하게 명시적으로 일치시켜 충돌 방지.
  svg.style.height = '55%'; svg.style.width = '55%'; svg.style.maxHeight = '55%';
  Object.values(NOTE_SHEET_IDS).forEach(sheetId => {
    const el = svg.querySelector('#' + sheetId);
    if (el) {
      el.style.display = 'none';
      el.classList.add('qd-note-' + sheetId);
      el.removeAttribute('id');  // 원본과 id 충돌 방지
    }
  });
  wrap.appendChild(svg);
  // g#body 에만 pointer-events 허용 — SVG 여백/패딩 영역 클릭 차단
  const bodyEl = svg.querySelector('#body');
  if (bodyEl) {
    bodyEl.style.pointerEvents = 'all';
    bodyEl.style.cursor = 'pointer';
    // 오선 라인 사이 빈 공간도 클릭 가능하도록 viewBox 전체를 덮는 투명 rect 삽입.
    // SVG <g> 는 자식 요소가 그려진 곳에서만 이벤트를 받으므로, fill:transparent rect 를
    // 가장 뒤(firstChild)에 깔아 빈 공간 클릭이 bodyEl 의 리스너까지 버블링되게 함.
    const vb = svg.viewBox.baseVal;
    const hitRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hitRect.setAttribute('x', vb.x);
    hitRect.setAttribute('y', vb.y);
    hitRect.setAttribute('width', vb.width);
    hitRect.setAttribute('height', vb.height);
    hitRect.setAttribute('fill', 'transparent');
    hitRect.style.pointerEvents = 'all';
    bodyEl.insertBefore(hitRect, bodyEl.firstChild);
  }
  const evtEl = bodyEl || svg;
  // 3) 클릭 핸들러
  evtEl.addEventListener('click', (evt) => _onTypeDClick(evt, svg, yToNote));
  // 4) 호버 미리보기 — mousemove 시 가까운 음표를 옅은 보라(.qd-preview-hover)로 표시,
  //    mouseleave 시 해제. 이미 클릭으로 picked 된 노트(.qd-preview)는 hover 추가 안 함
  //    (진한 보라가 더 우선되어 보이도록).
  const clearHover = () => {
    svg.querySelectorAll('.qd-preview-hover').forEach(el => {
      el.classList.remove('qd-preview-hover');
      if (!el.classList.contains('qd-preview')) el.style.display = 'none';
    });
  };
  evtEl.addEventListener('mousemove', (evt) => {
    if (quizState !== 'playing' || quizDone) return;
    // _onTypeDClick 과 동일한 snap 로직 (yToNote closure 공유)
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    let best = null, bestDist = Infinity;
    yToNote.forEach(entry => {
      const d = Math.abs(local.y - entry.y);
      if (d < bestDist) { bestDist = d; best = entry; }
    });
    if (!best) return;
    const targetEl = svg.querySelector('.qd-note-' + NOTE_SHEET_IDS[best.name]);
    if (!targetEl) return;
    // 이미 같은 노트에 hover 가 들어가 있으면 변경 없음
    if (targetEl.classList.contains('qd-preview-hover')) return;
    clearHover();
    // 클릭으로 picked 된 노트면 hover 표시 생략 (이미 진한 보라로 보임)
    if (targetEl.classList.contains('qd-preview')) return;
    targetEl.style.display = 'inline';
    targetEl.classList.add('qd-preview-hover');
  });
  evtEl.addEventListener('mouseleave', clearHover);
  currentQuestion.pickedNote = null;
}
function _onTypeDClick(evt, svg, yToNote) {
  if (quizState !== 'playing' || quizDone) return;
  // 화면 좌표 → SVG viewBox 좌표
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return;
  const local = pt.matrixTransform(ctm.inverse());
  // 가장 가까운 y 의 노트 찾기
  let best = null, bestDist = Infinity;
  yToNote.forEach(entry => {
    const d = Math.abs(local.y - entry.y);
    if (d < bestDist) { bestDist = d; best = entry; }
  });
  if (!best) return;
  // 기존 preview / hover 모두 제거 후 새 preview 표시
  svg.querySelectorAll('.qd-preview, .qd-preview-correct, .qd-preview-wrong, .qd-preview-hover').forEach(el => {
    el.classList.remove('qd-preview', 'qd-preview-correct', 'qd-preview-wrong', 'qd-preview-hover');
    el.style.display = 'none';
  });
  const targetEl = svg.querySelector('.qd-note-' + NOTE_SHEET_IDS[best.name]);
  if (targetEl) {
    targetEl.style.display = 'inline';
    targetEl.classList.add('qd-preview');
  }
  currentQuestion.pickedNote = best.name;
  _setSubmitEnabled(true);
}
function _submitTypeD() {
  quizDone = true; quizState = 'feedback';
  const svg = document.querySelector('#qdSheetWrap svg');
  if (!svg) return;
  const picked = currentQuestion.pickedNote;
  const target = currentQuestion.note;
  // 정답 비교: 파♯/시♭ 은 풀에 없으므로 단순 이름 비교로 충분
  const isCorrect = (picked === target);
  // 리뷰용 — 사용자가 클릭한 음표 위치(계이름) + 정답 여부
  currentQuestion.userAnswer = picked;
  currentQuestion.isCorrect = isCorrect;
  // 추가 클릭/호버 차단
  svg.style.pointerEvents = 'none';
  if (isCorrect) {
    _onCorrect();
  } else {
    // 오답: 사용자 picked 는 좌측에 그대로 유지(.qd-preview 보라).
    // 우측 5:5 분할로 깨끗한 정답 악보 패널 노출 — 음표 겹침 방지.
    _showAnswerSheet(target);
    document.getElementById('qdRow').classList.add('qd-wrong-split');
    _onWrong(`정답 위치는 <b>${NOTES[target].label}</b> 자리예요!`);
  }
}
/* Type D 오답 시 우측 5:5 패널에 정답 위치만 표시한 깨끗한 악보 클론을 부착.
   sheetSvg 를 새로 clone → 정답 음표(NOTE_SHEET_IDS[noteName]) 만 display:inline + .qd-preview-correct
   다른 음표는 모두 display:none. 클릭/호버 이벤트는 부착 안 함 (정적 표시 전용). */
function _showAnswerSheet(noteName) {
  const slot = document.getElementById('qdAnswerSlot');
  if (!slot) return;
  slot.innerHTML = '';
  const targetSheetId = NOTE_SHEET_IDS[noteName];
  const svg = document.getElementById('sheetSvg').cloneNode(true);
  svg.removeAttribute('id');
  // height/width/maxHeight 모두 70% — 좌측 사용자 패널(qd-sheet-wrap svg)과 동일 사이즈로 통일.
  svg.style.height = '55%'; svg.style.width = '55%'; svg.style.maxHeight = '55%';
  Object.values(NOTE_SHEET_IDS).forEach(sheetId => {
    const el = svg.querySelector('#' + sheetId);
    if (!el) return;
    if (sheetId === targetSheetId) {
      el.style.display = 'inline';
      el.classList.add('qd-preview-correct');
    } else {
      el.style.display = 'none';
    }
    el.removeAttribute('id');  // 원본과 id 충돌 방지
  });
  slot.appendChild(svg);
}
function _hideAnswerSheet() {
  const slot = document.getElementById('qdAnswerSlot');
  if (slot) slot.innerHTML = '';
  const row = document.getElementById('qdRow');
  if (row) row.classList.remove('qd-wrong-split');
}

/* ── Type E: 틀린 구멍 찾기 ── */
function showTypeE() {
  const rec = document.getElementById('recorderStage');
  rec.style.display = '';
  document.getElementById('sheetWrap').classList.remove('visible');
  document.getElementById('quizSideSub').textContent   = '잘못된 구멍을 찾아 클릭해 보세요';
  // 스테이지 상단 프롬프트: 계이름 '<note>'의 잘못된 운지법은?
  document.getElementById('quizStagePromptNote').textContent   = NOTES[currentQuestion.note].label;
  document.getElementById('quizStagePromptSuffix').textContent = '의 운지법에서 잘못된 구멍은?';
  // 정답 운지를 그린 뒤 한 "그룹" 을 통째로 반전.
  // 짝구멍 h6_1↔h6_2, h7_1↔h7_2 는 한 손가락이 두 작은 구멍을 동시에 막는 구조이므로
  // 항상 함께 반전 → 화면상 짝의 한쪽만 어긋난 비현실적 운지가 절대 만들어지지 않음.
  const correctClosed = new Set(NOTES[currentQuestion.note].closed);
  const HOLE_GROUPS = [['h0'],['h1'],['h2'],['h3'],['h4'],['h5'],['h6_1','h6_2'],['h7_1','h7_2']];
  const flippedGroup = HOLE_GROUPS[Math.floor(Math.random() * HOLE_GROUPS.length)];
  currentQuestion.flippedHoles = new Set(flippedGroup);
  currentQuestion.flippedHole  = flippedGroup[0]; // 단일값 호환용 (외부 참조 안전망)
  // 다음 문제 진입 시 hole fill 트랜지션(.15s) 으로 색이 천천히 바뀌어 보이는 현상 제거.
  // .no-hole-fade 부여 → resetHoles() + 신규 fill 설정이 transition 없이 즉시 commit →
  // 강제 reflow 로 paint 직전에 묶어서 flush → 다음 프레임에 클래스 해제.
  // (Type A 의 showTypeA() 와 동일한 패턴)
  rec.classList.add('no-hole-fade');
  resetHoles();
  HOLES.forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const shouldClose = correctClosed.has(id);
    const flippedNow  = currentQuestion.flippedHoles.has(id) ? !shouldClose : shouldClose;
    el.style.fill = flippedNow ? FILLED : EMPTY;
    el.style.cursor = 'pointer';
  });
  document.querySelectorAll('[data-pad-for]').forEach(ov => { ov.style.cursor = 'pointer'; });
  void rec.offsetHeight;
  requestAnimationFrame(() => rec.classList.remove('no-hole-fade'));
}

/* ── 정답/오답 처리 ── */
// 현재 문제가 퀴즈의 마지막인지 판정 → 다음 버튼 라벨을 '다음 문제' / '결과 보기' 로 토글.
function _updateNextBtnLabel() {
  const label = document.getElementById('quizNextBtnLabel');
  if (!label) return;
  const isLast = quizIndex >= quizQueue.length - 1;
  label.textContent = isLast ? '결과 보기' : '다음 문제';
  const barLabel = document.getElementById('quizBarLabel');
  if (barLabel && isLast) barLabel.textContent = '👉 퀴즈 결과를 살펴볼까요?';
}
function _onCorrect() {
  quizScore++;
  document.getElementById('quizSideScore').textContent = quizScore;
  _showCelebration(true);
  document.getElementById('quizSubmitBtn').classList.add('is-hidden');
  document.getElementById('quizNextBtn').classList.remove('is-hidden');
  document.getElementById('quizBarLabel').textContent    = '👉 계속 풀어볼까요?';
  _updateNextBtnLabel();
}
function _onWrong() {
  quizWrongCount++;
  document.getElementById('quizWrongCount').textContent = quizWrongCount;
  _showCelebration(false);
  document.getElementById('quizSubmitBtn').classList.add('is-hidden');
  document.getElementById('quizNextBtn').classList.remove('is-hidden');
  document.getElementById('quizBarLabel').textContent    = '👉 계속 풀어볼까요?';
  _updateNextBtnLabel();
  // feedback wrong div 는 더 이상 노출하지 않음 (플래시 + 5:5 비교 리코더로 대체).
}

/* ── 축하/오답 오버레이 ──
   모든 유형(A~E) 공통 알약 플래시 피드백.
   유형별로 자기 스테이지에 박힌 .feedback-flash 엘리먼트의 id 를 매핑.
   (#celebrationOverlay 텍스트 분기는 더 이상 사용하지 않음 — 일괄 통일) */
const _FLASH_ID_BY_TYPE = {
  A: 'feedbackFlashRec',
  B: 'feedbackFlashGrid',
  C: 'feedbackFlashSheet',
  D: 'feedbackFlashDraw',
  E: 'feedbackFlashRec',
};
const _FLASH_IDS = ['feedbackFlashRec','feedbackFlashGrid','feedbackFlashSheet','feedbackFlashDraw'];
function _showCelebration(isCorrect) {
  const type = currentQuestion && currentQuestion.type;
  const flashId = _FLASH_ID_BY_TYPE[type];
  if (!flashId) return;
  const flash = document.getElementById(flashId);
  if (!flash) return;
  flash.classList.remove('is-hidden');
  flash.classList.toggle('wrong', !isCorrect);
  flash.textContent = isCorrect ? '😚 잘했어요!' : '😅 아쉬워요';
  // 애니메이션 재시작을 위해 reflow trigger
  void flash.offsetWidth;
  flash.style.animation = 'none';
  void flash.offsetWidth;
  flash.style.animation = '';
  if (isCorrect) _spawnBubbleExplosionLottie(flash.parentElement);
}

/* 정답 시 Bubble Explosion Lottie 실행 — recorder-labs/resources/Bubble Explosion.json.
   parent 영역 안에서 가운데 정렬, 1회 재생 후 destroy + DOM 정리.
   사전 fetch 된 _bubbleExplosionData 가 있으면 animationData 로 즉시 재생 시작 (feedback-flash 와 동시 등장).
   아직 캐시 안 됐으면 path 로 fallback (네트워크 fetch 후 재생 — 첫 회만 약간 지연 가능). */
function _spawnBubbleExplosionLottie(parent) {
  if (!parent || typeof lottie === 'undefined') return;
  const wrap = document.createElement('div');
  wrap.className = 'celebration-bubble';
  parent.appendChild(wrap);
  const config = {
    container: wrap,
    renderer: 'svg',
    loop: false,
    autoplay: true,
  };
  if (_bubbleExplosionData) {
    config.animationData = _bubbleExplosionData;
  } else {
    config.path = RESOURCE_URLS.LOTTIE_BUBBLE;
  }
  const anim = lottie.loadAnimation(config);
  // 재생 완료 시 안전하게 정리. fallback: 4초 후에도 강제 정리.
  const cleanup = () => { try { anim.destroy(); } catch(e) {} wrap.remove(); };
  anim.addEventListener('complete', cleanup);
  setTimeout(cleanup, 4000);
}
function _hideCelebration() {
  // 레거시 .celebrationOverlay 도 안전하게 초기화 — 잔존 confetti 정리
  const overlay = document.getElementById('celebrationOverlay');
  if (overlay) {
    overlay.classList.remove('show');
    overlay.querySelectorAll('.css-confetti').forEach(n => n.remove());
  }
  _FLASH_IDS.forEach((id) => {
    const flash = document.getElementById(id);
    if (!flash) return;
    flash.classList.add('is-hidden');
    if (flash.parentElement) {
      flash.parentElement.querySelectorAll('.css-confetti').forEach(n => n.remove());
      flash.parentElement.querySelectorAll('.celebration-bubble').forEach(n => n.remove());
    }
  });
  // Type A 오답 5:5 분할 해제
  _hideAnswerRecorder();
  // Type D 오답 5:5 분할 해제
  _hideAnswerSheet();
}
function _spawnCSSConfetti(parent) {
  if (!parent) return;
  const wrap = document.createElement('div');
  wrap.className = 'css-confetti';
  const colors = ['#ff6b6b','#ffd93d','#6bcf7f','#4dabf7','#9775fa','#ff8787','#69db7c','#fcc419'];
  const N = 36;
  for (let i = 0; i < N; i++) {
    const s = document.createElement('span');
    s.style.left = (Math.random() * 100) + '%';
    s.style.background = colors[i % colors.length];
    s.style.animationDelay    = (Math.random() * 0.4) + 's';
    s.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
    wrap.appendChild(s);
  }
  parent.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3200);
}

/* ── 종료 화면 ── */
function showQuizEnd() {
  quizState = 'end';
  _hideAllQuizStages();
  document.getElementById('recorderStage').classList.remove('quiz-rec', 'quiz-play-stage');
  document.getElementById('recorderStage').style.display = 'none';
  document.getElementById('quizEndStage').classList.add('show');
  document.getElementById('quizSideInfo').style.display = 'none';
  document.getElementById('quizBar').classList.add('is-hidden');
  document.getElementById('quizEndBar').classList.remove('is-hidden');
  _qzEnterEndScrollMode();
  const total = quizQueue.length || quizConfig.count;
  document.getElementById('qzEndCorrect').textContent = quizScore;
  document.getElementById('qzEndTotal').textContent   = total;
  const pct = total > 0 ? quizScore / total : 0;
  let emoji='🤗', title='처음엔 누구나 어려워요❤️', msg='천천히 다시 도전해 봐요. 매일 조금씩 하면 금방 늘어요!';
  if      (pct >= 0.9) { emoji='🥳'; title='리코더 마스터 등장이요🩵'; msg='완벽에 가까워요! 정말 멋있게 풀었어요!'; }
  else if (pct >= 0.7) { emoji='😀'; title='아주 잘했어요~ 훌륭해요💚';      msg='대부분 정답이에요. 한 번만 더 풀면 천재가 될 거예요!'; }
  else if (pct >= 0.5) { emoji='😎'; title='조금만 더 연습해 봐요💛'; msg='절반 이상 맞혔어요! 운지법 익히기로 다시 한 번 익혀봐요.'; }
  document.getElementById('qzEndEmoji').textContent = emoji;
  document.getElementById('qzEndTitle').textContent = title;
  document.getElementById('qzEndMsg').textContent   = msg;
  // 성공률 구간 → qz-tier-1~4 클래스 (CSS 가 가로 모드 한정으로 색상 적용)
  const summary = document.getElementById('qzEndSummary');
  summary.classList.remove('qz-tier-1', 'qz-tier-2', 'qz-tier-3', 'qz-tier-4');
  let _tier = 'qz-tier-1';
  if      (pct >= 0.9) _tier = 'qz-tier-4';
  else if (pct >= 0.7) _tier = 'qz-tier-3';
  else if (pct >= 0.5) _tier = 'qz-tier-2';
  summary.classList.add(_tier);
  // 점수 90% 이상 → [연습하기] 버튼 (음표 아이콘 + setMode('practice')),
  // 그 외 → [운지법 익히기] 버튼 (책 아이콘 + setMode('learn')).
  // 아이콘 SVG path 는 사이드바 .tab-icon (outline) 과 동일.
  const PRACTICE_ICON_D = 'm9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z';
  const LEARN_ICON_D    = 'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25';
  const isMastery = pct >= 0.9;
  document.getElementById('qzEndModeLabel').textContent = isMastery ? '연습하기' : '운지법 익히기';
  document.getElementById('qzEndModeIconPath').setAttribute('d', isMastery ? PRACTICE_ICON_D : LEARN_ICON_D);
  document.getElementById('qzEndModeBtn').onclick = () => setMode(isMastery ? 'practice' : 'learn');
  // 틀린 문제 리뷰 렌더 — quizQueue 의 isCorrect=false 항목을 카드 리스트로
  _renderWrongReview();
}

/* ── 결과 화면 — 틀린 문제 리뷰 ──
   quizQueue 의 각 항목(submit 시점에 userAnswer + isCorrect 저장됨)을 순회.
   유형별 빌더로 카드 DOM 생성 → #qzReviewList 에 append. */
/* 현재 활성 리뷰 탭 — 'wrong' | 'all' */
let _reviewTab = 'all';

/* 카드 focus / has-focus 클래스 일괄 해제 — 탭 전환·스크롤 시 디폴트 상태로 복귀시킬 때 사용. */
function _clearReviewFocus() {
  const section = document.getElementById('qzReviewSection');
  const list    = document.getElementById('qzReviewList');
  if (section) section.classList.remove('has-focus');
  if (list)    list.classList.remove('has-focus');
  document.querySelectorAll('.qz-review-card.focused').forEach(c => c.classList.remove('focused'));
}

/* 탭 전환 — 버튼 onclick 에서 호출. 포커스 해제 후 재렌더.
   '오답만 보기' 탭이 비활성화(오답 0개) 상태면 클릭/프로그램 호출 모두 무시. */
function _setReviewTab(tab) {
  if (tab === 'wrong') {
    const tabWrong = document.getElementById('qzTabWrong');
    if (tabWrong && (tabWrong.disabled || tabWrong.classList.contains('disabled'))) return;
  }
  _clearReviewFocus();
  _reviewTab = tab;
  document.getElementById('qzTabWrong').classList.toggle('active', tab === 'wrong');
  document.getElementById('qzTabAll').classList.toggle('active', tab === 'all');
  _renderReview();
}

/* 진입 시점 — 항상 '전체 보기' 탭으로 초기화 후 렌더. showQuizEnd 가 호출. */
function _renderWrongReview() {
  _reviewTab = 'all';
  const tabAll = document.getElementById('qzTabAll');
  const tabWrong = document.getElementById('qzTabWrong');
  if (tabAll)   tabAll.classList.add('active');
  if (tabWrong) tabWrong.classList.remove('active');
  _renderReview();
}

/* 리뷰 렌더 — _reviewTab 에 따라 전체 / 오답만 분기. 카드 빌더는 공통. */
function _renderReview() {
  const section = document.getElementById('qzReviewSection');
  const divider = document.getElementById('qzDivider');
  const list    = document.getElementById('qzReviewList');
  if (!section || !list) return;

  list.innerHTML = '';

  // Type A/B/C/D/E 정답/오답 멘트 픽커 리셋 — 같은 렌더 세션 내 절대 중복 없도록 셔플 순서 처음부터 사용.
  _A_PICK_CORRECT_DO.reset();
  _A_PICK_CORRECT.reset();
  _A_PICK_WRONG_OUTRO.reset();
  _B_PICK_CORRECT.reset();
  _B_PICK_WRONG_OUTRO.reset();
  _C_PICK_CORRECT.reset();
  _C_PICK_WRONG_OUTRO.reset();
  _D_PICK_CORRECT.reset();
  _D_PICK_WRONG_OUTRO.reset();
  _E_PICK_CORRECT.reset();
  _E_PICK_WRONG_OUTRO.reset();

  const wrongs = quizQueue.filter(q => q.isCorrect === false);
  const items  = _reviewTab === 'all' ? quizQueue : wrongs;

  // 오답 0개 → '오답만 보기' 탭 비활성화 (disabled 속성 + .disabled 클래스).
  // 오답 1개 이상 → 다시 활성화.
  const _tabWrong = document.getElementById('qzTabWrong');
  if (_tabWrong) {
    const noWrong = wrongs.length === 0;
    _tabWrong.classList.toggle('disabled', noWrong);
    _tabWrong.disabled = noWrong;
  }

  // 오답 0개 + 오답 탭 → 섹션 숨김 (defensive: 탭 비활성화로 이 상태가 정상적으론 안 만들어짐)
  if (_reviewTab === 'wrong' && wrongs.length === 0) {
    section.style.display = 'none';
    if (divider) divider.classList.add('is-hidden');
    return;
  }

  section.style.display = 'flex';
  if (divider) divider.classList.remove('is-hidden');

  const builders = { A: _fillReviewA, B: _fillReviewB, C: _fillReviewC, D: _fillReviewD, E: _fillReviewE };

  items.forEach((q, idx) => {
    const card = _buildReviewCardShell(q);

    // 정답/오답 뱃지 — 헤더 우측 끝
    const header = card.querySelector('.qz-card-header');
    const resultBadge = document.createElement('span');
    resultBadge.className = 'qz-card-result-badge ' + (q.isCorrect ? 'correct' : 'wrong');
    resultBadge.textContent = q.isCorrect ? '✓ 정답' : '× 오답';
    header.appendChild(resultBadge);

    const compareArea = card.querySelector('.qz-compare-area');
    const hintCol     = card.querySelector('.qz-hint-col');
    if (q.isCorrect) {
      card.classList.add('is-correct');
      _fillReviewCorrect(q, 'rev_ok_' + idx, compareArea, hintCol);
    } else {
      const fn = builders[q.type];
      if (fn) fn(q, 'rev' + idx, compareArea, hintCol);
    }

    list.appendChild(card);
  });

  _qzRedistributeReviewCards(list);
  _initReviewCardInteraction();
}

/* 정답 카드 해설 빌더 — 비교 영역은 오답 빌더 재사용(정답 상태 그대로라 자연스럽게 정답만 표시),
   hintCol 만 칭찬/이유 카피로 덮어쓰기. */
function _fillReviewCorrect(q, prefix, compareArea, hintCol) {
  const builders = { A: _fillReviewA, B: _fillReviewB, C: _fillReviewC, D: _fillReviewD, E: _fillReviewE };
  const fn = builders[q.type];
  if (fn) fn(q, prefix, compareArea, hintCol);

  const label = NOTES[q.note] ? NOTES[q.note].label : '';
  // 도 = 모든 구멍 막음(열 구멍 없음) → 분기. 그 외는 막음/열림 둘 다 언급.
  // Type 별 비반복 라운드로빈 픽커 — 같은 렌더 세션 내 동일 type 정답 카드끼리 절대 같은 문장 안 나옴.
  // 첫 렌더에서 픽한 결과는 q._descCorrect 에 캐시 → 탭 전환(_renderReview 재호출)때 같은 카드 문장 고정.
  let desc;
  if (q._descCorrect != null) {
    desc = q._descCorrect;
  } else {
    if (q.type === 'A') {
      desc = (q.note === '도' ? _A_PICK_CORRECT_DO.pick() : _A_PICK_CORRECT.pick()).replace(/\{L\}/g, label);
    } else if (q.type === 'B') {
      desc = _B_PICK_CORRECT.pick().replace(/\{L\}/g, label);
    } else if (q.type === 'C') {
      desc = _C_PICK_CORRECT.pick().replace(/\{L\}/g, label);
    } else if (q.type === 'D') {
      desc = _D_PICK_CORRECT.pick().replace(/\{L\}/g, label).replace(/\{S\}/g, _ko(label, 'subject'));
    } else if (q.type === 'E') {
      desc = _E_PICK_CORRECT.pick().replace(/\{L\}/g, label);
    } else {
      desc = `${label} 문제를 정확하게 맞혔어요!`;
    }
    q._descCorrect = desc;
  }

  hintCol.innerHTML = `
    <div class="qz-hint-title">✅ 잘했어요!</div>
    <div class="qz-hint-box">
      ${desc}
    </div>
  `;
}

/* 메이슨리용 카드 재분배.
   - cols-2 클래스 있으면: 카드들을 짝/홀 인덱스로 좌/우 .qz-review-col 컨테이너에 행 우선 분배.
     (1→좌, 2→우, 3→좌, 4→우 ...) → 화면상 1행: [1][2], 2행: [3][4] 순서 유지.
   - cols-2 없으면: 컨테이너 제거하고 카드를 list 에 직접 평탄 배치.
   카드 자체는 재사용 (innerHTML 보존). 부모만 옮김. */
function _qzRedistributeReviewCards(list) {
  const cards = Array.from(list.querySelectorAll('.qz-review-card'));
  if (cards.length === 0) return;
  const want2col = list.classList.contains('qz-review-list--cols-2');
  // 기존 자식 전부 제거 (cards 는 위에서 이미 참조 보존됨)
  while (list.firstChild) list.removeChild(list.firstChild);
  if (want2col) {
    const col1 = document.createElement('div');
    col1.className = 'qz-review-col';
    const col2 = document.createElement('div');
    col2.className = 'qz-review-col';
    cards.forEach((card, idx) => {
      (idx % 2 === 0 ? col1 : col2).appendChild(card);
    });
    list.appendChild(col1);
    list.appendChild(col2);
  } else {
    cards.forEach(card => list.appendChild(card));
  }
}

function _buildReviewCardShell(q) {
  const label = NOTES[q.note] ? NOTES[q.note].label : '';
  let headerText = '';
  if      (q.type === 'A') headerText = `<b>${label}</b>의 운지법은?`;
  else if (q.type === 'B') headerText = `<b>${label}</b>의 운지법은 어떤 모양일까요?`;
  else if (q.type === 'C') headerText = '아래 음표의 계이름은 무엇일까요?';
  else if (q.type === 'D') headerText = `<b>${label}</b>의 위치는?`;
  else if (q.type === 'E') headerText = `<b>${label}</b>의 잘못된 운지법은?`;
  const card = document.createElement('div');
  card.className = 'qz-review-card';
  card.innerHTML = `
    <div class="qz-card-header">
      <span class="quiz-type-badge">${QUIZ_TYPE_UI_LABELS[q.type] || ''}</span>
      <span class="q-label">${headerText}</span>
    </div>
    <div class="qz-card-body">
      <div class="qz-compare-area"></div>
      <div class="qz-hint-col"></div>
    </div>
  `;
  return card;
}

/* 공통 헬퍼 — _buildQuizRecorderClone 위에 리뷰용 마킹 부여.
   opts 필드:
     - fillPurple   : closedSet 의 hole 을 보라(#442AFF) fill (Type A/B 좌측용)
     - wrongSet     : 표시할 hole id Set
     - wrongStyle   : 'qz-rev-wrong-mark' (좌측 빨간 점선) | 'qz-rev-correct-mark' (우측 초록 stroke)
     - purpleRing   : 보라 실선 ring 부여할 hole id Set (Type E 좌측 사용자 픽)
     - noArrow      : true 면 wrongSet.size === 1 일 때 추가되는 빨간 삼각형 화살표 생략 (Type E 정답 케이스용) */
function _buildReviewRecorder(closedSet, prefix, opts) {
  const clone = _buildQuizRecorderClone(closedSet, prefix);
  if (!clone) return null;
  // 모든 유형 통일 max-height 360px (.qz-cmp-half svg) 와 일치
  clone.style.height = '360px';
  clone.style.width = 'auto';
  clone.style.maxHeight = '360px';
  HOLES.forEach(hid => {
    const el = clone.querySelector('#' + prefix + '_' + hid);
    if (!el) return;
    if (opts.fillPurple && closedSet.has(hid)) el.classList.add('qz-rev-fill-purple');
    // 우측 정답 카드(qz-rev-correct-mark): wrongSet 무관, 정답에서 '닫혀야 하는' 모든 구멍에 초록 테두리.
    //   fill 은 _buildQuizRecorderClone 기본(검정) 그대로 → 결과: 초록 테두리 + 검정 칠.
    // 좌측 오답 카드(qz-rev-wrong-mark): 기존대로 wrongSet 전체에 빨간 stroke.
    if (opts.wrongStyle === 'qz-rev-correct-mark') {
      if (closedSet.has(hid)) el.classList.add('qz-rev-correct-mark');
    } else if (opts.wrongSet && opts.wrongSet.has(hid)) {
      el.classList.add(opts.wrongStyle);
    }
    if (opts.purpleRing && opts.purpleRing.has(hid)) el.classList.add('qz-rev-purple-ring');
  });
  // wrong hole 마다 빨간 outer-ring 주입 — focused 상태에서 outward pulse 로 강조.
  // 화살표는 wrongSet.size === 1 일 때만 추가 (방향 가리킴).
  if (opts.wrongSet && opts.wrongStyle === 'qz-rev-wrong-mark') {
    opts.wrongSet.forEach(hid => {
      const ring = _buildHoleOuterRing(hid, 'qz-rev-outer-ring');
      if (ring) clone.appendChild(ring);
    });
    if (!opts.noArrow && opts.wrongSet.size === 1) {
      const onlyHid = [...opts.wrongSet][0];
      const arrow = _buildWrongHoleArrow(onlyHid);
      if (arrow) clone.appendChild(arrow);
    }
  }
  // 보라 ring(.qz-rev-purple-ring) hole 에도 같은 outward pulse 강조 — 사용자 선택 위치 부각.
  if (opts.purpleRing) {
    opts.purpleRing.forEach(hid => {
      const ring = _buildHoleOuterRing(hid, 'qz-rev-purple-outer-ring');
      if (ring) clone.appendChild(ring);
    });
  }
  // hole 번호 라벨(0~7) — 카드 focused 시에만 보이도록 CSS 클래스 부여. 기본은 _buildQuizRecorderClone 에서 인라인
  // display:none 으로 숨겨져 있어 인라인 제거 후 클래스로 전환.
  const labels = clone.querySelector('#' + prefix + '_holeLabels');
  if (labels) {
    labels.classList.remove('is-hidden');
    labels.classList.add('qz-rev-hole-labels');
  }
  return clone;
}

/* 잘못된 구멍 좌표 — recorderSvg viewBox(-20 0 130 723) 기준. 화살표·outer-ring 빌더가 참조.
   shape: 'circle' | 'ellipse' — 원본 hole 의 SVG 도형 그대로 outer-ring 도 같은 종류로 생성. */
const _WRONG_HOLE_POS = {
  h0:   { cx: 10.8,   cy: 271.64,  shape: 'circle',  r: 10 },
  h1:   { cx: 55.32,  cy: 304.688, shape: 'circle',  r: 10 },
  h2:   { cx: 55.32,  cy: 351.849, shape: 'circle',  r: 10 },
  h3:   { cx: 55.32,  cy: 396.956, shape: 'circle',  r: 10 },
  h4:   { cx: 55.32,  cy: 445.593, shape: 'circle',  r: 10 },
  h5:   { cx: 55.32,  cy: 501.849, shape: 'circle',  r: 9  },
  h6_1: { cx: 49.421, cy: 550.229, shape: 'circle',  r: 8  },
  h6_2: { cx: 63.6,   cy: 555.229, shape: 'circle',  r: 5  },
  h7_1: { cx: 38.999, cy: 607.099, shape: 'ellipse', rx: 6.5,   ry: 8.18  },
  h7_2: { cx: 51.953, cy: 608.065, shape: 'ellipse', rx: 4.448, ry: 5.583 },
};
/* 원본 hole 보다 +4 viewBox unit 큰 ring 을 생성. CSS animation 이 scale·opacity 로 pulse.
   className 으로 색 분기: 'qz-rev-outer-ring' (빨강, wrong) / 'qz-rev-purple-outer-ring' (보라, 사용자 선택). */
function _buildHoleOuterRing(hid, className) {
  const pos = _WRONG_HOLE_POS[hid];
  if (!pos) return null;
  const NS = 'http://www.w3.org/2000/svg';
  let el;
  if (pos.shape === 'ellipse') {
    el = document.createElementNS(NS, 'ellipse');
    el.setAttribute('cx', pos.cx);
    el.setAttribute('cy', pos.cy);
    el.setAttribute('rx', pos.rx + 4);
    el.setAttribute('ry', pos.ry + 4);
  } else {
    el = document.createElementNS(NS, 'circle');
    el.setAttribute('cx', pos.cx);
    el.setAttribute('cy', pos.cy);
    el.setAttribute('r', pos.r + 4);
  }
  el.setAttribute('class', className);
  return el;
}
/* h0(엄지/뒷면) 은 좌측 가장자리에 위치 → 왼쪽에서 오른쪽 방향 화살표.
   나머지는 본체 정렬(x≈55) → 오른쪽 가장자리에서 왼쪽 방향 화살표. */
function _buildWrongHoleArrow(hid) {
  const pos = _WRONG_HOLE_POS[hid];
  if (!pos) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const poly = document.createElementNS(NS, 'polygon');
  const cy = pos.cy;
  if (hid === 'h0') {
    poly.setAttribute('class', 'qz-rev-arrow-mark qz-rev-arrow-mark--right');
    poly.setAttribute('points', `-18,${cy-10} -18,${cy+10} -2,${cy}`);
  } else {
    poly.setAttribute('class', 'qz-rev-arrow-mark');
    poly.setAttribute('points', `105,${cy-10} 105,${cy+10} 88,${cy}`);
  }
  return poly;
}

/* 공통 헬퍼 — sheetSvg 클론 후 특정 음표 하나만 표시.
   colorClass: 표시할 음표에 부여할 클래스 (없으면 기본 검정 fill).
   사이즈는 .qz-compare-area--cd .qz-cmp-card svg CSS 가 일괄 처리 (Type C/D 공통). */
function _buildReviewSheet(noteName, colorClass) {
  const svg = document.getElementById('sheetSvg').cloneNode(true);
  svg.removeAttribute('id');
  const targetId = NOTE_SHEET_IDS[noteName];
  Object.values(NOTE_SHEET_IDS).forEach(sheetId => {
    const el = svg.querySelector('#' + sheetId);
    if (!el) return;
    if (sheetId === targetId) {
      el.style.display = 'inline';
      if (colorClass) el.classList.add(colorClass);
    } else {
      el.style.display = 'none';
    }
    el.removeAttribute('id');
  });
  return svg;
}

/* ── 리뷰 카드 — 인스턴스 기반 hint 헬퍼 ── */
function _holeIsLeft(hid) {
  return hid === 'h0' || hid === 'h1' || hid === 'h2' || hid === 'h3';
}
/* hole id Set → 손별로 그룹화된 표기 (예: '왼손 0, 1, 2번' / '오른손 6번').
   같은 손의 여러 번호를 한 번에 묶어 표기. h0(엄지/뒤)는 왼손 0번으로 통일 → '왼손 N번' 포맷 일관성 유지.
   오른손은 4~7번 (h4=4, h5=5, h6=6, h7=7) — 왼손 0~3번과 이어지는 단일 인덱스 체계.
   h6_1/h6_2 는 둘 다 '오른손 6번' 으로 dedupe, h7_1/h7_2 는 '오른손 7번' 으로 dedupe. */
function _groupHoleNamesByHand(holeSet) {
  const leftNums  = new Set();
  const rightNums = new Set();
  for (const h of holeSet) {
    if      (h === 'h0') leftNums.add(0);
    else if (h === 'h1') leftNums.add(1);
    else if (h === 'h2') leftNums.add(2);
    else if (h === 'h3') leftNums.add(3);
    else if (h === 'h4') rightNums.add(4);
    else if (h === 'h5') rightNums.add(5);
    else if (h === 'h6_1' || h === 'h6_2') rightNums.add(6);
    else if (h === 'h7_1' || h === 'h7_2') rightNums.add(7);
  }
  const parts = [];
  if (leftNums.size)  parts.push(`왼손 ${[...leftNums].sort((a,b)=>a-b).join(', ')}번`);
  if (rightNums.size) parts.push(`오른손 ${[...rightNums].sort((a,b)=>a-b).join(', ')}번`);
  return parts;
}
/* hole id → 손가락 번호. h0=엄지(0), h1~h5=각각의 번호, h6_1/h6_2=6(짝구멍), h7_1/h7_2=7(짝구멍). */
function _holeNumber(hid) {
  if (hid === 'h0') return 0;
  if (hid === 'h1') return 1;
  if (hid === 'h2') return 2;
  if (hid === 'h3') return 3;
  if (hid === 'h4') return 4;
  if (hid === 'h5') return 5;
  if (hid === 'h6_1' || hid === 'h6_2') return 6;
  if (hid === 'h7_1' || hid === 'h7_2') return 7;
  return null;
}
function _handFocus(holeIter) {
  let left = 0, right = 0;
  holeIter.forEach(h => { _holeIsLeft(h) ? left++ : right++; });
  if (left && !right) return '왼손';
  if (right && !left) return '오른손';
  if (left && right)  return '양손';
  return '';
}
const _HOLE_FRIENDLY = {
  h0: '왼손 0번', h1: '왼손 1번', h2: '왼손 2번', h3: '왼손 3번',
  h4: '오른손 4번',    h5: '오른손 5번',
  h6_1: '오른손 6번', h6_2: '오른손 6번',
  h7_1: '오른손 7번', h7_2: '오른손 7번',
};
function _holeFriendlyName(hid) { return _HOLE_FRIENDLY[hid] || hid; }
function _noteDelta(fromName, toName) {
  const a = NOTE_NAMES.indexOf(fromName);
  const b = NOTE_NAMES.indexOf(toName);
  if (a < 0 || b < 0) return 0;
  return b - a;
}
/* 빨간 stroke 마킹 hole 들을 visible state 기준으로 분류.
   - close: 흰색(열림) + 빨간 stroke → "이 구멍을 막아야 해요"
   - open : 검정/보라(닫힘) + 빨간 stroke → "이 구멍을 열어야 해요"
   correct = 정답 closed set, displayed = 좌측 카드의 현재 displayed(닫힘) set, wrongSet = 빨간 stroke 부여된 hole id 집합. */
function _classifyWrongHoles(correct, displayed, wrongSet) {
  const close = new Set();
  const open  = new Set();
  wrongSet.forEach(h => {
    const inCorrect = correct.has(h);
    const inDisplayed = displayed.has(h);
    if (inCorrect && !inDisplayed) close.add(h);       // 막아야 (open shown, should close)
    else if (!inCorrect && inDisplayed) open.add(h);   // 열어야 (closed shown, should open)
  });
  return { close, open };
}
/* 헬퍼 텍스트 HTML 생성 — close/open 결과 기반.
   "이 구멍" 자리를 인라인 원형(.qz-hint-hole) 으로 치환:
   - close 분기: 현재 열림(흰 fill) 상태 → 막아야 함
   - open  분기: 현재 닫힘(검정 fill) 상태 → 열어야 함 */
function _wrongHintHtml(cls) {
  // 닫아야/열어야 둘 다 있는 경우 한 줄로 합쳐서 출력
  if (cls.close.size && cls.open.size) {
    return '<div><span class="qz-hint-hole open"></span>을 닫고, <span class="qz-hint-hole closed"></span>을 열어야해요.</div>';
  }
  let html = '';
  if (cls.close.size) html += '<div><span class="qz-hint-hole open"></span>을 닫아야해요.</div>';
  if (cls.open.size)  html += '<div><span class="qz-hint-hole closed"></span>을 열어야해요.</div>';
  return html;
}

/* Type E 전용 hint — 빨간 테두리(원래 flipped, 미수정) + 보라 테두리(사용자 misclick) 두 종류를 함께 표기.
   각 hole 의 현재 displayed(userResult) 상태에 따라 verb 결정: 닫혀 있으면 '열고/열어야해요', 열려 있으면 '닫고/닫아야해요'.
   indicator span 의 fill 도 displayed 상태와 매칭 (open=흰색 / closed=검정). */
function _wrongHintHtmlE(correct, userResult, redSet, purpleSet) {
  const getInfo = (set) => {
    if (!set.size) return null;
    const h = [...set][0];
    const isClosed = userResult.has(h);
    return {
      fillCls: isClosed ? 'closed' : 'open',
      verbAnd:   isClosed ? '열고' : '닫고',
      verbFinal: isClosed ? '열어야해요' : '닫아야해요',
    };
  };
  const red    = getInfo(redSet);
  const purple = getInfo(purpleSet);
  const redSpan    = red    ? `<span class="qz-hint-hole red ${red.fillCls}"></span>`       : '';
  const purpleSpan = purple ? `<span class="qz-hint-hole purple ${purple.fillCls}"></span>` : '';
  if (red && purple) {
    // 두 hole 의 action 이 같으면(둘 다 열기 or 둘 다 닫기) 한 문장으로 합침: '[빨강]과 [보라]을 열어야해요.'
    if (red.verbFinal === purple.verbFinal) {
      return `<div>${redSpan}과 ${purpleSpan}을 ${red.verbFinal}.</div>`;
    }
    return `<div>${redSpan}을 ${red.verbAnd}, ${purpleSpan}을 ${purple.verbFinal}.</div>`;
  } else if (red) {
    return `<div>${redSpan}을 ${red.verbFinal}.</div>`;
  } else if (purple) {
    return `<div>${purpleSpan}을 ${purple.verbFinal}.</div>`;
  }
  return '';
}

/* 사용자 hole set 을 NOTES 의 closed 와 정확히 비교해 매칭되는 노트 라벨 반환.
   Type A/B 의 user subtext (사용자가 선택한 계이름) 산출용. 매칭 없으면 null. */
function _holesToNote(holeSet) {
  if (!holeSet || !(holeSet instanceof Set)) return null;
  for (const name of NOTE_NAMES) {
    const closed = NOTES[name].closed;
    if (closed.length === holeSet.size && closed.every(h => holeSet.has(h))) {
      return NOTES[name].label;
    }
  }
  return null;
}

/* 한글 조사 자동 선택 — 마지막 글자의 받침(종성) 유무로 분기.
   kind: 'topic'(은/는) | 'subject'(이/가) | 'object'(을/를) | 'with'(과/와)
   한글 syllable block(U+AC00~U+D7A3) 이 아닌 경우(♯/♭ 등) 받침 없는 것으로 처리. */
function _ko(label, kind) {
  if (!label) return '';
  const last = label.charCodeAt(label.length - 1);
  const inHangul = last >= 0xAC00 && last <= 0xD7A3;
  const hasBatchim = inHangul && ((last - 0xAC00) % 28 !== 0);
  const pair = { topic: ['은','는'], subject: ['이','가'], object: ['을','를'], with: ['과','와'], ieyo: ['이에요','예요'] }[kind];
  return pair ? (hasBatchim ? pair[0] : pair[1]) : '';
}
/* 음별 운지 특이사항 한 줄 멘트 — Type A 보충용. 계이름은  로 감싸고 조사 받침 분기.
   표기 통일: '손가락 번호' 표기 시엔 '왼손/오른손 N번' 단일 포맷(h0=왼손 0번). 손가락 이름(엄지/검지 등) 사용 시엔 번호 생략. */
const _NOTE_FINGERING_TIP = {
  '도':    '도는 모든 구멍을 빈틈없이 닫아야 가장 낮은 음이 나와요.',
  '레':    '레는 오른손 7번만 열면 돼요.',
  '미':    '미는 오른손 4, 5번까지만 닫고 6, 7번은 열어요.',
  '파':    '파는 오른손 4번까지만 닫고 나머지 오른손은 다 열어요.',
  '파♯':   '파♯은 오른손 4번을 열고 다른 구멍을 닫는 변칙 운지예요.',
  '솔':    '솔은 왼손 0, 1, 2, 3번만 닫아요.',
  '라':    '라는 왼손 0, 1, 2번만 닫아요.',
  '시♭':   '시♭은 왼손 1, 3번과 오른손 4번을 닫는 변칙 운지라 헷갈리기 쉬워요.',
  '시':    '시는 왼손 0, 1번만 닫는 단순한 상위 음이에요.',
  '높은도':'높은 도는 왼손 0번 구멍을 완전히 닫아줘요.',
  '높은레':'높은 레는 왼손 2번만 닫고 나머지 손가락은 모두 열어요.',
};

/* user 카드 → correct 카드 화살표 — Type A/B/D/E 공통. (Type C 는 단일 sheet → 화살표 없음) */
const QZ_CMP_ARROW_HTML = '<div class="qz-cmp-arrow"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg></div>';

function _pickRand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* Type C 리뷰의 계이름 라벨 HTML — 한글 글자 + ♭/♯ 기호가 같은 텍스트 노드에 있으면 두 글리프의
   baseline 메트릭 차이로 세로 정렬이 미세하게 어긋남. wrapper(.qz-note-wrap)를 inline-flex 컨테이너
   로 두고 base 와 accidental 을 flex item 으로 분리 → align-items 로 강제 정렬. ♭/♯ 없는 라벨은
   그대로 반환. */
function _noteLabelHtml(label) {
  const m = label && label.match(/^(.+?)([♭♯])$/);
  if (!m) return label;
  return `<span class="qz-note-wrap"><span class="qz-note-base">${m[1]}</span><span class="qz-note-acc">${m[2]}</span></span>`;
}

/* Fisher-Yates 셔플로 새 배열 반환 (원본 미변경). */
function _shufflePool(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/* 비반복 라운드로빈 픽커 — pool 을 셔플해서 한 번씩 모두 소진한 뒤에 다시 셔플.
   같은 렌더 세션 내에서 절대 동일 문장이 두 번 나오지 않도록 보장.
   render 시작 시 reset() 으로 처음부터 시작. */
function _makeRoundRobinPicker(pool) {
  let order = _shufflePool(pool);
  let idx = 0;
  return {
    pick() {
      if (idx >= order.length) { order = _shufflePool(pool); idx = 0; }
      return order[idx++];
    },
    reset() { order = _shufflePool(pool); idx = 0; },
  };
}

/* Type A 정답 칭찬 멘트 — '도'(모든 구멍 막음) 분기와 일반 분기. {L} 자리에 NOTES[note].label 치환.
   최대 문항 수(10)보다 큰 12개씩 준비 → 한 세션 내에서 모두 정답이어도 중복 없음. */
const _A_CORRECT_TEXTS_DO = [
  '{L} 음의 운지법을 정확하게 기억하고 있었어요! 닫아야 할 구멍을 빠짐없이 닫아서 맞혔어요.',
  '{L} 운지를 한 번에 맞췄어요! 모든 구멍을 꼼꼼히 닫은 손 감각이 좋아요.',
  '{L} 음의 모든 구멍을 빈틈없이 닫았어요! 가장 낮은 음의 손 모양을 잘 기억하고 있네요.',
  '{L} 손가락이 모든 구멍에 정확히 닿았어요! 좋은 손 컨트롤이에요.',
  '{L} 운지를 또렷이 알고 있네요! 손가락이 한 자리도 빠짐없이 자리를 잡았어요.',
  '{L} 음의 손 모양을 단숨에 잡았어요! 모든 구멍을 닫는 자세가 안정적이에요.',
  '{L} 운지를 정확히 익혔어요! 양손이 빈틈없이 잘 협응하고 있어요.',
  '{L}의 가장 낮은 음 운지가 익숙해 보여요! 손가락 압력도 잘 분배됐어요.',
  '{L} 자리를 처음부터 끝까지 끊김 없이 짚었어요! 좋은 집중력이에요.',
  '{L} 음을 한 번에 정확히 골랐어요! 손 모양이 머릿속에 또렷한 것 같네요.',
  '{L} 운지의 핵심을 잘 잡았어요! 손가락이 자연스럽게 자리를 찾았네요.',
  '{L}를 정확히 맞췄어요! 모든 구멍에 손끝을 빈틈없이 댄 감각이 좋아요.',
];
const _A_CORRECT_TEXTS = [
  '{L} 음의 운지법을 정확하게 기억하고 있었어요! 닫아야 할 구멍을 빠짐없이, 열어야 할 구멍은 깔끔하게 열어서 맞혔어요.',
  '{L} 운지를 한 번에 정확히 맞췄어요! 손가락 위치가 손에 익은 것 같아요.',
  '{L}의 닫힘과 열림을 정확히 구분했어요! 리코더 운지 감각이 잘 잡혀 있어요.',
  '{L} 손가락 모양을 망설임 없이 짚어냈어요! 좋은 집중력이에요.',
  '{L} 운지를 정확하게 골라냈어요! 어느 구멍을 닫고 열지 또렷이 알고 있네요.',
  '{L} 음의 손 모양이 머릿속에 잘 들어 있어요! 같은 감각으로 다음 음도 도전해 봐요.',
  '{L} 자리를 정확히 잡았어요! 손가락이 닫을 곳과 열 곳을 또렷이 구별했네요.',
  '{L} 운지를 깔끔하게 완성했어요! 양손의 움직임이 잘 분리되어 있어요.',
  '{L} 손가락 자리를 자신 있게 골랐어요! 운지 패턴이 점점 익숙해지고 있네요.',
  '{L} 음의 운지 모양을 한 번에 떠올렸어요! 좋은 기억력이에요.',
  '{L} 운지에 자신감이 느껴져요! 닫힘과 열림의 차이를 정확히 알고 있네요.',
  '{L} 자리를 빠르게 짚었어요! 다음 음을 향한 손 흐름도 자연스러워 보여요.',
];

/* Type A 오답 hint 마지막 문장 — 비교/관찰 유도 멘트 풀. 최대 문항 수(10)보다 큰 12개. */
const _A_WRONG_OUTROS = [
  '오른쪽 정답 모양과 나란히 두고 어느 구멍이 다른지 짚어 보세요.',
  '두 그림을 천천히 비교하면서 빨간 표시가 된 구멍부터 살펴보세요.',
  '정답 그림의 손가락 위치를 따라 다시 짚어 보면 차이가 잘 보여요.',
  '왼쪽과 오른쪽 그림을 번갈아 보며 어디가 어긋났는지 찾아보세요.',
  '빨간 표시 구멍을 중심으로 두 그림을 비교해 보세요.',
  '정답 모양을 손으로 따라 해 보면 어느 구멍이 어긋났는지 금방 느껴져요.',
  '왼손·오른손 영역을 나눠서 어디가 달라졌는지 살펴보세요.',
  '정답 그림의 손 모양을 머릿속에 떠올리며 다시 운지해 보세요.',
  '같은 음을 천천히 다시 짚어 보면 손가락 위치가 더 또렷해져요.',
  '두 그림에서 동그라미 색이 다른 자리를 먼저 찾아보세요.',
  '정답 그림을 보며 손가락 하나하나 위치를 따라가 보세요.',
  '빨간 테두리 구멍의 색깔(열림·닫힘)이 무엇을 뜻하는지부터 떠올려 보세요.',
];

/* Type A 전용 비반복 픽커 — _renderReview() 시작 시 reset() 호출로 매 렌더 세션마다 초기화. */
const _A_PICK_CORRECT_DO   = _makeRoundRobinPicker(_A_CORRECT_TEXTS_DO);
const _A_PICK_CORRECT      = _makeRoundRobinPicker(_A_CORRECT_TEXTS);
const _A_PICK_WRONG_OUTRO  = _makeRoundRobinPicker(_A_WRONG_OUTROS);

/* Type B (그림 찾기) — 정답 칭찬 / 오답 outro 풀. {L} → NOTES[note].label 치환. 각 12개. */
const _B_CORRECT_TEXTS = [
  '4개 그림 중 {L} 음의 운지 모양을 정확히 골랐어요! 리코더 구멍의 열림·닫힘 패턴을 눈으로 잘 읽었어요.',
  '여러 그림 사이에서 {L}의 운지를 한눈에 찾아냈어요! 손가락 패턴을 빠르게 알아보는 감각이 좋아요.',
  '{L}의 운지 모양을 다른 그림과 헷갈리지 않고 골랐어요! 눈썰미가 정확해요.',
  '{L} 운지의 핵심 모양을 정확히 짚었어요! 손가락 위치를 머릿속에 또렷이 그릴 줄 알아요.',
  '여러 보기 중에서 {L}를 망설임 없이 골랐어요! 운지법을 잘 기억하고 있네요.',
  '{L}의 그림을 한 번에 골라냈어요! 비슷한 보기와도 명확하게 구분했어요.',
  '{L} 운지를 정확하게 찾았어요! 닫힌 구멍과 열린 구멍을 잘 구별했네요.',
  '4개 보기에서 {L}의 그림을 자신 있게 골랐어요! 운지 패턴이 잘 익혀졌어요.',
  '{L} 운지 그림을 또렷이 알아봤어요! 손가락 모양에 대한 감각이 단단해요.',
  '{L}의 운지를 다른 음과 헷갈리지 않았어요! 좋은 관찰력이에요.',
  '{L} 그림을 한 번에 찾아낼 만큼 운지가 익숙해졌네요! 멋져요.',
  '{L}의 모양을 정확히 골랐어요! 운지 그림을 보는 눈이 점점 빨라지고 있어요.',
];
const _B_WRONG_OUTROS = [
  '리코더는 왼손이 위쪽, 오른손이 아래쪽을 담당해요. 두 그림을 손 영역별로 비교하면 차이가 잘 보여요.',
  '비슷한 그림이라도 닫힌 구멍의 개수와 위치를 하나씩 세어 보면 답이 보여요.',
  '구멍을 위에서 아래로 차근차근 짚어 가며 두 그림의 차이를 확인해 보세요.',
  '엄지 구멍부터 새끼 구멍까지 순서대로 비교하면 차이가 더 또렷해져요.',
  '왼손이 닫는 구멍과 오른손이 닫는 구멍을 따로 나눠서 비교해 보세요.',
  '한 번에 비교하기 어렵다면 위쪽 절반, 아래쪽 절반으로 나눠서 살펴보세요.',
  '실제로 손가락을 움직여 두 그림을 따라 짚어 보면 어느 게 맞는지 느껴져요.',
  '비슷해 보여도 닫힘 구멍이 한 자리만 달라도 음이 바뀌어요. 차이에 집중해 보세요.',
  '정답 그림을 먼저 본 다음, 다른 그림이 어디서 어긋났는지 거꾸로 찾아보세요.',
  '운지 그림을 외울 때는 닫은 구멍의 개수와 손 영역을 함께 기억하면 좋아요.',
  '눈으로만 비교가 어렵다면, 손가락으로 화면을 따라 짚어 보세요.',
  '음마다 운지 모양이 미세하게 달라요. 천천히 한 자리씩 비교하는 습관을 길러 보세요.',
];
const _B_PICK_CORRECT      = _makeRoundRobinPicker(_B_CORRECT_TEXTS);
const _B_PICK_WRONG_OUTRO  = _makeRoundRobinPicker(_B_WRONG_OUTROS);

/* Type C (계이름 읽기) — 정답 칭찬 / 오답 outro 풀. 각 12개. */
const _C_CORRECT_TEXTS = [
  '오선지에서 음표가 있는 줄·칸 위치를 읽고 {L}임을 정확하게 맞혔어요! 악보 읽기 실력이 좋아요.',
  '오선지 위 음표를 보고 {L}를 한 번에 골랐어요! 줄·칸 위치를 정확히 알고 있네요.',
  '{L} 음의 자리를 또렷이 알고 있었어요! 악보 읽는 감각이 잘 잡혔어요.',
  '음표 위치만 보고 {L}임을 알아냈어요! 오선지 읽기가 점점 빨라지네요.',
  '오선지 위 음표를 정확히 {L}로 읽어냈어요! 좋은 집중력이에요.',
  '{L}의 위치를 헷갈리지 않고 골랐어요! 줄 위 음과 칸 안 음을 잘 구별하고 있네요.',
  '오선지에서 {L} 자리를 또렷이 짚어냈어요! 음표 읽기에 자신감이 생긴 것 같아요.',
  '{L} 음표를 한눈에 알아봤어요! 보기 좋은 악보 감각이에요.',
  '음표 위치를 보고 {L}를 정확히 골랐어요! 오선지 읽기가 손에 익었네요.',
  '{L}를 다른 음과 헷갈리지 않았어요! 음표 위치를 또렷이 외우고 있네요.',
  '오선지 위 {L}의 자리를 정확히 읽었어요! 악보 읽기 실력이 한 단계 올라왔어요.',
  '{L} 음표를 보고 망설임 없이 골랐어요! 좋은 악보 감각이에요.',
];
const _C_WRONG_OUTROS = [
  '오선지는 아래에서 위로 도·레·미·파·솔·라·시·도 순서로 올라가요.',
  '줄 위에 걸친 음과 칸 안에 든 음을 한 번씩 짚어 가며 익혀 보세요.',
  '음표가 어느 줄 위에 있는지, 아니면 어느 칸 안에 있는지부터 확인해 보세요.',
  '맨 아래 줄부터 도·미·솔·시·레, 칸은 아래부터 레·파·라·도예요. 이 순서를 외워 두면 편해요.',
  '높은음일수록 오선지 위쪽, 낮은음일수록 아래쪽에 있어요.',
  '오선지 위·아래에 짧은 줄(덧줄)이 추가되면 더 높거나 더 낮은 음이에요.',
  '비슷한 위치의 음을 헷갈리지 않으려면, 기준 음 도 위치부터 손가락으로 짚어 보세요.',
  '음표 머리가 줄 위에 있는지 칸 안에 있는지를 먼저 본 다음 위치를 세 보세요.',
  '오선지를 위·아래로 칸 단위로 나눠서 어디쯤 있는지 어림잡아 보세요.',
  '같은 음표 모양이라도 위치가 한 칸 다르면 완전히 다른 음이 돼요.',
  '도 자리를 기준으로 위로 한 칸씩 올라가며 계이름을 세어 보면 답을 찾을 수 있어요.',
  '음표 위치를 외울 때는 줄과 칸을 번갈아 짚으며 계이름을 소리 내어 읽어 보세요.',
];
const _C_PICK_CORRECT      = _makeRoundRobinPicker(_C_CORRECT_TEXTS);
const _C_PICK_WRONG_OUTRO  = _makeRoundRobinPicker(_C_WRONG_OUTROS);

/* Type D (음표 그리기) — 정답 칭찬 / 오답 outro 풀. 각 12개. */
const _D_CORRECT_TEXTS = [
  '{L}{S} 오선지 어느 자리에 있는지 정확히 클릭했어요! 음표 위치와 계이름을 잘 연결하고 있어요.',
  '{L}의 자리를 오선지 위에 정확히 찍었어요! 음표 위치를 또렷이 기억하고 있네요.',
  '{L} 음표의 위치를 망설임 없이 클릭했어요! 음표와 계이름 연결이 자연스러워요.',
  '오선지 위 {L} 자리를 한 번에 찾아냈어요! 좋은 공간 감각이에요.',
  '{L}의 줄·칸 위치를 정확히 골랐어요! 악보 위에 음표를 잘 그릴 수 있겠네요.',
  '{L} 자리를 빠르고 정확하게 클릭했어요! 음표 위치를 잘 외우고 있네요.',
  '{L}{S} 오선지 어디에 있는지 또렷이 알고 있네요! 멋진 집중력이에요.',
  '{L} 자리를 헷갈리지 않고 클릭했어요! 음표 위치 감각이 점점 빨라지고 있어요.',
  '오선지에서 {L}의 위치를 정확히 짚어냈어요! 좋은 악보 그리기 실력이에요.',
  '{L} 자리를 자신 있게 클릭했어요! 줄과 칸의 차이를 정확히 알고 있네요.',
  '{L}의 위치를 또렷이 그릴 수 있겠어요! 음표를 직접 적는 연습에도 도움 되겠네요.',
  '{L} 자리를 정확히 잡았어요! 악보 위에 음표를 표시하는 감각이 좋아요.',
];
const _D_WRONG_OUTROS = [
  '음표의 높낮이는 운지법과 직결돼요. 오선지 위치를 정확히 기억해야 손가락도 바르게 움직여요.',
  '오선지에서 한 칸 또는 한 줄 차이가 음 하나 차이예요. 위치를 또렷이 외워 두세요.',
  '음표를 그릴 때는 줄 위에 걸치는지, 칸 안에 들어가는지를 먼저 정해 보세요.',
  '도부터 한 칸씩 올라가며 손가락으로 짚어 보면 정답 자리가 보여요.',
  '같은 이름의 음이라도 옥타브가 다르면 위치가 한참 떨어져 있어요. 헷갈리지 않게 주의해요.',
  '오선지의 줄과 칸 순서를 외울 때 기준 음 도를 먼저 기억하면 편해요.',
  '높이가 올라갈수록 클릭 위치도 위쪽이 돼야 해요. 방향부터 다시 확인해 보세요.',
  '한 음마다 자리를 정확히 찍으려면 줄·칸 순서를 머릿속으로 세 보는 연습이 필요해요.',
  '실제 악보에 음표를 적을 일이 많아요. 위치 감각을 천천히 익혀 두세요.',
  '클릭 위치가 조금만 어긋나도 다른 음이 돼요. 다음엔 더 또렷이 짚어 보세요.',
  '오선지 위쪽 음은 손가락을 적게, 아래쪽 음은 손가락을 많이 닫는다는 흐름도 함께 떠올려 보세요.',
  '음표 자리를 외울 때는 줄과 칸 위치를 소리 내어 말하며 외우면 더 잘 기억돼요.',
];
const _D_PICK_CORRECT      = _makeRoundRobinPicker(_D_CORRECT_TEXTS);
const _D_PICK_WRONG_OUTRO  = _makeRoundRobinPicker(_D_WRONG_OUTROS);

/* Type E (틀린 구멍 찾기) — 정답 칭찬 / 오답 outro 풀. 각 12개. */
const _E_CORRECT_TEXTS = [
  '{L} 운지법에서 실제로 잘못된 구멍을 정확히 찾아냈어요! 꼼꼼하게 비교하는 눈이 생겼어요.',
  '잘못된 구멍을 한 번에 짚어냈어요! {L} 운지를 정확히 알고 있다는 증거예요.',
  '{L} 운지에서 어긋난 구멍을 또렷이 골라냈어요! 좋은 관찰력이에요.',
  '미세한 차이까지 잡아냈네요! {L} 운지법이 손과 눈에 잘 익었어요.',
  '{L} 모양과 다른 자리를 정확히 골랐어요! 비교하는 눈이 날카로워요.',
  '잘못된 구멍을 망설임 없이 클릭했어요! {L} 운지에 대한 자신감이 느껴져요.',
  '{L} 운지의 정답 모양을 또렷이 머릿속에 그리고 있네요! 좋은 기억력이에요.',
  '비슷한 모양 사이에서 어긋난 구멍을 정확히 찾았어요! 멋진 집중력이에요.',
  '{L} 운지에서 틀린 자리를 한눈에 알아봤어요! 손가락 패턴을 잘 외우고 있네요.',
  '{L}의 잘못된 구멍을 정확히 짚어냈어요! 연주 중 실수를 미리 잡아낼 수 있겠어요.',
  '아주 작은 차이도 놓치지 않았네요! {L} 운지가 머릿속에 또렷해요.',
  '{L} 운지법에서 다른 자리를 정확히 골랐어요! 좋은 비교 감각이에요.',
];
const _E_WRONG_OUTROS = [
  '연주 중 손가락이 떨어지는 실수를 미리 발견하는 연습이에요. 정답 모양과 비교해 올바른 운지를 익혀 두세요.',
  '운지 그림을 볼 때는 위에서 아래로 한 자리씩 짚으며 확인하는 습관을 길러 보세요.',
  '실제 연주에서도 한 구멍만 어긋난 실수가 자주 일어나요. 작은 차이를 잡는 눈을 키워 보세요.',
  '정답 운지 그림을 먼저 머릿속에 떠올린 다음 어느 자리가 다른지 비교해 보세요.',
  '비슷한 운지일수록 손 영역(왼손/오른손)을 나눠서 살펴보면 어긋난 곳이 잘 보여요.',
  '한 구멍 차이가 음 하나 차이가 돼요. 평소에도 손끝 위치를 세심하게 챙겨 보세요.',
  '운지 모양이 비슷해 보여도 닫힘과 열림 한 자리가 음의 정체를 바꿔요.',
  '엄지 구멍부터 새끼 구멍까지 순서대로 확인하면 어긋난 자리가 빨리 보여요.',
  '연주 중 손가락이 떠 있는 게 가장 흔한 실수예요. 정답 모양을 자주 떠올려 보세요.',
  '잘못 닫힌 자리 또는 잘못 열린 자리를 정답과 한 자리씩 매칭해 가며 비교해 보세요.',
  '실제 연주에서 음이 이상하면, 가장 먼저 잘못 닿은 손가락이 어디 있는지 확인해 보세요.',
  '아주 작은 차이를 잡는 눈을 키우면, 자기 연주 실수도 빠르게 알아챌 수 있어요.',
];
const _E_PICK_CORRECT      = _makeRoundRobinPicker(_E_CORRECT_TEXTS);
const _E_PICK_WRONG_OUTRO  = _makeRoundRobinPicker(_E_WRONG_OUTROS);

/* ── 유형별 카드 채우기 ── */
function _fillReviewA(q, prefix, compareArea, hintCol) {
  const correct = new Set(NOTES[q.note].closed);
  const user = q.userAnswer || new Set();
  const wrongSet = new Set();
  HOLES.forEach(h => { if (correct.has(h) !== user.has(h)) wrongSet.add(h); });
  const leftSvg  = _buildReviewRecorder(user,    prefix + '_u', { fillPurple: true, wrongSet, wrongStyle: 'qz-rev-wrong-mark' });
  const rightSvg = _buildReviewRecorder(correct, prefix + '_c', { wrongSet, wrongStyle: 'qz-rev-correct-mark' });
  compareArea.classList.add('qz-compare-area--abe');
  const userNoteLabel = _holesToNote(user) || '알 수 없음';
  const targetLabel = NOTES[q.note].label;
  const cls = _classifyWrongHoles(correct, user, wrongSet);
  const hintHtml = _wrongHintHtml(cls);
  const userBadgeHtmlA = q.isCorrect
    ? `<div class="qz-review-badge correct">정답: <b>${targetLabel}</b> ⭕</div>`
    : `<div class="qz-review-badge user">선택: <b>${userNoteLabel}</b> ❌</div>`;
  compareArea.innerHTML = `
    <div class="qz-cmp-half">
      ${userBadgeHtmlA}
      <div class="qz-cmp-card user"></div>
      ${hintHtml ? `<div class="qz-review-hint-text">${hintHtml}</div>` : ''}
    </div>
    ${QZ_CMP_ARROW_HTML}
    <div class="qz-cmp-half">
      <div class="qz-review-badge correct">정답: <b>${targetLabel}</b> ⭕</div>
      <div class="qz-cmp-card correct"></div>
    </div>
  `;
  if (leftSvg)  compareArea.querySelector('.qz-cmp-card.user').appendChild(leftSvg);
  if (rightSvg) compareArea.querySelector('.qz-cmp-card.correct').appendChild(rightSvg);
  // 인스턴스 기반 hint — missed/extra 구멍의 구체적 손가락 이름 + 음별 특이사항 멘트.
  // 패턴에 '음 이름 + 구체 구멍명' 을 포함 → 노트가 다르거나 빠뜨린 구멍이 다르면 자동으로 다른 문장.
  // (이전엔 ${focus}(왼손/오른손/양손) 단일 키워드만 써서 노트가 달라도 같은 손 실수면 동일 문장이 출력됨)
  const missed = new Set();
  const extra  = new Set();
  correct.forEach(h => { if (!user.has(h)) missed.add(h); });
  user.forEach(h => { if (!correct.has(h)) extra.add(h); });
  // 손별 그룹핑 — 같은 손의 여러 번호는 '왼손 1, 2번' 형태로 묶고, 손 간 구분은 ','가 아닌 '과/와' 로 연결.
  //   예: 왼손 1, 2번과 오른손 4번  (받침 유무에 따라 과/와 자동 분기)
  const missedParts = _groupHoleNamesByHand(missed);
  const extraParts  = _groupHoleNamesByHand(extra);
  const _last = (arr) => arr[arr.length - 1] || '';
  const _joinWithParticle = (arr) => {
    if (!arr.length) return '';
    let s = arr[0];
    for (let i = 1; i < arr.length; i++) s += _ko(arr[i-1], 'with') + ' ' + arr[i];
    return s;
  };
  const missedJoined = _joinWithParticle(missedParts);
  const extraJoined  = _joinWithParticle(extraParts);
  const noteLabel = NOTES[q.note].label;
  let pattern;
  if (missed.size && !extra.size) {
    pattern = `${noteLabel} 운지에서 ${missedJoined}${_ko(_last(missedParts),'object')} 빠뜨렸어요.`;
  } else if (!missed.size && extra.size) {
    pattern = `${noteLabel} 운지에서 ${extraJoined}${_ko(_last(extraParts),'object')} 더 닫았어요.`;
  } else {
    pattern = `${noteLabel} 운지에서 ${missedJoined}${_ko(_last(missedParts),'object')} 빠뜨리고, ${extraJoined}${_ko(_last(extraParts),'object')} 더 닫았어요.`;
  }
  const tip = _NOTE_FINGERING_TIP[q.note] || '';
  // 비반복 라운드로빈 픽커 사용 → 같은 렌더 세션 내 오답 카드끼리 outro 동일 문장 안 나옴.
  // q._outroA 에 캐시 → 탭 전환(_renderReview 재호출)때도 같은 카드 문장 고정.
  if (q._outroA == null) q._outroA = _A_PICK_WRONG_OUTRO.pick();
  const outro = q._outroA;
  hintCol.innerHTML = `
    <div class="qz-hint-title">❓왜 틀렸을까요</div>
    <div class="qz-hint-box">
      ${pattern}<br>
      ${tip ? tip + '<br>' : ''}
      ${outro}
    </div>
  `;
}

function _fillReviewB(q, prefix, compareArea, hintCol) {
  const correct = new Set(NOTES[q.note].closed);
  const user = q.userAnswer || new Set();
  // Type B 는 '그림 찾기' 4지선다 — 운지 그림은 단순 표시만, 정답/오답 시각 강조 일체 없음.
  //   · fillPurple 미지정 → 사용자 카드에 보라 fill 안 들어감
  //   · wrongSet/wrongStyle 미지정 → 빨간/초록 stroke 안 붙고, outer-ring(키프레임 pulse)과 빨간 화살표도 안 만들어짐
  const leftSvg  = _buildReviewRecorder(user,    prefix + '_u', {});
  const rightSvg = _buildReviewRecorder(correct, prefix + '_c', {});
  compareArea.classList.add('qz-compare-area--abe');
  const targetLabel = NOTES[q.note].label;
  // 4지선다 카드 순서 라벨 — 사용자가 고른/정답인 카드의 인덱스(0~3) → 첫번째 그림 ~ 네번째 그림 표기.
  const _ORD = ['첫번째', '두번째', '세번째', '네번째'];
  const pickedOrdinal  = (q.qbPickedIndex  >= 0 && q.qbPickedIndex  < 4) ? _ORD[q.qbPickedIndex]  : '알 수 없음';
  const correctOrdinal = (q.qbCorrectIndex >= 0 && q.qbCorrectIndex < 4) ? _ORD[q.qbCorrectIndex] : '';
  const userBadgeHtmlB = q.isCorrect
    ? `<div class="qz-review-badge correct">정답: <b>${correctOrdinal}</b> ⭕</div>`
    : `<div class="qz-review-badge user">선택: <b>${pickedOrdinal}</b> ❌</div>`;
  compareArea.innerHTML = `
    <div class="qz-cmp-half">
      ${userBadgeHtmlB}
      <div class="qz-cmp-card user"></div>
    </div>
    ${QZ_CMP_ARROW_HTML}
    <div class="qz-cmp-half">
      <div class="qz-review-badge correct">정답: <b>${correctOrdinal}</b> ⭕</div>
      <div class="qz-cmp-card correct"></div>
    </div>
  `;
  if (leftSvg)  compareArea.querySelector('.qz-cmp-card.user').appendChild(leftSvg);
  if (rightSvg) compareArea.querySelector('.qz-cmp-card.correct').appendChild(rightSvg);
  // 오답 hint — 사용자가 고른 카드의 운지가 어떤 계이름인지 역매핑해서 표기.
  // (현재 wrong 보기는 어떤 계이름과도 매칭 안 되는 비대칭 운지일 수 있어 null 가능 → 그땐 안전 폴백)
  const pickedNoteLabel = _holesToNote(user);
  const pickedDescB = pickedNoteLabel
    ? `내가 선택한 그림은 ${pickedNoteLabel} 운지법이에요.`
    : `내가 선택한 그림은 어떤 계이름에도 해당하지 않는 운지 모양이에요.`;
  hintCol.innerHTML = `
    <div class="qz-hint-title">❓왜 틀렸을까요</div>
    <div class="qz-hint-box">
      ${pickedDescB}
    </div>
  `;
}

/* 높은음자리표 기준 각 음표의 오선지 위치 설명 — Type C 오답 풀이용. */
const _NOTE_STAFF_POS = {
  "도":     "오선 아래 덧줄 위",
  "레":     "오선 아래 첫 번째 칸",
  "미":     "아래에서 첫 번째 줄 위",
  "파":     "아래에서 첫 번째 칸",
  "파♯":   "아래에서 첫 번째 칸",
  "솔":     "아래에서 두 번째 줄 위",
  "라":     "아래에서 두 번째 칸",
  "시♭":   "아래에서 세 번째 줄 위",
  "시":     "아래에서 세 번째 줄 위",
  "높은도": "아래에서 세 번째 칸",
  "높은레": "아래에서 네 번째 줄 위",
};

function _fillReviewC(q, prefix, compareArea, hintCol) {
  const target = q.note;
  const picked = q.userAnswer;
  const opts = Array.isArray(q.qcOptions) && q.qcOptions.length ? q.qcOptions : Object.keys(NOTES).slice(0, 4);
  const sheetSvg = _buildReviewSheet(target, null); // 정답 음표를 기본 검정으로 노출
  compareArea.classList.add('qz-compare-area--cd');
  // Type C 전용 마커 — sheet SVG 의 min-height 140px 같이 C 만 적용할 CSS hook.
  compareArea.classList.add('qz-compare-area--c');
  // 단일 sheet + 선택지 grid 라 column 배치 — 다른 유형(가로 user|arrow|correct)과 다른 Type-C 고유.
  compareArea.style.flexDirection = 'column';
  compareArea.style.gap = '6px';
  const cTargetLabel = NOTES[target].label;
  const cPickedLabel = picked ? NOTES[picked].label : '없음';
  // ♭/♯ 가 들어간 라벨은 base 와 accidental 을 분리한 HTML 로 렌더 → 세로 정렬 강제.
  const cTargetLabelHtml = _noteLabelHtml(cTargetLabel);
  const cPickedLabelHtml = _noteLabelHtml(cPickedLabel);
  compareArea.innerHTML = `
    <div class="qz-cmp-card"></div>
    <div class="qz-rev-opts"></div>
  `;
  if (sheetSvg) compareArea.querySelector('.qz-cmp-card').appendChild(sheetSvg);
  const optsRow = compareArea.querySelector('.qz-rev-opts');
  opts.forEach(name => {
    const o = document.createElement('div');
    o.className = 'qz-rev-opt';
    if (name === target) o.classList.add('correct');
    else if (name === picked) o.classList.add('user');
    // textContent 대신 innerHTML — _noteLabelHtml 로 ♭/♯ 분리 span 주입.
    o.innerHTML = _noteLabelHtml(NOTES[name].label);
    optsRow.appendChild(o);
  });
  // 인스턴스 기반 hint — picked vs target 의 오선지 위치를 명시적으로 안내.
  const targetLabel = NOTES[target].label;
  const pickedLabel = picked ? NOTES[picked].label : '';
  const isOctave = picked && (
    (picked === '도' && target === '높은도') || (picked === '높은도' && target === '도') ||
    (picked === '레' && target === '높은레') || (picked === '높은레' && target === '레')
  );
  const cDelta = picked ? _noteDelta(picked, target) : null;
  const cDir   = cDelta == null ? '' : (cDelta > 0 ? '위' : '아래');
  // 오선지 위치 설명 — '3칸 아래' 같은 상대 표현 대신 줄·칸 자리를 명확히 안내.
  const tPosDesc = _NOTE_STAFF_POS[target] || '오선지 위';
  const pPosDesc = picked ? (_NOTE_STAFF_POS[picked] || '오선지 위') : '';
  let pattern;
  if (!picked) {
    pattern = `답을 고르지 못했어요. 정답 ${targetLabel}${_ko(targetLabel,'topic')} ${tPosDesc}에 있어요. 음표가 오선지 어느 줄·칸에 있는지부터 다시 짚어 보세요.`;
  } else if (isOctave) {
    pattern = `음표가 ${tPosDesc}에 위치해 있어요. 이 자리는 ${targetLabel} 자리랍니다.<br>선택하신 ${pickedLabel}${_ko(pickedLabel,'topic')} 이름은 같지만 한 옥타브 ${cDir}쪽인 ${pPosDesc}에 있어요. 옥타브 위치를 비교해 보세요.`;
  } else {
    pattern = `음표가 ${tPosDesc}에 위치해 있어요. 높은음자리표에서 이 자리는 ${targetLabel} 자리랍니다.<br>선택하신 ${pickedLabel}${_ko(pickedLabel,'topic')} ${pPosDesc}에 위치해요. 줄과 칸의 위치를 비교해 보세요.`;
  }
  // 비반복 라운드로빈 픽커 — 같은 렌더 세션 내 오답 카드끼리 outro 동일 문장 안 나옴.
  // q._outroC 에 캐시 → 탭 전환(_renderReview 재호출)때도 같은 카드 문장 고정.
  if (q._outroC == null) q._outroC = _C_PICK_WRONG_OUTRO.pick();
  const outroC = q._outroC;
  // 오답이고 선택지가 있을 때만 악보 비교 표시 — 나의 선택 vs 정답 악보를 나란히 보여줌.
  const showSheetCompare = !q.isCorrect && !!picked;
  hintCol.innerHTML = `
    <div class="qz-hint-title">❓왜 틀렸을까요</div>
    ${showSheetCompare ? `
    <div class="qz-c-sheet-compare">
      <div class="qz-c-sheet-half">
        <div class="qz-review-badge user">선택: <b>${cPickedLabelHtml}</b> ❌</div>
        <div class="qz-cmp-card"></div>
      </div>
      ${QZ_CMP_ARROW_HTML}
      <div class="qz-c-sheet-half">
        <div class="qz-review-badge correct">정답: <b>${cTargetLabelHtml}</b> ⭕</div>
        <div class="qz-cmp-card"></div>
      </div>
    </div>` : ''}
    <div class="qz-hint-box">
      ${pattern}<br>
      ${outroC}
    </div>
  `;
  if (showSheetCompare) {
    const cards = hintCol.querySelectorAll('.qz-c-sheet-half .qz-cmp-card');
    const pickedSvg = _buildReviewSheet(picked, null);
    const targetSvg2 = _buildReviewSheet(target, null);
    if (pickedSvg  && cards[0]) cards[0].appendChild(pickedSvg);
    if (targetSvg2 && cards[1]) cards[1].appendChild(targetSvg2);
  }
}

function _fillReviewD(q, prefix, compareArea, hintCol) {
  const target = q.note;
  const picked = q.userAnswer;
  const leftSvg  = picked ? _buildReviewSheet(picked, 'qz-rev-d-picked')  : null;
  const rightSvg = _buildReviewSheet(target, 'qz-rev-d-correct');
  compareArea.classList.add('qz-compare-area--cd');
  // Type D 전용 마커 — sheet SVG 의 min-height 140px 같이 D 만 적용할 CSS hook.
  compareArea.classList.add('qz-compare-area--d');
  const dTargetLabel = NOTES[target].label;
  const dPickedLabel = picked ? NOTES[picked].label : '없음';
  const userBadgeHtmlD = q.isCorrect
    ? `<div class="qz-review-badge correct">정답: <b>${dTargetLabel}</b> ⭕</div>`
    : `<div class="qz-review-badge user">선택: <b>${dPickedLabel}</b> ❌</div>`;
  compareArea.innerHTML = `
    <div class="qz-cmp-half">
      ${userBadgeHtmlD}
      <div class="qz-cmp-card user"></div>
    </div>
    ${QZ_CMP_ARROW_HTML}
    <div class="qz-cmp-half">
      <div class="qz-review-badge correct">정답: <b>${dTargetLabel}</b> ⭕</div>
      <div class="qz-cmp-card correct"></div>
    </div>
  `;
  if (leftSvg)  compareArea.querySelector('.qz-cmp-card.user').appendChild(leftSvg);
  if (rightSvg) compareArea.querySelector('.qz-cmp-card.correct').appendChild(rightSvg);
  // 인스턴스 기반 hint — 클릭한 위치(picked)와 정답 위치(target)의 음 거리/옥타브/미응답 분기
  const targetLabel = NOTES[target].label;
  const pickedLabel = picked ? NOTES[picked].label : '';
  const isOctave = picked && (
    (picked === '도' && target === '높은도') || (picked === '높은도' && target === '도') ||
    (picked === '레' && target === '높은레') || (picked === '높은레' && target === '레')
  );
  const delta = picked ? _noteDelta(picked, target) : null; // +: target 이 위
  const dist  = delta == null ? null : Math.abs(delta);
  const dirWord = delta == null ? '' : (delta > 0 ? '위쪽' : '아래쪽');
  let pattern;
  if (!picked) {
    pattern = `클릭한 위치가 없어요. ${targetLabel}의 자리는 오른쪽 초록 음표 위치예요. 모양을 기억해 두세요.`;
  } else if (isOctave) {
    pattern = `같은 이름의 ${pickedLabel} 자리를 클릭했지만, 정답${_ko(targetLabel,'topic')} 한 옥타브 ${dirWord}의 ${targetLabel}예요.`;
  } else if (dist === 1) {
    pattern = `정답보다 한 칸 ${delta > 0 ? '아래' : '위'}를 클릭했어요. ${targetLabel}${_ko(targetLabel,'topic')} 바로 한 칸 ${dirWord} 자리예요.`;
  } else if (dist <= 3) {
    pattern = `클릭한 위치 ${pickedLabel}에서 ${dist}칸 ${dirWord} 자리가 정답 ${targetLabel}${_ko(targetLabel,'ieyo')}.`;
  } else {
    pattern = `정답 ${targetLabel}${_ko(targetLabel,'topic')} 클릭한 위치보다 한참 ${dirWord} 자리예요. 오선지 줄·칸 순서를 다시 떠올려 보세요.`;
  }
  // 비반복 라운드로빈 픽커 — 같은 렌더 세션 내 오답 카드끼리 outro 동일 문장 안 나옴.
  // q._outroD 에 캐시 → 탭 전환(_renderReview 재호출)때도 같은 카드 문장 고정.
  if (q._outroD == null) q._outroD = _D_PICK_WRONG_OUTRO.pick();
  const outroD = q._outroD;
  hintCol.innerHTML = `
    <div class="qz-hint-title">❓왜 틀렸을까요</div>
    <div class="qz-hint-box">
      ${pattern}<br>
      ${outroD}
    </div>
  `;
}

function _fillReviewE(q, prefix, compareArea, hintCol) {
  const correct = new Set(NOTES[q.note].closed);
  const flipped = q.flippedHoles instanceof Set ? q.flippedHoles : new Set();
  const picked = q.userAnswer;
  // 짝구멍 매핑 — h6_1/h6_2 또는 h7_1/h7_2 는 한 손가락이 두 구멍을 동시에 막는 구조라 한 쌍이 같이 움직임.
  const _PAIR_E = { h6_1: 'h6_2', h6_2: 'h6_1', h7_1: 'h7_2', h7_2: 'h7_1' };
  const pickedSet = new Set();
  if (picked) {
    pickedSet.add(picked);
    if (_PAIR_E[picked]) pickedSet.add(_PAIR_E[picked]);
  }
  // 1) displayed = 퍼즐 초기 표시 상태 (correct XOR flipped)
  const displayed = new Set();
  HOLES.forEach(h => {
    if (flipped.has(h) ? !correct.has(h) : correct.has(h)) displayed.add(h);
  });
  // 2) userResult = 사용자가 picked 를 클릭한 후의 상태 (displayed XOR pickedSet)
  //    클릭 시 picked 와 짝(_PAIR_E)이 동시에 토글되므로 짝까지 반영.
  const userResult = new Set();
  HOLES.forEach(h => {
    if (pickedSet.has(h) ? !displayed.has(h) : displayed.has(h)) userResult.add(h);
  });
  // 3) stillWrong = 사용자 결과가 정답과 어긋난 구멍 (userResult XOR correct).
  //    정답 케이스: 비어 있음. 오답 케이스: 여전히 잘못된 hole(s).
  const stillWrong = new Set();
  HOLES.forEach(h => {
    if (correct.has(h) !== userResult.has(h)) stillWrong.add(h);
  });
  // 좌측 SVG — 사용자가 클릭 후 결과 상태(userResult)를 그대로 렌더.
  //   · 정답: 빨간 마크/화살표 없음, 보라 ring 만 사용자 클릭 위치 강조.
  //   · 오답: stillWrong 에 빨간 stroke + outer-ring(focus pulse), 보라 ring 으로 클릭 위치 강조.
  //   · 단, pickedSet(보라 ring) hole 은 wrongSet 에서 제외 → 빨간 stroke / pulse 애니메이션 없이
  //     순수 보라 ring 만 표시 (사용자 클릭한 위치는 정적으로 강조).
  const wrongSetForLeft = new Set([...stillWrong].filter(h => !pickedSet.has(h)));
  const leftSvgOpts = q.isCorrect
    ? { purpleRing: pickedSet }
    : { wrongSet: wrongSetForLeft, wrongStyle: 'qz-rev-wrong-mark', purpleRing: pickedSet };
  const leftSvg = _buildReviewRecorder(userResult, prefix + '_u', leftSvgOpts);
  // 우측: 정답 상태 + 초록 stroke on flipped
  const rightSvg = _buildReviewRecorder(correct, prefix + '_c', {
    wrongSet: flipped, wrongStyle: 'qz-rev-correct-mark',
  });
  compareArea.classList.add('qz-compare-area--abe');
  const targetLabel = NOTES[q.note].label;
  // Type E 전용 hint — 빨간 테두리(wrongSetForLeft, 원래 flipped 미수정) + 보라 테두리(pickedSet, 사용자 misclick)
  // 두 종류를 별도 indicator span 으로 표기. 현재 userResult 상태에 따라 verb 결정.
  const hintHtml = _wrongHintHtmlE(correct, userResult, wrongSetForLeft, pickedSet);
  // badge 텍스트 — 정답/오답 모두 'n번 열기/닫기' 형식으로 통일.
  //   · 사용자 action: 클릭 시점 displayed 상태에 따라 결정. 닫혀 있었으면 클릭은 '열기', 열려 있었으면 '닫기'.
  //   · 정답 action: flipped hole 의 정답 상태에 따라 결정. closed 여야 하면 '닫기', open 이어야 하면 '열기'.
  //   · h6_1/h6_2, h7_1/h7_2 같은 짝구멍은 _holeNumber 로 6/7 단일 번호.
  const pickedNum    = picked != null ? _holeNumber(picked) : null;
  const pickedAction = picked != null ? (displayed.has(picked) ? '열기' : '닫기') : '';
  const userSelText  = (picked != null && pickedNum != null) ? `${pickedNum}번 ${pickedAction}` : '없음';
  const _flippedArr  = [...flipped];
  const _firstFlipped = _flippedArr[0];
  const flippedNum   = _firstFlipped != null ? _holeNumber(_firstFlipped) : null;
  const correctAction = _firstFlipped != null ? (correct.has(_firstFlipped) ? '닫기' : '열기') : '';
  const correctText  = (flippedNum != null) ? `${flippedNum}번 ${correctAction}` : '';
  const correctBadgeHtmlE = `<div class="qz-review-badge correct">정답: <b>${correctText}</b> ⭕</div>`;
  const userBadgeHtmlE = q.isCorrect
    ? correctBadgeHtmlE
    : `<div class="qz-review-badge user">선택: <b>${userSelText}</b> ❌</div>`;
  compareArea.innerHTML = `
    <div class="qz-cmp-half">
      ${userBadgeHtmlE}
      <div class="qz-cmp-card user"></div>
      ${hintHtml ? `<div class="qz-review-hint-text qz-review-hint-text--e">${hintHtml}</div>` : ''}
    </div>
    ${QZ_CMP_ARROW_HTML}
    <div class="qz-cmp-half">
      ${correctBadgeHtmlE}
      <div class="qz-cmp-card correct"></div>
    </div>
  `;
  if (leftSvg)  compareArea.querySelector('.qz-cmp-card.user').appendChild(leftSvg);
  if (rightSvg) compareArea.querySelector('.qz-cmp-card.correct').appendChild(rightSvg);
  // 인스턴스 기반 hint — 사용자가 고른 구멍과 실제 잘못된 구멍의 이름/손 영역 비교
  const flippedArr  = Array.from(flipped);
  const pickedName  = picked ? _holeFriendlyName(picked) : null;
  const flippedName = flippedArr.length ? _holeFriendlyName(flippedArr[0]) : null;
  const pickedHand  = picked ? (_holeIsLeft(picked) ? '왼손' : '오른손') : '';
  const flippedHand = flippedArr.length ? (_holeIsLeft(flippedArr[0]) ? '왼손' : '오른손') : '';
  let pattern;
  if (!picked) {
    pattern = `구멍을 고르지 못했어요. 정답과 비교했을 때 실제로 잘못된 건 ${flippedName} 구멍이었어요.`;
  } else if (pickedHand === flippedHand) {
    pattern = `${pickedName}을 골랐지만, 정답과 비교했을 때 실제 잘못된 건 ${flippedName}이었어요. 인접 구멍을 한 번 더 살펴보세요.`;
  } else {
    pattern = `${pickedName}을 골랐지만, 정답과 비교했을 때 실제 잘못된 건 ${flippedName}이었어요. 손 영역을 바꿔서 다시 확인해 보세요.`;
  }
  // 비반복 라운드로빈 픽커 — 같은 렌더 세션 내 오답 카드끼리 outro 동일 문장 안 나옴.
  // q._outroE 에 캐시 → 탭 전환(_renderReview 재호출)때도 같은 카드 문장 고정.
  if (q._outroE == null) q._outroE = _E_PICK_WRONG_OUTRO.pick();
  const outroE = q._outroE;
  hintCol.innerHTML = `
    <div class="qz-hint-title">❓왜 틀렸을까요</div>
    <div class="qz-hint-box">
      ${pattern}<br>
      ${outroE}
    </div>
  `;
}

/* ── 리뷰 카드 호버/클릭 인터랙션 ──
   - 카드 클릭 → focused 토글, 나머지 카드는 dim
   - 다시 클릭 → 전체 기본 상태 복구
   - section + list 양쪽에 .has-focus 부여 (1열/2열 레이아웃 모두 dim 셀렉터가 매치되도록) */
function _initReviewCardInteraction() {
  const section = document.getElementById('qzReviewSection');
  if (!section) return;
  // 카드 재생성 시마다 호출돼도 리스너 중복되지 않도록 detach 후 attach
  section.removeEventListener('click', _onReviewCardClick);
  section.addEventListener('click', _onReviewCardClick);
  // 카드 바깥(빈 영역) 클릭 시 포커스 해제 — document 전역에서 감지
  document.removeEventListener('click', _onDocumentClickClearFocus);
  document.addEventListener('click', _onDocumentClickClearFocus);
}

function _onDocumentClickClearFocus(e) {
  const section = document.getElementById('qzReviewSection');
  if (!section || !section.classList.contains('has-focus')) return;
  // 클릭 타깃이 카드 안이면 무시 (카드 자체 토글은 section 핸들러가 처리)
  if (e.target.closest('.qz-review-card')) return;
  _clearReviewFocus();
}

function _onReviewCardClick(e) {
  const card = e.target.closest('.qz-review-card');
  if (!card) return;
  const section  = document.getElementById('qzReviewSection');
  const list     = document.getElementById('qzReviewList');
  const allCards = section ? section.querySelectorAll('.qz-review-card') : [];
  const isFocused = card.classList.contains('focused');
  // 모든 focused 해제
  allCards.forEach(c => c.classList.remove('focused'));
  if (section) section.classList.remove('has-focus');
  if (list)    list.classList.remove('has-focus');
  // 토글: 이미 focused 였으면 그냥 해제 상태로 종료, 아니면 활성화
  if (!isFocused) {
    card.classList.add('focused');
    if (section) section.classList.add('has-focus');
    if (list)    list.classList.add('has-focus');
  }
}

// ── 결과 화면 리뷰 카드 그리드: 스테이지 비율 기반 1열/2열 토글 ──
// #quizEndStage (스테이지 전체 영역) 의 contentRect 를 ResizeObserver 로 감시.
//   width >= height (가로가 더 넓음) → 2열 (.qz-review-list--cols-2)
//   width <  height (세로가 더 길음) → 1열 (기본)
// list 자기 자신을 관찰하면 카드 높이(리코더 480px) 때문에 항상 height >> width 가 돼
// 2열 진입이 불가능 → 부모 스테이지(overflow scroll 컨테이너)의 viewport 비율로 비교.
//
// 진동 방지:
//   1) contentRect 대신 offsetWidth/Height 사용 — border-box 기준이라
//      .main-area--end-scroll 모드에서 스크롤바 등장·소멸로 인한 contentRect.width
//      변화(~17px) 영향을 안 받음. 스크롤바 fluctuation 으로 인한 1↔2col flip 차단.
//   2) hysteresis 8px 데드존 — 임계(width ≈ height) 근처에서 미세 viewport 변화에도
//      안정. 1→2col 전환은 width ≥ height+8, 2→1col 전환은 width < height-8 일 때만.
(function setupQzReviewGridLayout() {
  // 비교 타겟: .main-area (viewport 비율). #quizEndStage 는 .main-area--end-scroll 모드에서
  // height:auto (콘텐츠 전체 높이) 가 되므로 자체 비율 비교는 의미가 없어짐.
  const main = document.querySelector('.main-area');
  const list = document.getElementById('qzReviewList');
  if (!main || !list || !('ResizeObserver' in window)) return;
  const ro = new ResizeObserver(() => {
    const width  = main.offsetWidth;
    const height = main.offsetHeight;
    if (!width || !height) return;                    // hidden 상태 무시
    const was2col = list.classList.contains('qz-review-list--cols-2');
    // viewport <= 1179px 에선 무조건 1col 강제 (태블릿/모바일 구간은 비율 무관 항상 1열).
    // 데스크탑(>1179) 에서만 비율 기반 토글 적용.
    const allow2col = window.innerWidth > 1179;
    const want2col = allow2col && (was2col
      ? width >= height - 8                           // 2col 유지: 임계 8px 낮춤
      : width >= height + 8);                         // 1col→2col: 임계 8px 높임
    if (want2col === was2col) return;                 // 변화 없음 — 일찍 종료
    list.classList.toggle('qz-review-list--cols-2', want2col);
    // 클래스 상태가 바뀌었을 때만 DOM 재분배 (메이슨리 컬럼 구조 ↔ 평탄 구조).
    if (typeof _qzRedistributeReviewCards === 'function') {
      _qzRedistributeReviewCards(list);
    }
  });
  ro.observe(main);
})();

// ── 결과 화면 스크롤 매니저 ──
// .main-area 를 스크롤 컨테이너로 전환 (.main-area--end-scroll 클래스).
// #quizEndBar 는 sticky bottom 으로 viewport 하단에 고정 + 스크롤 방향 감지로 hide/show.
//   - 스크롤 다운 (+2px 이상 & scrollTop>20) → translateY(100%) 로 화면 밖 슬라이드
//   - 스크롤 업 / 최상단 (scrollTop<=0) → 즉시 복귀
//   - 스크롤 멈춤 (200ms idle) → 복귀
let _qzEndLastScrollTop = 0;
let _qzEndScrollStopTimer = null;
// Mode A (fit) → Mode B (scroll) 단방향 전환의 touch/key 리스너 cleanup 핸들. (wheel 은
// 아래 persistent 리스너에서 통합 처리.)
let _qzEndFitCleanup = null;
// end-scroll 모드 전체 기간 동안 부착되는 wheel/touchstart persistent 리스너 cleanup 핸들.
let _qzEndPersistentCleanup = null;
// 모드 전환 직후 transition window — 이 기간 동안 bar hide/show 토글 보류 (yo-yo 차단).
let _qzEndTransitionUntil = 0;

// ── 커스텀 momentum scroll ──
// native wheel 은 매 이벤트마다 즉시 점프하고, scrollTo({behavior:'smooth'}) 는 wheel 마다
// target 이 갈리며 부자연스러움. requestAnimationFrame 기반 velocity 모델로 전환:
//   wheel/touch input → 누적 velocity 에 가산 → 매 프레임 scrollTop += v*dt → v *= decay
// 입력이 끊겨도 velocity 가 0 으로 수렴할 때까지 살짝 더 흘러서 "잔상" 인상을 만든다.
let _qzEndMomVel  = 0;     // px/sec
let _qzEndMomRAF  = null;
let _qzEndMomLastT = 0;
const _QZ_END_MOM_FACTOR = 7;    // wheel deltaPx → velocity 환산 (작을수록 native 에 가까움)
const _QZ_END_MOM_DECAY  = 0.92; // 60fps 기준 프레임당 감쇠 계수 (0.92^60≈0.0067 → ~1초만에 ≈0)
const _QZ_END_MOM_MIN    = 12;   // |v|<min 이면 정지 (px/sec)
const _QZ_END_MOM_CAP    = 5000; // 최대 velocity 클램프
function _qzEndMomTick(ts) {
  const main = document.querySelector('.main-area');
  if (!main || !main.classList.contains('main-area--end-scroll') ||
      main.classList.contains('main-area--end-scroll-fit')) {
    _qzEndMomStop();
    return;
  }
  // 첫 프레임: timestamp 만 기록하고 다음 프레임부터 실제 적분 시작 (dt=0 으로 인한
  // 가짜 경계-부딪힘 종료 방지).
  if (_qzEndMomLastT === 0) {
    _qzEndMomLastT = ts;
    _qzEndMomRAF = requestAnimationFrame(_qzEndMomTick);
    return;
  }
  const dt = Math.min((ts - _qzEndMomLastT) / 1000, 0.05);
  _qzEndMomLastT = ts;
  const before = main.scrollTop;
  const maxST = main.scrollHeight - main.clientHeight;
  const next  = before + _qzEndMomVel * dt;
  // 하단 오버슈트 → 스냅 후 즉시 정지 (바운스 제거)
  if (_qzEndMomVel > 0 && next >= maxST) {
    main.scrollTop = maxST;
    _qzEndMomStop();
    return;
  }
  main.scrollTop = next;
  // 경계에 부딪혀 더 이상 이동 못하면 velocity 즉시 0 (의미 있는 dt 일 때만 검사).
  if (dt > 0.001 && Math.abs(main.scrollTop - before) < 0.5 && Math.abs(_qzEndMomVel) > 1) {
    _qzEndMomStop();
    return;
  }
  // 프레임당 지수 감쇠 (dt 보정).
  _qzEndMomVel *= Math.pow(_QZ_END_MOM_DECAY, dt * 60);
  if (Math.abs(_qzEndMomVel) < _QZ_END_MOM_MIN) {
    // 가까운 바닥(100px 이내)에서 멈추면 스냅
    if (_qzEndMomVel > 0 && maxST - main.scrollTop <= 100) main.scrollTop = maxST;
    _qzEndMomStop();
    return;
  }
  _qzEndMomRAF = requestAnimationFrame(_qzEndMomTick);
}
function _qzEndMomPush(deltaPx, factor) {
  _qzEndMomVel += deltaPx * (factor != null ? factor : _QZ_END_MOM_FACTOR);
  if (_qzEndMomVel >  _QZ_END_MOM_CAP) _qzEndMomVel =  _QZ_END_MOM_CAP;
  if (_qzEndMomVel < -_QZ_END_MOM_CAP) _qzEndMomVel = -_QZ_END_MOM_CAP;
  if (!_qzEndMomRAF) {
    _qzEndMomLastT = 0;
    _qzEndMomRAF = requestAnimationFrame(_qzEndMomTick);
  }
}
function _qzEndMomPushVelocity(vPxPerSec) {
  // touchend 시 측정된 finger velocity 를 그대로 가산 (factor 없이).
  _qzEndMomVel += vPxPerSec;
  if (_qzEndMomVel >  _QZ_END_MOM_CAP) _qzEndMomVel =  _QZ_END_MOM_CAP;
  if (_qzEndMomVel < -_QZ_END_MOM_CAP) _qzEndMomVel = -_QZ_END_MOM_CAP;
  if (!_qzEndMomRAF) {
    _qzEndMomLastT = 0;
    _qzEndMomRAF = requestAnimationFrame(_qzEndMomTick);
  }
}
function _qzEndMomStop() {
  _qzEndMomVel = 0;
  if (_qzEndMomRAF) {
    cancelAnimationFrame(_qzEndMomRAF);
    _qzEndMomRAF = null;
  }
  _qzEndMomLastT = 0;
}

// 맨 밑 도달 여부 체크 → .main-area--end-scroll-atbottom 클래스 토글.
// 스크롤 불가 케이스(콘텐츠 ≤ viewport)도 자동으로 atBottom=true → shadow 자동 숨김.
function _qzEndUpdateAtBottom(main) {
  const atBottom = (main.scrollTop + main.clientHeight) >= (main.scrollHeight - 1);
  main.classList.toggle('main-area--end-scroll-atbottom', atBottom);
}
function _qzEndOnScroll() {
  const main = document.querySelector('.main-area');
  const bar  = document.getElementById('quizEndBar');
  if (!main || !bar) return;
  if (!main.classList.contains('main-area--end-scroll')) return;
  if (main.classList.contains('main-area--end-scroll-fit')) return;
  _qzEndUpdateAtBottom(main);
  // fit→scroll 모드 전환 직후 짧은 시간만 보류 (레이아웃 변동 중 깜빡임 방지).
  // momentum 진행 중에도 scroll-direction 토글은 정상 동작 → 휠다운 시 bar 슬라이드 아웃.
  if (performance.now() < _qzEndTransitionUntil) {
    _qzEndLastScrollTop = main.scrollTop;
    return;
  }
  // 맨 아래 도달 시 — hidden/peek 해제. atbottom 클래스가 트랜지션을 꺼두기 때문에 슬라이드인 없이
  // 그 자리에 즉시 노출 → 바운스/깜빡임 없음. atbottom 이탈 시 트랜지션 자동 복구.
  if (main.classList.contains('main-area--end-scroll-atbottom')) {
    bar.classList.remove('quiz-end-bar--hidden');
    bar.classList.remove('quiz-end-bar--peek');
    _qzEndLastScrollTop = main.scrollTop;
    clearTimeout(_qzEndScrollStopTimer);
    return;
  }
  // 모바일(≤767px): 스크롤 멈춤 시 bar는 숨기고 ::after(라운드 영역)만 노출(peek).
  // 맨 아래(atbottom)에서만 bar 전체 노출.
  const isMobile = window.innerWidth <= 767;
  const st = main.scrollTop;
  const dy = st - _qzEndLastScrollTop;
  if (dy > 2 && st > 20) {
    bar.classList.remove('quiz-end-bar--peek');
    bar.classList.add('quiz-end-bar--hidden');
  } else if (!isMobile && (dy < -2 || st <= 0)) {
    bar.classList.remove('quiz-end-bar--hidden');
  }
  _qzEndLastScrollTop = st;
  clearTimeout(_qzEndScrollStopTimer);
  if (!isMobile) {
    _qzEndScrollStopTimer = setTimeout(() => {
      bar.classList.remove('quiz-end-bar--hidden');
    }, 16);
  } else {
    _qzEndScrollStopTimer = setTimeout(() => {
      bar.classList.remove('quiz-end-bar--hidden');
      bar.classList.add('quiz-end-bar--peek');
    }, 16);
  }
}

function _qzEndSwitchOffFit(main) {
  if (!main.classList.contains('main-area--end-scroll-fit')) return;
  main.classList.remove('main-area--end-scroll-fit');
  // 강제 reflow — overflow:auto 즉시 적용되어 scrollTop 변경이 유효.
  void main.offsetHeight;
  // 짧은 200ms 만 보류 — 레이아웃 전환 깜빡임 방지용. 이후엔 scroll-direction 기반
  // bar 토글이 정상 동작해 휠다운 시 bar 사라짐.
  _qzEndTransitionUntil = performance.now() + 200;
  if (_qzEndFitCleanup) _qzEndFitCleanup();
  // 전환 직후 콘텐츠가 viewport 보다 짧으면 곧장 atBottom 상태 → shadow 노출 방지.
  _qzEndUpdateAtBottom(main);
  // 스크롤바가 나타나는 바로 그 프레임에서 bar 슬라이드 아웃도 같이 시작 → 단일 모션 인상.
  // atbottom (콘텐츠 ≤ viewport) 인 경우는 bar 가 계속 보여야 하므로 제외.
  if (!main.classList.contains('main-area--end-scroll-atbottom')) {
    const bar = document.getElementById('quizEndBar');
    if (bar) { bar.classList.remove('quiz-end-bar--peek'); bar.classList.add('quiz-end-bar--hidden'); }
  }
}

// end-scroll 모드 진입 시 부착, 종료 시 해제되는 persistent 리스너.
// - wheel: 항상 preventDefault → momentum 시스템으로 velocity 가산. native instant scroll 방지.
//          fit 모드에서 deltaY > 0 인 경우 transition 트리거.
// - touchstart: native touch 가 다시 잡을 때 우리 momentum 중단 (충돌 방지).
function _qzEndAttachPersistent(main) {
  if (_qzEndPersistentCleanup) _qzEndPersistentCleanup();
  const wheelDeltaPx = (e) => {
    if (e.deltaMode === 1) return e.deltaY * 16;
    if (e.deltaMode === 2) return e.deltaY * main.clientHeight;
    return e.deltaY;
  };
  const onWheel = (e) => {
    e.preventDefault();
    if (main.classList.contains('main-area--end-scroll-fit')) {
      if (e.deltaY > 0) _qzEndSwitchOffFit(main);
      else return; // fit 모드에서 wheel-up 은 무시
    }
    _qzEndMomPush(wheelDeltaPx(e));
  };
  let _touchLastY = 0;
  const onUserTouchStart = (e) => {
    // 새 터치 시작 → native scroll 인계, 우리 momentum 중단.
    _touchLastY = e.touches[0] ? e.touches[0].clientY : 0;
    _qzEndMomStop();
  };
  const onTouchMove = (e) => {
    // 경계(상단/하단)에서 오버슈트 방향으로 움직일 때 preventDefault → native rubber-band 제거.
    if (!e.cancelable || !e.touches[0]) return;
    const y  = e.touches[0].clientY;
    const dy = y - _touchLastY; // +: 손가락 아래 이동 = 콘텐츠 위로 (scrollTop 감소)
    _touchLastY = y;
    const atTop    = main.scrollTop <= 0;
    const atBottom = main.scrollTop >= main.scrollHeight - main.clientHeight - 1;
    if ((atTop && dy > 0) || (atBottom && dy < 0)) e.preventDefault();
  };
  main.addEventListener('wheel',       onWheel,          { passive: false });
  main.addEventListener('touchstart',  onUserTouchStart, { passive: true });
  main.addEventListener('touchmove',   onTouchMove,      { passive: false });
  _qzEndPersistentCleanup = () => {
    main.removeEventListener('wheel',      onWheel);
    main.removeEventListener('touchstart', onUserTouchStart);
    main.removeEventListener('touchmove',  onTouchMove);
    _qzEndPersistentCleanup = null;
  };
}

function _qzEnterEndScrollMode() {
  const main = document.querySelector('.main-area');
  if (!main) return;
  // 진입 즉시 scroll 모드 — fit 단계 건너뛰어 스크롤바를 처음부터 노출하고,
  // bar 가 hidden 이 아니므로 ::after 라운드 코너 오버레이도 그대로 노출.
  main.classList.add('main-area--end-scroll');
  main.scrollTop = 0;
  _qzEndLastScrollTop = 0;
  const bar = document.getElementById('quizEndBar');
  if (bar) { bar.classList.remove('quiz-end-bar--hidden'); bar.classList.remove('quiz-end-bar--peek'); }
  _qzEndAttachPersistent(main);
  // atbottom 갱신은 첫 스크롤 이벤트(_qzEndOnScroll) 에서 처리 — 진입 시점엔 의도적으로 토글하지 않음.
  // 콘텐츠 ≤ viewport 라도 진입 직후 #quizEndBar::before (top shadow) 가 노출 상태로 유지됨.
  // 키보드/터치 fit-trigger 는 fit 모드가 없으므로 부착 불필요. 휠은 _qzEndAttachPersistent
  // 가 처리(custom momentum), 키/터치는 네이티브 스크롤로 작동.
}
function _qzLeaveEndScrollMode() {
  const main = document.querySelector('.main-area');
  if (!main) return;
  main.classList.remove('main-area--end-scroll');
  main.classList.remove('main-area--end-scroll-fit');
  main.classList.remove('main-area--end-scroll-atbottom');
  main.scrollTop = 0;
  _qzEndLastScrollTop = 0;
  _qzEndTransitionUntil = 0;
  const bar = document.getElementById('quizEndBar');
  if (bar) { bar.classList.remove('quiz-end-bar--hidden'); bar.classList.remove('quiz-end-bar--peek'); }
  clearTimeout(_qzEndScrollStopTimer);
  _qzEndMomStop();
  if (_qzEndFitCleanup) _qzEndFitCleanup();
  if (_qzEndPersistentCleanup) _qzEndPersistentCleanup();
}
(function _qzInitEndScroll() {
  const main = document.querySelector('.main-area');
  if (!main) return;
  main.addEventListener('scroll', _qzEndOnScroll, { passive: true });
})();

// ── 결과 화면 점수 요약 그룹: 컨테이너 비율 기반 가로/세로 모드 토글 ──
// #qzEndSummary 자기 자신을 ResizeObserver 로 관찰.
//   width >= height → .qz-end-summary--horizontal (이미지 배치)
//   width <  height → 기본 세로 스택
// 가로 모드 진입 시 height 가 줄어 비율이 더 커지므로 진동 없이 안정적.
(function setupQzEndSummaryLayout() {
  const sum = document.getElementById('qzEndSummary');
  if (!sum || !('ResizeObserver' in window)) return;
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width === 0 && height === 0) continue;        // hidden 상태 무시
      sum.classList.toggle('qz-end-summary--horizontal', width >= height);
    }
  });
  ro.observe(sum);
})();

/* ── Lottie 커서 follower (엔트리 화면 전용) — 그림자 분신술 트레일 ──
   lead + ghost N-1개의 Lottie 인스턴스가 각자 다른 lerp 속도로 동일한 타깃(커서)을 추적.
   - 빠르게 움직일 때: lerp 차이로 부채꼴 트레일이 자연스럽게 펼쳐짐 (방향 무관)
   - 멈춰 있을 때: 모든 잔상이 lead 위치로 수렴
   - TRAIL[0] = lead(최상단/불투명), 인덱스가 커질수록 lerp 작음·opacity 낮음·scale 작음 */
const QE_TRAIL = [
  { lerp: 0.32, opacity: 1.00, scale: 1.00 },
  { lerp: 0.22, opacity: 0.55, scale: 0.92 },
  { lerp: 0.15, opacity: 0.32, scale: 0.84 },
  { lerp: 0.10, opacity: 0.18, scale: 0.76 },
  { lerp: 0.06, opacity: 0.09, scale: 0.68 },
];
const QE_TRAIL_POS = QE_TRAIL.map(() => ({ x: -300, y: -300 }));
let qeTrailElements = null;   // _initQuizDecoLottie 에서 채움

/* 커서 따라다니는 Lottie — 항상 화살표 커서 바로 아래(6시 방향).
   - QE_BASE_OFFSET_X = -56 : Lottie width(112)/2 만큼 왼쪽 → Lottie 가로 중심을 커서 X 에 정렬
   - QE_BASE_OFFSET_Y = 8   : 커서 바로 아래 살짝 띄움
   - 속도 기반 추가 오프셋(방향성 기울임)은 제거 → 이동 중에도 타깃은 항상 커서 바로 아래.
     트레일(QE_TRAIL_POS lerp)이 매 프레임 타깃을 따라잡으며 자연스러운 lag 효과만 유지하므로,
     정지 시엔 즉시 6시 위치로 수렴함. */
let qeMouseX = -300, qeMouseY = -300;
const QE_BASE_OFFSET_X = -36;
const QE_BASE_OFFSET_Y = -12;

document.addEventListener('mousemove', (e) => {
  qeMouseX = e.clientX;
  qeMouseY = e.clientY;
});
(function _tickCursorFollower() {
  function tick() {
    const tx = qeMouseX + QE_BASE_OFFSET_X;
    const ty = qeMouseY + QE_BASE_OFFSET_Y;

    const entry = document.getElementById('quizEntryStage');
    if (qeTrailElements && entry && entry.classList.contains('show')) {
      for (let i = 0; i < QE_TRAIL.length; i++) {
        QE_TRAIL_POS[i].x += (tx - QE_TRAIL_POS[i].x) * QE_TRAIL[i].lerp;
        QE_TRAIL_POS[i].y += (ty - QE_TRAIL_POS[i].y) * QE_TRAIL[i].lerp;
        qeTrailElements[i].style.transform =
          `translate(${QE_TRAIL_POS[i].x}px, ${QE_TRAIL_POS[i].y}px) scale(${QE_TRAIL[i].scale})`;
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

/* ── 엔트리 chip 이벤트 바인딩 ── */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#qeCountChips .qe-chip').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#qeCountChips .qe-chip').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      quizConfig.count = +b.dataset.count;
    });
  });
  document.querySelectorAll('#qeTypeChips .qe-chip').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#qeTypeChips .qe-chip').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      quizConfig.type = b.dataset.type;
      document.getElementById('qeDesc').textContent = QUIZ_TYPE_DESC[quizConfig.type] || QUIZ_TYPE_DESC.ALL;
    });
  });
  // 문제 수 옵션 최대값의 자릿수를 CSS 변수에 반영 → quiz-count-chip 너비 고정
  // (옵션 추가/변경 시 자동 적용. 예: 100문제 옵션 추가 시 자릿수 3으로 자동 갱신)
  const counts = [...document.querySelectorAll('#qeCountChips [data-count]')]
    .map(b => parseInt(b.dataset.count, 10))
    .filter(Number.isFinite);
  if (counts.length) {
    const maxDigits = String(Math.max(...counts)).length;
    document.documentElement.style.setProperty('--quiz-count-digits', maxDigits);
  }
});
