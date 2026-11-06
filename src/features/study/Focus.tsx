// 집중 화면: 공부 타이머 · 모의고사 보기. 지금 시각은 보여 주지 않는다.
import { useEffect, useRef, useState } from 'react';
import { NOISE_NAME, playNoise, setNoiseVolume, stopNoise, type NoiseKind } from '../../lib/noise';
import { embedUrl, parseYoutube, type YtRef } from '../../lib/youtube';
import { examSoundUrl, loadSound, saveSound } from '../../lib/soundStore';
import { addSession } from './actions';
import { alive } from './model';
import { encodeQ, hhmm, MOCK_SUBJECTS, mockMinutes, mockSection, mockView, QUESTION_COUNT, qSeconds, slowest, startPerQ, switchQ, type MockState } from './mockExam';
import { getStudy, setSettings, useStudy, useWords } from './store';
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
  const [yt, setYt] = useState<YtRef | null>(null);
  const [ytOpen, setYtOpen] = useState(false);
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
              <button aria-label="집중 화면 닫기 (타이머는 계속)" onClick={onExit}>
                <svg viewBox="0 0 24 24" aria-hidden className="line">
                  {/* 축소(안쪽으로 모이는 화살표): 전체 화면에서 나가기 */}
                  <path d="M4 10h6V4M20 14h-6v6M4 4l6 6M20 20l-6-6" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
      {yt && (
        <div className="fy-player" onPointerDown={(e) => e.stopPropagation()}>
          <iframe src={embedUrl(yt)} title="유튜브" allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />
          <button aria-label="유튜브 끄기" onClick={() => setYt(null)}>
            ✕
          </button>
        </div>
      )}
      {timer.kind === 'pomo' && timer.phase !== 'work' && <Stretch />}
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
          <button className={yt || ytOpen ? 'on' : ''} onClick={() => setYtOpen(!ytOpen)}>
            유튜브
          </button>
        </div>
        {ytOpen && <YtPicker onPick={(r) => (stopNoise(), setNoise(''), setYt(r), setYtOpen(false))} />}
        <div className="focus-btns">
          {timer.kind === 'pomo' && (v.finished || timer.phase !== 'work') && (
            <button className="primary" onClick={() => (primeAudio(), update(nextPhase(timer, Date.now(), pomo).state))}>
              {timer.phase === 'work' ? '휴식 시작' : '다음 공부'}
            </button>
          )}
          {v.finished && <button onClick={onStop}>끝내고 기록</button>}
        </div>
      </div>
    </div>
  );
}

