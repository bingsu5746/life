// 집중 화면: 공부 타이머 · 모의고사 보기. 지금 시각은 보여 주지 않는다.
import { useEffect, useRef, useState } from 'react';
import { NOISE_NAME, playNoise, setNoiseVolume, stopNoise, type NoiseKind } from '../../lib/noise';
import { examSoundUrl, saveSound } from '../../lib/soundStore';
import { addSession } from './actions';
import { alive } from './model';
import { hhmm, MOCK_SUBJECTS, mockView, type MockState } from './mockExam';
import { getStudy, useStudy, useWords } from './store';
import { clock, minutesText, nextPhase, pause, resume, view, type TimerState } from './timer';
import { primeAudio } from './timerStore';
import { go, toast, useNow, useToday } from './ui';

/** 전체 화면 (iPad·PC. 아이폰 Safari 는 지원하지 않아 그냥 화면을 가득 채운다) + 화면 꺼짐 막기 */
function useImmersive() {
  useEffect(() => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    try {
      if (!document.fullscreenElement) void (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch?.(() => {});
    } catch {
      /* 지원 안 함 */
    }
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    void nav.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {});
    document.body.classList.add('focus-on');
    return () => {
      document.body.classList.remove('focus-on');
      void lock?.release().catch(() => {});
      try {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      } catch {
        /* 무시 */
      }
    };
  }, []);
}

/** 손을 대면 잠깐 단추가 보이고, 4초 뒤 다시 숨는다 */
function useReveal(): [boolean, () => void] {
  const [shown, setShown] = useState(true);
  const t = useRef(0);
  const poke = () => {
    setShown(true);
    clearTimeout(t.current);
    t.current = window.setTimeout(() => setShown(false), 4000);
  };
  useEffect(() => {
    poke();
    return () => clearTimeout(t.current);
  }, []);
  return [shown, poke];
}

