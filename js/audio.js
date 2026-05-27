/* audio.js — AudioManager, 재생 제어 */

let volume = 0.8;
const AudioManager = {
  note:     null,   // 계이름 버튼 음원 (기존 AudioManager.note)
  practice: null,   // 연습하기 음원    (기존 AudioManager.practice)
  stopAll() {
    if (this.note)     { this.note.pause();     this.note.currentTime = 0; this.note = null; }
    if (this.practice && !this.practice.paused) { this.practice.pause(); }
  },
};
function playNote(name) {
  const file = MP3_FILES[name];
  if (!file) return;
  if (AudioManager.note) { AudioManager.note.pause(); AudioManager.note.currentTime = 0; AudioManager.note = null; }
  const audio = new Audio(BASE_URL + file);
  audio.volume = volume;
  AudioManager.note = audio;
  audio.onended = () => {
    if (AudioManager.note === audio) {
      AudioManager.note = null;
      document.querySelectorAll('#noteGrid .note-btn.active').forEach(b => b.classList.remove('active'));
    }
  };
  audio.play().catch(() => {});
}

// 플레이어 바 SVG 아이콘 (Heroicons solid 24 — fill 스타일)
const _ICON_PLAY  = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653Z"/></svg>';
const _ICON_PAUSE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z"/></svg>';
const _ICON_VOL_ON  = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.348 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z"/><path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z"/></svg>';
const _ICON_VOL_OFF = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.348 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z"/></svg>';
function updatePlayButtons(playing) {
  const btn = document.getElementById('ppPlayPause');
  if (btn) btn.innerHTML = playing ? _ICON_PAUSE : _ICON_PLAY;
  if (btn) btn.setAttribute('aria-label', playing ? '일시정지' : '재생');
}
function playPractice() {
  if (!AudioManager.practice) {
    const song = SONGS[_loadedSong]; if (!song) return;
    const songKeyAtCreate = _loadedSong;
    AudioManager.practice = new Audio(song.base + 'song.mp3');
    AudioManager.practice.volume = volume;
    AudioManager.practice.playbackRate = _playbackRate;
    AudioManager.practice.addEventListener('ended', () => {
      updatePlayButtons(false); _hlStop();
      const seek = document.getElementById('ppSeek'); if (seek) { seek.value = 0; _ppSeekRefreshFill(seek); }
      const timeEl = document.getElementById('ppTime');
      if (timeEl && AudioManager.practice.duration) timeEl.textContent = _fmt(0) + ' / ' + _fmt(AudioManager.practice.duration);
      _addPracticeStar(songKeyAtCreate);
    });
    AudioManager.practice.addEventListener('error', () => { alert('MP3 파일을 불러올 수 없어요.'); updatePlayButtons(false); _hlStop(); });
  }
  AudioManager.practice.volume = volume;
  const p = AudioManager.practice.play();
  if (p && p.then) p.then(() => { updatePlayButtons(true); _hlStart(); }).catch(() => {});
  else { updatePlayButtons(true); _hlStart(); }
}
function stopPractice() {
  if (AudioManager.practice && !AudioManager.practice.paused) AudioManager.practice.pause();
  updatePlayButtons(false);
  _hlStop();
}

/* ── 플레이어 바 기능 ── */
function togglePlayPause() {
  if (!AudioManager.practice || AudioManager.practice.paused) { playPractice(); }
  else { AudioManager.practice.pause(); updatePlayButtons(false); _hlPause(); }
}
function stopAndReset() {
  stopPractice();
  if (AudioManager.practice) AudioManager.practice.currentTime = 0;
  const seek = document.getElementById('ppSeek'); if (seek) { seek.value = 0; _ppSeekRefreshFill(seek); }
  const timeEl = document.getElementById('ppTime');
  if (timeEl) timeEl.textContent = _fmt(0) + ' / ' + (AudioManager.practice ? _fmt(AudioManager.practice.duration) : _fmt(0));
}