/** 집중 화면 유튜브: 링크 넣기 · 넣어 둔 것 고르기 (영상 소리를 삽입 플레이어로 튼다) */
function YtPicker({ onPick }: { onPick: (r: YtRef) => void }) {
  const d = useStudy();
  const saved = d.settings.focusVideos ?? [];
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const r = parseYoutube(link);
  return (
    <div className="fy-pick">
      {saved.length > 0 && (
        <div className="focus-noise">
          {saved.map((v) => (
            <span key={v.id} className="fy-saved">
              <button onClick={() => onPick(v)}>{v.name}</button>
              <button aria-label={`${v.name} 지우기`} onClick={() => setSettings({ focusVideos: saved.filter((x) => x.id !== v.id) })}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="fy-add">
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="유튜브 링크 붙여 넣기" aria-label="유튜브 링크" />
        {r && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 비 오는 카페)" aria-label="이름" />}
        <button
          disabled={!r}
          onClick={() => {
            if (!r) return;
            if (!saved.some((x) => x.id === r.id)) setSettings({ focusVideos: [...saved, { ...r, name: name.trim().slice(0, 30) || (r.kind === 'list' ? '재생목록' : '유튜브') }].slice(-10) });
            setLink('');
            setName('');
            onPick(r);
          }}
        >
          {link && !r ? '링크를 못 읽었어요' : '넣고 틀기'}
        </button>
      </div>
      <small>영상은 유튜브 플레이어로 틀어요 (음원을 따로 내려받지 않아요). 화면을 끄면 멈출 수 있어요.</small>
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
  // 문항별 시간 재기 (켜 두면 시험 화면에 번호판이 나온다)
  const [perQOn, setPerQOn] = useState(() => {
    try {
      return localStorage.getItem('my-study.mock.perq') === '1';
    } catch {
      return false;
    }
  });
  const togglePerQ = (on: boolean) => {
    setPerQOn(on);
    try {
      localStorage.setItem('my-study.mock.perq', on ? '1' : '0');
    } catch {
      /* 무시 */
    }
  };
  const set = (s: MockState | null) => (setState(s), saveMock(s));
  if (state)
    return (
      <MockScreen
        state={state}
        onUpdate={set}
        onRestart={() => set({ ...state, startedAt: Date.now(), finishedAt: undefined, perQ: state.perQ ? startPerQ(Date.now()) : undefined })}
        onFinish={() => set({ ...state, finishedAt: Date.now() })}
        onQuit={() => set(null)}
      />
    );
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
          <button key={s.key} className="mk-item" onClick={() => set({ key: s.key, title: s.key.startsWith('inquiry') ? title : undefined, startedAt: Date.now(), perQ: perQOn ? startPerQ(Date.now()) : undefined })}>
            <b>{s.key.startsWith('inquiry') ? s.name.replace('탐구', title) : s.name}</b>
            <small>
              {hhmm(s.parts[0].from)} ~ {hhmm(s.parts[s.parts.length - 1].to)} · {s.parts[s.parts.length - 1].to - s.parts[0].from}분
            </small>
          </button>
        ))}
      </div>
      <label className="st-toggle">
        <input type="checkbox" checked={perQOn} onChange={(e) => togglePerQ(e.target.checked)} /> 문항별 시간 재기 (문제를 옮길 때마다 번호를 눌러요. 끝나면 오래 걸린 번호를 보여 줘요)
      </label>
      <ExamSoundPicker />
      <ListeningPicker />
    </div>
  );
}

/** 영어 듣기 음원: 이 기기에 넣어 두면 영어 영역을 시작할 때 바로 틀어 준다 (수능처럼 시험 시작과 함께 듣기) */
function ListeningPicker() {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    try {
      setName(localStorage.getItem('my-study.listening.name'));
    } catch {
      /* 무시 */
    }
  }, []);
  return (
    <div className="mk-listen">
      <label className="st-link mk-sound">
        {name ? '영어 듣기 파일 바꾸기' : '영어 듣기 파일 넣기'}
        <input
          type="file"
          accept="audio/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            await saveSound('listening', f);
            try {
              localStorage.setItem('my-study.listening.name', f.name.slice(0, 80));
            } catch {
              /* 무시 */
            }
            setName(f.name);
            toast('영어 듣기 파일을 이 기기에 넣었어요 · 영어 영역을 시작하면 바로 틀어요');
          }}
        />
      </label>
      {name && <small className="st-muted">지금 파일: {name} (영어 영역 시작과 함께 재생)</small>}
    </div>
  );
}