/** 공부 타이머 집중 화면 */
export function FocusTimer({ timer, update, onStop, onExit }: { timer: TimerState; update: (t: TimerState | null) => void; onStop: () => void; onExit: () => void }) {
  useImmersive();
  const d = useStudy();
  const today = useToday();
  const now = useNow(500);
  const pomo = timer.pomo ?? d.settings.pomo;
  const v = view(timer, now, pomo);
  const [shown, poke] = useReveal();
  const [noise, setNoise] = useState<NoiseKind | ''>('');
  const [vol, setVol] = useState(0.5);
  useEffect(() => () => stopNoise(), []);
  const studiedNow = timer.kind === 'watch' ? v.shownMs : timer.studiedMs + (timer.phase === 'work' ? Math.min(now - (timer.runningSince ?? now) + timer.elapsedMs, pomo.work * 60_000) : 0);
  const todayMin =
    alive(d.sessions)
      .filter((s) => s.date === today)
      .reduce((a, s) => a + s.minutes, 0) + Math.floor(studiedNow / 60_000);
  const paused = timer.runningSince === null;
  const r = 140;
  const c = 2 * Math.PI * r;
  return (
    <div className={`focus ${timer.phase !== 'work' && timer.kind === 'pomo' ? 'rest' : ''} ${shown ? 'show' : ''}`} onPointerDown={poke}>
      <div className="focus-top">
        <span>{timer.label}</span>
        <small>{timer.kind === 'watch' ? '스톱워치' : timer.phase === 'work' ? `${pomo.work}분 · ${timer.round}번째` : timer.phase === 'long' ? '긴 휴식' : '휴식'}</small>
      </div>
      <div className="focus-main">
        <svg viewBox="0 0 320 320" className="focus-ring" aria-hidden>
          <circle cx="160" cy="160" r={r} className="track" />
          <circle cx="160" cy="160" r={r} className="fill" strokeDasharray={c} strokeDashoffset={c * (1 - v.progress)} transform="rotate(-90 160 160)" />
        </svg>
        <div className="focus-time">
          <b className={paused ? 'paused' : ''}>{clock(v.shownMs)}</b>
          {v.finished ? (
            <small>{timer.phase === 'work' ? '공부 끝! 쉬어요' : '휴식 끝'}</small>
          ) : (
            <div className="focus-mini" onPointerDown={(e) => e.stopPropagation()}>
              <button aria-label={paused ? '이어서' : '멈춤'} onClick={() => (paused ? (primeAudio(), update(resume(timer, Date.now()))) : update(pause(timer, Date.now())))}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  {paused ? <path d="M8 5.5v13l10.5-6.5z" /> : <path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z" />}
                </svg>
              </button>
              <button aria-label="끝내고 기록" onClick={onStop}>
                <svg viewBox="0 0 24 24" aria-hidden>
                  <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
      {timer.kind === 'pomo' && timer.phase !== 'work' && <BreakWords dark />}
      <div className="focus-bottom">
        <span>오늘 {minutesText(todayMin)}</span>
      </div>
      <div className="focus-ctl" onPointerDown={(e) => e.stopPropagation()}>
        <div className="focus-noise">
          {(Object.keys(NOISE_NAME) as NoiseKind[]).map((k) => (
            <button
              key={k}
              className={noise === k ? 'on' : ''}
              onClick={() => {
                if (noise === k) {
                  stopNoise();
                  setNoise('');
                } else {
                  playNoise(k, vol);
                  setNoise(k);
                }
              }}
            >
              {NOISE_NAME[k]}
            </button>
          ))}
          {noise && <input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => (setVol(Number(e.target.value)), setNoiseVolume(Number(e.target.value)))} aria-label="소리 크기" />}
        </div>
        <div className="focus-btns">
          {timer.kind === 'pomo' && (v.finished || timer.phase !== 'work') && (
            <button className="primary" onClick={() => (primeAudio(), update(nextPhase(timer, Date.now(), pomo).state))}>
              {timer.phase === 'work' ? '휴식 시작' : '다음 공부'}
            </button>
          )}
          {v.finished && <button onClick={onStop}>끝내고 기록</button>}
          <button onClick={onExit}>나가기</button>
        </div>
      </div>
    </div>
  );
}

/** 아날로그 시계 (시험장 시각) */
function AnalogClock({ min }: { min: number }) {
  const h = ((min / 60) % 12) * 30;
  const m = (min % 60) * 6;
  const s = ((min * 60) % 60) * 6;
  return (
    <svg viewBox="0 0 200 200" className="mk-clock" aria-hidden>
      <circle cx="100" cy="100" r="96" className="face" />
      {Array.from({ length: 60 }, (_, i) => (
        <line key={i} x1="100" y1={i % 5 ? 8 : 6} x2="100" y2={i % 5 ? 12 : 20} transform={`rotate(${i * 6} 100 100)`} className={i % 5 ? 'tick' : 'tick big'} />
      ))}
      {Array.from({ length: 12 }, (_, i) => {
        const a = ((i + 1) * 30 * Math.PI) / 180;
        return (
          <text key={i} x={100 + 70 * Math.sin(a)} y={100 - 70 * Math.cos(a) + 6} textAnchor="middle" className="num">
            {i + 1}
          </text>
        );
      })}
      <line x1="100" y1="100" x2="100" y2="50" transform={`rotate(${h} 100 100)`} className="hand h" />
      <line x1="100" y1="100" x2="100" y2="28" transform={`rotate(${m} 100 100)`} className="hand m" />
      <line x1="100" y1="112" x2="100" y2="22" transform={`rotate(${s} 100 100)`} className="hand s" />
      <circle cx="100" cy="100" r="4" className="pin" />
    </svg>
  );
}

const MOCK_KEY = 'my-study.mock';
export function loadMock(): MockState | null {
  try {
    return JSON.parse(localStorage.getItem(MOCK_KEY) ?? 'null');
  } catch {
    return null;
  }
}
function saveMock(s: MockState | null) {
  try {
    if (s) localStorage.setItem(MOCK_KEY, JSON.stringify(s));
    else localStorage.removeItem(MOCK_KEY);
  } catch {
    /* 무시 */
  }
}

/** 모의고사 보기: 과목 고르기 → 시험 화면 */
export function MockExamPage() {
  const [state, setState] = useState<MockState | null>(loadMock);
  const [title, setTitle] = useState('과학탐구');
  const set = (s: MockState | null) => (setState(s), saveMock(s));
  if (state) return <MockScreen state={state} onRestart={() => set({ ...state, startedAt: Date.now() })} onQuit={() => set(null)} />;
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <button className="st-back" onClick={() => go('/time')} aria-label="공부 기록">
          ‹
        </button>
        <h2>모의고사 보기</h2>
      </div>
      <div className="st-seg sm">
        {['과학탐구', '사회탐구'].map((t) => (
          <button key={t} className={title === t ? 'on' : ''} onClick={() => setTitle(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="mk-list">
        {MOCK_SUBJECTS.map((s) => (
          <button key={s.key} className="mk-item" onClick={() => set({ key: s.key, title: s.key.startsWith('inquiry') ? title : undefined, startedAt: Date.now() })}>
            <b>{s.key.startsWith('inquiry') ? s.name.replace('탐구', title) : s.name}</b>
            <small>
              {hhmm(s.parts[0].from)} ~ {hhmm(s.parts[s.parts.length - 1].to)} · {s.parts[s.parts.length - 1].to - s.parts[0].from}분
            </small>
          </button>
        ))}
      </div>
      <ExamSoundPicker />
    </div>
  );
}

function ExamSoundPicker() {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    void examSoundUrl().then((u) => setHas(!!u));
  }, []);
  return (
    <label className="st-link mk-sound">
      {has ? '시험장 소리 바꾸기' : '시험장 소리 파일 넣기'}
      <input
        type="file"
        accept="audio/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          await saveSound('exam', f);
          setHas(true);
          toast('시험장 소리를 이 기기에 넣었어요');
        }}
      />
    </label>
  );
}

function MockScreen({ state, onRestart, onQuit }: { state: MockState; onRestart: () => void; onQuit: () => void }) {
  useImmersive();
  const now = useNow(250);
  const v = mockView(state, now);
  const [shown, poke] = useReveal();
  const [vol, setVol] = useState(0.6);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    let a: HTMLAudioElement | null = null;
    void examSoundUrl().then((u) => {
      if (!u) return;
      url = u;
      a = new Audio(u);
      a.loop = true;
      a.volume = vol;
      audio.current = a;
      void a.play().catch(() => {});
    });
    return () => {
      a?.pause();
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.startedAt]);
  useEffect(() => {
    if (v?.done) audio.current?.pause();
  }, [v?.done]);
  if (!v) return null;
  const s = v.subject;
  const name = state.title ? s.name.replace('탐구', state.title) : s.name;
  const total = s.parts[s.parts.length - 1].to - s.parts[0].from;
  return (
    <div className={`focus mock ${shown ? 'show' : ''}`} onPointerDown={poke}>
      <div className="focus-top">
        <span>{v.part.label.replace('탐구 영역', state.title ? `${state.title} 영역` : '탐구 영역')}</span>
        <small>
          {hhmm(s.parts[0].from)} ~ {hhmm(s.parts[s.parts.length - 1].to)}
        </small>
      </div>
      <div className="focus-main">
        <AnalogClock min={v.clockMin} />
      </div>
      <div className="focus-bottom">{v.done && <span>시험 끝</span>}</div>
      <div className="focus-ctl" onPointerDown={(e) => e.stopPropagation()}>
        {!v.done && (
          <div className="focus-noise">
            <span>시험장 소리</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={vol}
              onChange={(e) => {
                setVol(Number(e.target.value));
                if (audio.current) audio.current.volume = Number(e.target.value);
              }}
              aria-label="시험장 소리 크기"
            />
          </div>
        )}
        <div className="focus-btns">
          {v.done && !saved && (
            <button
              className="primary"
              onClick={() => {
                const sub = alive(getStudy().subjects).find((x) => x.name.includes(name.replace(/ \d과목|영역/g, '').slice(0, 2)));
                const end = Date.now();
                addSession({ subjectId: sub?.id, start: end - total * 60_000, end, minutes: total, date: new Date(end + 9 * 3_600_000).toISOString().slice(0, 10), kind: 'manual' });
                setSaved(true);
                toast(`${name} ${total}분을 공부 기록에 넣었어요`);
              }}
            >
              공부 기록에 넣기
            </button>
          )}
          {v.done && (
            <button
              onClick={() => {
                onQuit();
                go(`/exams/grades/self-${state.key}`);
              }}
            >
              점수 넣기
            </button>
          )}
          <button onClick={() => window.confirm('처음부터 다시 볼까요?') && onRestart()}>처음부터</button>
          <button onClick={() => (v.done || window.confirm('시험을 그만둘까요? 기록은 남지 않아요')) && onQuit()}>{v.done ? '닫기' : '그만두기'}</button>
        </div>
      </div>
    </div>
  );
}

/** 쉬는 시간 단어 퀴즈: 내 단어장에서 몇 개 뽑아 뜻 맞혀 보기 (누르면 뜻) */
export function BreakWords({ dark }: { dark?: boolean }) {
  const d = useStudy();
  const words = useWords();
  const [seed, setSeed] = useState(() => Math.random());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const pool = alive(words).filter((w) => d.wordLists[w.listId] && !d.wordLists[w.listId].deleted && w.term && w.meaning);
  if (pool.length < 3) return null;
  // 틀린 적 있는 단어를 먼저, 그다음은 섞어서
  const pick = pool
    .map((w, i) => {
      const r = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
      return { w, k: (w.wrong ? 0 : 1) + (r - Math.floor(r)) };
    })
    .sort((a, b) => a.k - b.k)
    .slice(0, 4)
    .map((x) => x.w);
  return (
    <div className={`bw ${dark ? 'dark' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
      {pick.map((w) => (
        <button key={w.id} className={`bw-card ${open.has(w.id) ? 'on' : ''}`} onClick={() => setOpen(new Set(open).add(w.id))}>
          <b>{w.term}</b>
          <span>{open.has(w.id) ? w.meaning : '뜻 보기'}</span>
        </button>
      ))}
      <button
        className="bw-more"
        onClick={() => {
          setSeed(Math.random());
          setOpen(new Set());
        }}
      >
        다른 단어
      </button>
    </div>
  );
}
