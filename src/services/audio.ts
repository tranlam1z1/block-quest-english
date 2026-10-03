// ============================================================
// Âm thanh: hiệu ứng (SFX) và nhạc nền được TỔNG HỢP bằng Web Audio API
// → không cần file mp3, nhẹ, chạy offline. Sau này có thể thay bằng file thật.
// ============================================================

export type SfxName = 'click' | 'correct' | 'wrong' | 'hit' | 'crit' | 'hurt' | 'combo' | 'win' | 'lose' | 'tick' | 'start';

let ctx: AudioContext | null = null;
let sfxEnabled = true;
let musicGain: GainNode | null = null;
let musicTimer: number | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Trình duyệt chỉ cho phát âm thanh sau khi người dùng chạm/bấm
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Gọi trong sự kiện bấm/chạm đầu tiên để "mở khóa" âm thanh trên điện thoại */
export function unlockAudio() {
  getCtx();
}

export function setSfxEnabled(on: boolean) {
  sfxEnabled = on;
}

/** Phát 1 nốt đơn giản */
function tone(
  freq: number,
  start: number,
  dur: number,
  { type = 'square' as OscillatorType, vol = 0.15, slideTo, dest }: { type?: OscillatorType; vol?: number; slideTo?: number; dest?: AudioNode } = {},
) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(dest ?? c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Tiếng "bụp" bằng nhiễu trắng (dùng cho đòn đánh) */
function noise(start: number, dur: number, vol = 0.2) {
  const c = getCtx();
  if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = vol;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1200;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + start);
}

export function playSfx(name: SfxName) {
  if (!sfxEnabled) return;
  switch (name) {
    case 'click':
      tone(660, 0, 0.06, { vol: 0.08 });
      break;
    case 'start':
      [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.12, { vol: 0.1 }));
      break;
    case 'correct':
      tone(784, 0, 0.1, { vol: 0.12 });
      tone(1175, 0.08, 0.18, { vol: 0.12 });
      break;
    case 'wrong':
      tone(220, 0, 0.25, { type: 'sawtooth', vol: 0.08, slideTo: 140 });
      break;
    case 'hit':
      noise(0, 0.15, 0.25);
      tone(300, 0, 0.12, { type: 'triangle', vol: 0.2, slideTo: 120 });
      break;
    case 'crit':
      noise(0, 0.25, 0.35);
      tone(900, 0, 0.3, { type: 'square', vol: 0.12, slideTo: 200 });
      break;
    case 'hurt':
      noise(0, 0.2, 0.2);
      tone(180, 0, 0.25, { type: 'triangle', vol: 0.2, slideTo: 90 });
      break;
    case 'combo':
      [659, 784, 988, 1319].forEach((f, i) => tone(f, i * 0.06, 0.1, { vol: 0.1 }));
      break;
    case 'win':
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.18, { vol: 0.12 }));
      break;
    case 'lose':
      [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.2, 0.3, { type: 'triangle', vol: 0.15 }));
      break;
    case 'tick':
      tone(1000, 0, 0.04, { vol: 0.05 });
      break;
  }
}

// ---------------- Nhạc nền: giai điệu vui vẻ lặp lại ----------------
// Mỗi phần tử: [nốt MIDI hoặc 0 = nghỉ, số phách]
const MELODY: [number, number][] = [
  [72, 1], [76, 1], [79, 1], [76, 1], [77, 1], [81, 1], [79, 2],
  [76, 1], [74, 1], [72, 1], [74, 1], [76, 2], [0, 2],
  [72, 1], [76, 1], [79, 1], [84, 1], [81, 1], [79, 1], [77, 2],
  [76, 1], [77, 1], [74, 1], [71, 1], [72, 2], [0, 2],
];
const BASS = [48, 48, 53, 53, 55, 55, 48, 48];
const BEAT = 0.22; // giây mỗi phách

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function scheduleLoop() {
  const c = getCtx();
  if (!c || !musicGain) return;
  let t = 0;
  for (const [note, beats] of MELODY) {
    if (note) tone(midi(note), t, beats * BEAT * 0.9, { type: 'square', vol: 0.05, dest: musicGain });
    t += beats * BEAT;
  }
  const bar = t / BASS.length;
  BASS.forEach((n, i) => tone(midi(n), i * bar, bar * 0.8, { type: 'triangle', vol: 0.09, dest: musicGain! }));
  return t;
}

let wantMusic = false;

export function startMusic() {
  wantMusic = true;
  const c = getCtx();
  if (!c || musicTimer !== null) return;
  if (c.state !== 'running') {
    // Chưa được phép phát (người dùng chưa chạm) → chờ đến khi AudioContext chạy
    c.resume()
      .then(() => {
        if (wantMusic && c.state === 'running') startMusic();
      })
      .catch(() => {});
    return;
  }
  musicGain = c.createGain();
  musicGain.gain.value = 0.6;
  musicGain.connect(c.destination);
  const len = scheduleLoop() ?? 6;
  musicTimer = window.setInterval(() => scheduleLoop(), len * 1000);
}

export function stopMusic() {
  wantMusic = false;
  if (musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
  if (musicGain && ctx) {
    musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    const g = musicGain;
    setTimeout(() => g.disconnect(), 300);
  }
  musicGain = null;
}