/** 문항 번호 이름 (탐구 2과목은 21번부터 제2선택 1번) */
const qName = (key: string, q: number) => (key === 'inquiry2' && q > 20 ? `②${q - 20}` : String(q));
const secText = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`);

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

function MockScreen({ state, onUpdate, onRestart, onFinish, onQuit }: { state: MockState; onUpdate: (s: MockState) => void; onRestart: () => void; onFinish: () => void; onQuit: () => void }) {
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
  // 영어 듣기: 영어 영역이면 시작과 함께 한 번 튼다 (막히면 「듣기 틀기」 단추)
  const listen = useRef<HTMLAudioElement | null>(null);
  const [listenState, setListenState] = useState<'none' | 'playing' | 'blocked' | 'ended' | 'paused'>('none');
  useEffect(() => {
    if (state.key !== 'english') return;
    let url: string | null = null;
    let a: HTMLAudioElement | null = null;
    let gone = false;
    void loadSound('listening')
      .then((b) => {
        if (!b || gone) return;
        url = URL.createObjectURL(b);
        a = new Audio(url);
        listen.current = a;
        a.onended = () => setListenState('ended');
        // 시험을 시작한 지 시간이 지났으면(다시 연 화면) 그만큼 넘겨서
        const off = (Date.now() - state.startedAt) / 1000;
        a.onloadedmetadata = () => {
          if (a && off > 2) {
            if (off >= a.duration) return setListenState('ended');
            a.currentTime = off;
          }
        };
        void a.play().then(
          () => setListenState('playing'),
          () => setListenState('blocked'),
        );
      })
      .catch(() => {});
    return () => {
      gone = true;
      a?.pause();
      if (url) URL.revokeObjectURL(url);
      listen.current = null;
      setListenState('none');
    };
  }, [state.key, state.startedAt]);
  // 듣기 동안은 시험장 소리를 줄인다
  useEffect(() => {
    if (audio.current) audio.current.volume = listenState === 'playing' ? Math.min(vol, 0.15) : vol;
  }, [listenState, vol]);
  useEffect(() => {
    if (v?.done) {
      audio.current?.pause();
      listen.current?.pause();
    }
  }, [v?.done]);
  if (!v) return null;
  const pq = state.perQ;
  const nQ = QUESTION_COUNT[state.key] ?? 20;
  const qEnd = state.finishedAt ?? Math.min(now, state.startedAt + mockMinutes(state) * 60_000);
  const qSec = pq ? qSeconds(pq, qEnd) : null;
  const goQ = (q: number) => pq && !v.done && onUpdate({ ...state, perQ: switchQ(pq, Math.max(1, Math.min(nQ, q)), Date.now()) });
  const s = v.subject;
  const name = state.title ? s.name.replace('탐구', state.title) : s.name;
  // 실제로 푼 시간 (시간 전에 다 풀었으면 그때까지)
  const total = mockMinutes(state);
  const full = s.parts[s.parts.length - 1].to - s.parts[0].from;
  return (
    <div className={`focus mock ${pq && !v.done ? 'perq' : ''} ${shown ? 'show' : ''}`} onPointerDown={poke}>
      <div className="focus-top">
        <span>{v.part.label.replace('탐구 영역', state.title ? `${state.title} 영역` : '탐구 영역')}</span>
        <small>
          {hhmm(s.parts[0].from)} ~ {hhmm(s.parts[s.parts.length - 1].to)}
        </small>
      </div>
      <div className="focus-main">
        <AnalogClock min={v.clockMin} />
      </div>
      {pq && !v.done && (
        <div className="mk-q" onPointerDown={(e) => e.stopPropagation()}>
          <div className="mk-q-now">
            <button onClick={() => goQ(pq.cur - 1)} aria-label="앞 문제" disabled={pq.cur <= 1}>
              ‹
            </button>
            <span>
              <b>{qName(state.key, pq.cur)}번</b>
              <small>{secText(qSec?.[pq.cur] ?? 0)}</small>
            </span>
            <button className="next" onClick={() => goQ(pq.cur + 1)} aria-label="다음 문제" disabled={pq.cur >= nQ}>
              다음 ›
            </button>
          </div>
          <div className="mk-q-grid" role="group" aria-label="문제 번호">
            {Array.from({ length: nQ }, (_, i) => i + 1).map((q) => (
              <button key={q} className={`${q === pq.cur ? 'on' : ''} ${qSec?.[q] ? 'seen' : ''}`} onClick={() => goQ(q)} aria-pressed={q === pq.cur}>
                {qName(state.key, q)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="focus-bottom">
        {v.done && <span>{state.finishedAt ? `다 풀었어요 · ${total}분 걸림 (${full}분 중 ${full - total}분 남김)` : '시험 끝'}</span>}
        {v.done && qSec && Object.keys(qSec).length > 0 && (
          <span className="mk-slow">
            오래 걸린 번호: {slowest(qSec).map((x) => `${qName(state.key, x.q)}번 ${secText(x.sec)}`).join(' · ')}
          </span>
        )}
      </div>
      <div className="focus-ctl" onPointerDown={(e) => e.stopPropagation()}>
        {!v.done && listenState !== 'none' && (
          <div className="focus-noise">
            <span>영어 듣기 {listenState === 'playing' ? '나오는 중' : listenState === 'ended' ? '끝' : listenState === 'blocked' ? '(눌러서 틀기)' : '멈춤'}</span>
            {listenState !== 'ended' && (
              <button
                onClick={() => {
                  const a = listen.current;
                  if (!a) return;
                  if (listenState === 'playing') {
                    a.pause();
                    setListenState('paused');
                  } else
                    void a.play().then(
                      () => setListenState('playing'),
                      () => setListenState('blocked'),
                    );
                }}
              >
                {listenState === 'playing' ? '멈춤' : '듣기 틀기'}
              </button>
            )}
          </div>
        )}
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
                const end = state.finishedAt ?? Date.now();
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
              className={saved ? 'primary' : ''}
              onClick={() => {
                onQuit();
                // 풀이 기록: 영역 · 걸린 시간을 채워서 (점수 · 등급 · 틀린 번호는 거기서)
                go(`/review/papers-new?section=${encodeURIComponent(mockSection(state))}&min=${total}&rec=${saved ? 0 : 1}${qSec && Object.keys(qSec).length ? `&qt=${encodeQ(qSec)}` : ''}`);
              }}
            >
              점수 · 틀린 번호 넣기
            </button>
          )}
          {v.done && (
            <button
              onClick={() => {
                onQuit();
                go(`/exams/grades/self-${state.key}`);
              }}
            >
              성적표에 넣기
            </button>
          )}
          {!v.done && (
            <button className="primary" onClick={() => window.confirm('다 풀었나요? 지금까지 걸린 시간을 기록해요') && onFinish()}>
              다 풀었어요
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

/** 쉬는 시간 스트레칭: 30초짜리 하나씩 (쉬는 시간마다 바뀜). 아프면 멈추기 */
const STRETCHES: [string, string][] = [
  ['목 옆으로 늘이기', '오른손으로 머리를 오른쪽으로 살짝 당겨 15초, 반대도 15초'],
  ['어깨 으쓱', '어깨를 귀까지 올렸다가 툭 내리기 10번'],
  ['어깨 뒤로 돌리기', '어깨를 크게 뒤로 10번 돌리기'],
  ['가슴 펴기', '두 손을 등 뒤로 깍지 끼고 가슴을 펴서 15초'],
  ['손목 풀기', '팔을 앞으로 뻗고 손가락을 몸 쪽으로 당겨 10초씩, 양손'],
  ['고개 숙이기', '턱을 가슴 쪽으로 당겨 목 뒤를 늘이며 15초'],
  ['옆구리 늘이기', '두 팔을 위로 뻗고 왼쪽 · 오른쪽으로 10초씩 기울이기'],
  ['일어나서 걷기', '자리에서 일어나 30초 걷고 물 한 모금'],
  ['눈 쉬기', '창밖 먼 곳을 20초 보기 (가까운 화면에서 눈 쉬기)'],
  ['허리 비틀기', '앉아서 몸통을 왼쪽 · 오른쪽으로 천천히 15초씩 돌리기'],
];
function Stretch() {
  const [i, setI] = useState(() => Math.floor(Date.now() / 600_000) % STRETCHES.length);
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (left === null || left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const [name, how] = STRETCHES[i];
  return (
    <div className="fs-stretch" onPointerDown={(e) => e.stopPropagation()}>
      <small>쉬는 시간 스트레칭</small>
      <b>🤸 {name}</b>
      <span>{how}</span>
      <div className="fs-stretch-btns">
        <button onClick={() => setLeft(30)}>{left === null ? '30초 시작' : left > 0 ? `${left}초` : '끝! 잘했어요'}</button>
        <button onClick={() => (setI((i + 1) % STRETCHES.length), setLeft(null))}>다른 것</button>
      </div>
      <small className="fs-stretch-note">아프면 바로 멈춰요.</small>
    </div>
  );
}
