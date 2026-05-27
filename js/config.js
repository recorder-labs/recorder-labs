/* config.js — 상수 및 데이터 정의 */

// ── 리소스 URL 상수 ──
// URL 변경 시 이 객체만 수정하면 됨.
const RESOURCE_URLS = {
  CHAR_LEFT:          'https://raw.githubusercontent.com/recorder-labs/recorder-labs/a3e264cce98d2bf6a0bf51a7d12ca6a57b452e6b/resources/char_left.png',
  CHAR_RIGHT:         'https://raw.githubusercontent.com/recorder-labs/recorder-labs/a3e264cce98d2bf6a0bf51a7d12ca6a57b452e6b/resources/char_right.png',
  LOTTIE_BUBBLE:      'https://raw.githubusercontent.com/recorder-labs/recorder-labs/a3e264cce98d2bf6a0bf51a7d12ca6a57b452e6b/resources/Bubble%20Explosion.json',
  LOTTIE_MELODY:      'https://raw.githubusercontent.com/recorder-labs/recorder-labs/a3e264cce98d2bf6a0bf51a7d12ca6a57b452e6b/resources/Melody.json',
  LOTTIE_AI:          'https://raw.githubusercontent.com/recorder-labs/recorder-labs/a3e264cce98d2bf6a0bf51a7d12ca6a57b452e6b/resources/AI%20Searching.json',
  LOTTIE_NOTE_PAT:    'https://raw.githubusercontent.com/recorder-labs/recorder-labs/a3e264cce98d2bf6a0bf51a7d12ca6a57b452e6b/resources/Note%20Pattern.json',
  SONG_BASE_AIRPLANE: 'https://raw.githubusercontent.com/recorder-labs/recorder-labs/a3e264cce98d2bf6a0bf51a7d12ca6a57b452e6b/songs/list_01/',
  SONG_BASE_HANS:     'https://raw.githubusercontent.com/recorder-labs/recorder-labs/a3e264cce98d2bf6a0bf51a7d12ca6a57b452e6b/songs/list_02/',
};

const NOTE_SHEET_IDS = {
  '도':    'C-major_do',  '레': 'C-major_re',  '미': 'C-major_mi',
  '파':    'C-major_fa',  '파♯': 'C-major_fa_sharp', '솔': 'C-major_sol',
  '라':    'C-major_la',  '시♭': 'C-major_si_flat',  '시': 'C-major_si',
  '높은도':'C-major_do_high', '높은레':'C-major_re_high',
};

const BASE_URL = 'https://raw.githubusercontent.com/recorder-labs/recorder-labs/a3e264cce98d2bf6a0bf51a7d12ca6a57b452e6b/sounds/';
const MP3_FILES = {
  '도':'recorder_do.mp3','레':'recorder_re.mp3','미':'recorder_mi.mp3',
  '파':'recorder_fa.mp3','파♯':'recorder_fa_sharp.mp3','솔':'recorder_sol.mp3',
  '라':'recorder_la.mp3','시♭':'recorder_si_flat.mp3','시':'recorder_si.mp3',
  '높은도':'recorder_do_high.mp3','높은레':'recorder_re_high.mp3'
};

const HOLES = ['h0','h1','h2','h3','h4','h5','h6_1','h6_2','h7_1','h7_2'];
const FILLED = '#000000';
const EMPTY  = 'white';
const ANSWER_COLOR = '#08bb68';
const HOLE_NAMES = {
  h0:'왼손 엄지(뒤)',h1:'왼손 1번',h2:'왼손 2번',h3:'왼손 3번',h4:'오른손 4번',
  h5:'오른손 5번',h6_1:'오른손 6번(왼)',h6_2:'오른손 6번(오)',h7_1:'오른손 7번(왼)',h7_2:'오른손 7번(오)'
};
const NOTES = {
  '도':    {closed:['h0','h1','h2','h3','h4','h5','h6_1','h6_2','h7_1','h7_2'],label:'도'},
  '레':    {closed:['h0','h1','h2','h3','h4','h5','h6_1','h6_2'],label:'레'},
  '미':    {closed:['h0','h1','h2','h3','h4','h5'],label:'미'},
  '파':    {closed:['h0','h1','h2','h3','h4'],label:'파'},
  '파♯':  {closed:['h0','h1','h2','h3','h5','h6_1','h6_2','h7_1','h7_2'],label:'파♯'},
  '솔':    {closed:['h0','h1','h2','h3'],label:'솔'},
  '라':    {closed:['h0','h1','h2'],label:'라'},
  '시♭':  {closed:['h0','h1','h3','h4'],label:'시♭'},
  '시':    {closed:['h0','h1'],label:'시'},
  '높은도':{closed:['h0','h2'],label:'높은 도'},
  '높은레':{closed:['h2'],label:'높은 레'},
};
const NOTE_NAMES = Object.keys(NOTES);