let _ppSeeking = false;
let _ppValueBeforeSeek = 0;
function _ppSeekDown() {
  _ppSeeking = true;
  const seek = document.getElementById('ppSeek');
  if (seek) _ppValueBeforeSeek = parseFloat(seek.value) || 0;
}
function _ppSeekUp() {
  _ppSeeking = false;
  const seek = document.getElementById('ppSeek');
  if (!seek) return;
  const newPct = parseFloat(seek.value) || 0;
  const moved = Math.abs(newPct - _ppValueBeforeSeek) > 0.1;
  if (AudioManager.practice && AudioManager.practice.duration) {
    AudioManager.practice.currentTime = (newPct / 100) * AudioManager.practice.duration;
    _hlCur = null;
  }
  if (moved) _showPracticeSeekPopup();
}
function _showPracticeSeekPopup() {
  if (AudioManager.practice && !AudioManager.practice.paused) {
    AudioManager.practice.pause();
    updatePlayButtons(false);
  }
  if (_hlRAF) { cancelAnimationFrame(_hlRAF); _hlRAF = null; }
  document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
  _hlCur = null;
  resetHoles();
  _setCountdownNumber(null);
  document.getElementById('practicePopup').classList.add('show');
}
function _practicePopupYes() {
  document.getElementById('practicePopup').classList.remove('show');
  const seek = document.getElementById('ppSeek');
  const sliderPct = seek ? (parseFloat(seek.value) || 0) : 0;
  if (!AudioManager.practice) {
    playPractice();
    if (AudioManager.practice && sliderPct > 0.1) {
      const setSeek = () => {
        if (AudioManager.practice && AudioManager.practice.duration) {
          AudioManager.practice.currentTime = (sliderPct / 100) * AudioManager.practice.duration;
        }
      };
      if (AudioManager.practice.duration) setSeek();
      else AudioManager.practice.addEventListener('loadedmetadata', setSeek, { once: true });
    }
    return;
  }
  AudioManager.practice.volume = volume;
  const p = AudioManager.practice.play();
  if (p && p.then) p.then(() => { updatePlayButtons(true); _hlStart(); }).catch(() => {});
  else { updatePlayButtons(true); _hlStart(); }
}
function _practicePopupNo() {
  document.getElementById('practicePopup').classList.remove('show');
  if (AudioManager.practice) {
    stopAndReset();
  } else {
    const seek = document.getElementById('ppSeek');
    if (seek) { seek.value = 0; _ppSeekRefreshFill(seek); }
  }
}
function _ppSeekInput(el) {
  _ppSeekRefreshFill(el);
  if (AudioManager.practice && AudioManager.practice.duration) {
    const t = (el.value / 100) * AudioManager.practice.duration;
    const timeEl = document.getElementById('ppTime');
    if (timeEl) timeEl.textContent = _fmt(t) + ' / ' + _fmt(AudioManager.practice.duration);
  }
}
// 시크 바 채움 영역 — --seek-pct 변수에 현재 진행률(%)을 인라인으로 갱신 → CSS 그라데이션이 반영
function _ppSeekRefreshFill(el) {
  if (!el) return;
  const min = parseFloat(el.min) || 0;
  const max = parseFloat(el.max) || 100;
  const pct = ((parseFloat(el.value) - min) / (max - min)) * 100;
  el.style.setProperty('--seek-pct', pct + '%');
}

function _ppSetRate(rate) {
  _playbackRate = rate;
  if (AudioManager.practice) AudioManager.practice.playbackRate = rate;
  const idMap = { 0.5: 'ppRate05', 1.0: 'ppRate10', 1.5: 'ppRate15' };
  ['ppRate05', 'ppRate10', 'ppRate15'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.classList.toggle('active', id === idMap[rate]);
  });
}

let _mutedVol = 0.8;
function _ppUpdateVolIcon() {
  const icon = document.getElementById('ppVolIcon');
  if (!icon) return;
  // 2단계: 음소거(volume===0) → speaker-x-mark, 그 외 → speaker-wave
  icon.innerHTML = volume === 0 ? _ICON_VOL_OFF : _ICON_VOL_ON;
  icon.setAttribute('aria-label', volume === 0 ? '음소거 해제' : '음소거');
}
function _ppVolInput(el) {
  volume = parseFloat(el.value);
  if (AudioManager.practice) AudioManager.practice.volume = volume;
  _ppSeekRefreshFill(el);  // 볼륨 슬라이더도 동일 --seek-pct 변수 사용
  _ppUpdateVolIcon();
}
function _ppToggleMute() {
  const slider = document.getElementById('ppVolSlider');
  if (!slider) return;
  if (volume > 0) { _mutedVol = volume; volume = 0; }
  else            { volume = _mutedVol; }
  slider.value = volume;
  if (AudioManager.practice) AudioManager.practice.volume = volume;
  _ppSeekRefreshFill(slider);
  _ppUpdateVolIcon();
}

function _updateLearnVolumeIcon() {
  const bot = document.getElementById('volumeIconBot');
  if (bot) {
    bot.innerHTML = volume === 0 ? _ICON_VOL_OFF : _ICON_VOL_ON;
    bot.setAttribute('aria-label', volume === 0 ? '음소거 해제' : '음소거');
  }
}
let _learnMutedVol = 0.8;
function _toggleLearnMute() {
  if (volume > 0) { _learnMutedVol = volume; setVolume(0); }
  else            { setVolume(_learnMutedVol || 0.8); }
}
function setVolume(v) {
  volume = v;
  const vb = document.getElementById('volumeBar');
  if (vb) { vb.value = v; _ppSeekRefreshFill(vb); }
  if (AudioManager.note)   AudioManager.note.volume = v;
  if (AudioManager.practice)  AudioManager.practice.volume = v;
  _updateLearnVolumeIcon();
}
document.getElementById('volumeBar').addEventListener('input', e => {
  volume = parseFloat(e.target.value);
  if (AudioManager.practice) AudioManager.practice.volume = volume;
  _ppSeekRefreshFill(e.target);
  _updateLearnVolumeIcon();
});
_updateLearnVolumeIcon();
