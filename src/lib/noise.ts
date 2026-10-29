// 공부할 때 배경 소리: 파일 없이 기기에서 만든다 (Web Audio). 비 · 장작불 · 밤 · 파도
export type NoiseKind = 'rain' | 'fire' | 'night' | 'waves';
export const NOISE_NAME: Record<NoiseKind, string> = { rain: '비', fire: '장작불', night: '밤', waves: '파도' };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let stopFns: (() => void)[] = [];

function audio(): AudioContext {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 몇 초짜리 잡음 버퍼: white(고른) · pink(부드러운) · brown(낮은) */
function noiseBuffer(c: AudioContext, color: 'white' | 'pink' | 'brown', seconds = 4): AudioBuffer {
  const len = c.sampleRate * seconds;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'white') data[i] = w * 0.5;
    else if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    } else {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buf;
}

function loop(c: AudioContext, buf: AudioBuffer, to: AudioNode) {
  const s = c.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.connect(to);
  s.start();
  stopFns.push(() => s.stop());
  return s;
}

function filter(c: AudioContext, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

export function playNoise(kind: NoiseKind, volume: number) {
  stopNoise();
  const c = audio();
  master = c.createGain();
  master.gain.value = volume;
  master.connect(c.destination);
  if (kind === 'rain') {
    const hp = filter(c, 'highpass', 500);
    const lp = filter(c, 'lowpass', 7000);
    hp.connect(lp).connect(master);
    loop(c, noiseBuffer(c, 'pink'), hp);
  } else if (kind === 'fire') {
    const lp = filter(c, 'lowpass', 500);
    const g = c.createGain();
    g.gain.value = 0.9;
    lp.connect(g).connect(master);
    loop(c, noiseBuffer(c, 'brown'), lp);
    // 탁탁 튀는 소리
    const crack = () => {
      const t = c.currentTime;
      const s = c.createBufferSource();
      s.buffer = noiseBuffer(c, 'white', 0.03);
      const hp = filter(c, 'highpass', 1500 + Math.random() * 2500);
      const eg = c.createGain();
      eg.gain.setValueAtTime(0.3 + Math.random() * 0.5, t);
      eg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      s.connect(hp).connect(eg).connect(master!);
      s.start(t);
    };
    const id = setInterval(() => Math.random() < 0.55 && crack(), 140);
    stopFns.push(() => clearInterval(id));
  } else if (kind === 'night') {
    const lp = filter(c, 'lowpass', 350);
    const g = c.createGain();
    g.gain.value = 0.5;
    lp.connect(g).connect(master);
    loop(c, noiseBuffer(c, 'brown'), lp);
    // 귀뚜라미: 높은 음을 짧게 여러 번
    const chirp = () => {
      const t = c.currentTime;
      const o = c.createOscillator();
      o.frequency.value = 4300 + Math.random() * 400;
      const eg = c.createGain();
      eg.gain.value = 0;
      for (let i = 0; i < 3; i++) {
        eg.gain.setValueAtTime(0.025, t + i * 0.07);
        eg.gain.setValueAtTime(0, t + i * 0.07 + 0.035);
      }
      o.connect(eg).connect(master!);
      o.start(t);
      o.stop(t + 0.25);
    };
    const id = setInterval(() => Math.random() < 0.5 && chirp(), 700);
    stopFns.push(() => clearInterval(id));
  } else {
    const lp = filter(c, 'lowpass', 900);
    const swell = c.createGain();
    swell.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = c.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth).connect(swell.gain);
    lfo.start();
    stopFns.push(() => lfo.stop());
    lp.connect(swell).connect(master);
    loop(c, noiseBuffer(c, 'pink'), lp);
  }
}

export function setNoiseVolume(v: number) {
  if (master) master.gain.value = v;
}

export function stopNoise() {
  for (const f of stopFns)
    try {
      f();
    } catch {
      /* 이미 멈춤 */
    }
  stopFns = [];
  master?.disconnect();
  master = null;
}