/* ── 퀴즈 설정 ── */
const QUIZ_TYPES_DEFAULT = ['A','B','C','D','E'];
const QUIZ_TYPE_LABELS = {
  A: 'Type A · 운지법 만들기',
  B: 'Type B · 운지 그림 찾기',
  C: 'Type C · 계이름 읽기',
  D: 'Type D · 음표 위치 찾기',
  E: 'Type E · 잘못된 운지 찾기',
};
const QUIZ_TYPE_UI_LABELS = {
  A: '운지법 만들기',
  B: '운지 그림 찾기',
  C: '계이름 읽기',
  D: '음표 위치 찾기',
  E: '잘못된 운지 찾기',
};
const QUIZ_TYPE_DESC = {
  ALL: '모든 유형의 문제가 골고루 나와요.',
  A:   '계이름을 보고 리코더 구멍을 직접 선택해서 운지법을 만들어 보세요.',
  B:   '계이름에 맞는 올바른 운지법 그림을 4개 보기 중에서 골라 보세요.',
  C:   '오선지 위 음표를 보고 어떤 계이름인지 골라 보세요.',
  D:   '계이름을 보고 오선지 위에서 음표가 있는 위치를 선택해 보세요.',
  E:   '운지법 그림에서 딱 하나 잘못된 구멍을 찾아 선택해 보세요.',
};
/* Type D 음표 풀: 파♯/시♭ 은 자연음과 staff 위치(Y) 가 동일해 구분 불가 → 제외. */
const QUIZ_TYPE_D_NOTES = NOTE_NAMES.filter(n => n !== '파♯' && n !== '시♭');
const QUIZ_PRAISE = ['정답! 🎉','잘했어요! 🌟','멋져요! 🎵','대단해요! 🏆'];

/* ── 곡 목록 ── */
const SONGS = {
  airplane: {
    base:     RESOURCE_URLS.SONG_BASE_AIRPLANE,
    title:    '비행기',
    tempo:    '조금 빠르게',
    composer: '메이슨 작곡',
    scoreMode: 'svg',
  },
  hans: {
    base:     RESOURCE_URLS.SONG_BASE_HANS,
    title:    '소년 한스',
    tempo:    '보통 빠르게',
    composer: '독일 민요',
    scoreMode: 'svg',
  },
};

/* ── 연습하기 별 게이지 ── */
const PRACTICE_STAR_TOTAL = 10;

const RECORDER_SVG = {
  VIEW_H: 722.994,
  HOLE_LABEL_FONT: 22,
  LEGEND_FONT_AT_1920: 18,
  LEGEND_FONT_MIN: 14,
  REF_W_AT_1920: 158,
  REF_W_RATIO: 158 / 1920,
};

const PRACTICE_SVG = {
  SCORE_W_PER_REC_H: 1.6,
  REC_ASPECT: 5.56,
  TITLE_FONT_RATIO: 0.0384,
  TEMPO_FONT_RATIO: 0.0142,
  COUNTDOWN_FONT_RATIO: 0.087,
  NOTE_LABEL_GAP: 40,   // 음표 하단 ↔ 계이름 라벨 상단 간격 (viewBox 단위)
};

const QUIZ_ENTRY = {
  VIEWPORT_REF: 1920,  // 기준 뷰포트 너비

  // 폰트: 기준값 / 최솟값 = 1280px CSS 미디어쿼리값
  TITLE_FONT:        52,  TITLE_FONT_MIN:   42,
  LABEL_FONT:        18,  LABEL_FONT_MIN:   16,
  CHIP_FONT:         18,  CHIP_FONT_MIN:    16,
  DESC_FONT:         18,  DESC_FONT_MIN:    16,
  START_FONT:        21,  START_FONT_MIN:   18,

  // 여백: 기준값 / 최솟값
  FORM_PAD_V:        44,  FORM_PAD_V_MIN:   44,
  FORM_PAD_H:        32,  FORM_PAD_H_MIN:   22,
  FORM_GAP:          32,  FORM_GAP_MIN:     24,  // qe-form 내 title↔sections↔start
  SECTIONS_GAP:      32,  SECTIONS_GAP_MIN: 24,
  SECTION_GAP:       12,  SECTION_GAP_MIN:  10,

  // 추가 여백
  CHIPS_GAP:          8,   CHIPS_GAP_MIN:        8,
  CHIP_PAD_V:        10,   CHIP_PAD_V_MIN:       10,
  CHIP_PAD_H:        20,   CHIP_PAD_H_MIN:       20,
  DESC_PAD_V:        20,   DESC_PAD_V_MIN:       20,
  DESC_PAD_H:        18,   DESC_PAD_H_MIN:       18,
  START_MARGIN_TOP:  24,   START_MARGIN_TOP_MIN: 10,
  START_PAD_V:       14,   START_PAD_V_MIN:      14,
  START_PAD_H:       44,   START_PAD_H_MIN:      44,
  LABEL_GAP:          6,   LABEL_GAP_MIN:         6,
  BAR_H:             15,   BAR_H_MIN:            15,
};
