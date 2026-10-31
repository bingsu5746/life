// 게임 › 롤: 라이엇 ID 로 랭크 · 모스트 · 포지션 · 최근 경기 · 시간대별 승률 · 숙련도 · 한 해 결산 (op.gg 처럼)
import { useEffect, useMemo, useState } from 'react';
import { lolGames, lolProfile, type LolProfile } from '../auth/api';
import { LineChart } from '../study/charts';
import { setSettings, useStudy } from '../study/store';
import { Empty, Sheet, tap, toast } from '../study/ui';
import { byChampion, byHour, byPosition, byWeekday, champDetail, kda, POS, queueName, QUEUE_FILTER, streaks, summary, yearRecap, type LolGame, type QueueFilter } from './lolStats';

// ===== Data Dragon (챔피언 · 스펠 이름과 그림, 키 없음). 한 번 받으면 이 기기에 하루 기억 =====
interface Dd {
  v: string;
  champ: Record<number, { id: string; name: string }>;
  byId: Record<string, string>;
  spell: Record<number, string>;
}
let ddPromise: Promise<Dd> | null = null;
function loadDd(): Promise<Dd> {
  const KEY = 'my-study.lol.dd';
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { at: number; d: Dd } | null;
    if (c && Date.now() - c.at < 86_400_000) return Promise.resolve(c.d);
  } catch {
    /* 무시 */
  }
  ddPromise ??= (async () => {
    const base = 'https://ddragon.leagueoflegends.com';
    const v = ((await (await fetch(`${base}/api/versions.json`)).json()) as string[])[0];
    const ch = (await (await fetch(`${base}/cdn/${v}/data/ko_KR/champion.json`)).json()) as { data: Record<string, { key: string; id: string; name: string }> };
    const sp = (await (await fetch(`${base}/cdn/${v}/data/ko_KR/summoner.json`)).json()) as { data: Record<string, { key: string; id: string }> };
    const d: Dd = { v, champ: {}, byId: {}, spell: {} };
    for (const c of Object.values(ch.data)) {
      d.champ[Number(c.key)] = { id: c.id, name: c.name };
      d.byId[c.id] = c.name;
    }
    for (const s of Object.values(sp.data)) d.spell[Number(s.key)] = s.id;
    try {
      localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), d }));
    } catch {
      /* 무시 */
    }
    return d;
  })();
  return ddPromise;
}
function useDd() {
  const [d, setD] = useState<Dd | null>(null);
  useEffect(() => {
    loadDd()
      .then(setD)
      .catch(() => {});
  }, []);
  return d;
}
const IMG = 'https://ddragon.leagueoflegends.com/cdn';
const champImg = (dd: Dd, id: string) => `${IMG}/${dd.v}/img/champion/${id}.png`;

const TIER: Record<string, string> = { IRON: '아이언', BRONZE: '브론즈', SILVER: '실버', GOLD: '골드', PLATINUM: '플래티넘', EMERALD: '에메랄드', DIAMOND: '다이아몬드', MASTER: '마스터', GRANDMASTER: '그랜드마스터', CHALLENGER: '챌린저' };
const pct = (x: number) => `${Math.round(x)}%`;
const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`;
};

export function LolPage() {
  const d = useStudy();
  const id = d.settings.lolId ?? '';
  const [input, setInput] = useState('');
  const [prof, setProf] = useState<LolProfile | null>(null);
  const [games, setGames] = useState<LolGame[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [end, setEnd] = useState(false);
  const [q, setQ] = useState<QueueFilter>('all');
  const [limit, setLimit] = useState(20);
  const [champ, setChamp] = useState<string | null>(null);
  const dd = useDd();
  useEffect(() => {
    if (!id) return;
    let live = true;
    setErr('');
    setProf(null);
    setGames(null);
    lolProfile(id)
      .then(async (p) => {
        if (!live) return;
        setProf(p);
        setBusy('경기를 받는 중… (처음엔 30판까지, 10~20초)');
        const r = await lolGames(p.puuid);
        if (!live) return;
        setGames(r.games);
        setEnd(r.end);
        if (r.warn) toast(r.warn);
      })
      .catch((e) => live && setErr(e instanceof Error ? e.message : '롤 정보를 받지 못했어요'))
      .finally(() => live && setBusy(''));
    return () => {
      live = false;
    };
  }, [id]);
  const older = async () => {
    if (!prof || busy) return;
    setBusy('예전 경기를 더 받는 중… (40판까지)');
    try {
      const r = await lolGames(prof.puuid, true);
      setGames(r.games);
      setEnd(r.end);
      if (r.warn) toast(r.warn);
    } catch (e) {
      toast(e instanceof Error ? e.message : '받지 못했어요');
    } finally {
      setBusy('');
    }
  };
  const list = useMemo(() => (games ?? []).filter((g) => QUEUE_FILTER[q](g.q)), [games, q]);

  if (!id)
    return (
      <div className="st-page">
        <div className="st-page-head">
          <h2>롤</h2>
        </div>
        <Empty title="라이엇 ID 를 넣어 주세요">
          <p>「이름#태그」를 넣으면 랭크 · 모스트 챔피언 · 최근 경기 · 시간대별 승률 · 한 해 결산을 보여 드려요.</p>
          <form
            className="st-inline"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^.{2,16}#[^#\s]{2,5}$/.test(input.trim())) return toast('「이름#태그」 처럼 넣어 주세요 (예: Hide on bush#KR1)');
              setSettings({ lolId: input.trim() });
            }}
          >
            <input className="st-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="이름#태그" aria-label="라이엇 ID" />
            <button className="btn btn-primary">저장</button>
          </form>
        </Empty>
      </div>
    );

  const s = summary(list);
  const champs = byChampion(list);
  const st = streaks(list);
  const recent = [...list].sort((a, b) => b.at - a.at);
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>롤</h2>
        <button className="st-link" onClick={() => confirm('라이엇 ID 를 바꿀까요?') && setSettings({ lolId: undefined })}>
          ID 바꾸기
        </button>
      </div>
      {err && <p className="st-muted">{err}</p>}
      {!prof && !err && <p className="st-muted">불러오는 중…</p>}
      {prof && (
        <section className="st-card lol-head">
          {dd && <img className="lol-icon" src={`${IMG}/${dd.v}/img/profileicon/${prof.icon}.png`} alt="" />}
          <div>
            <b className="lol-name">
              {prof.gameName}
              <small className="st-muted">#{prof.tagLine}</small>
            </b>
            <small className="st-muted">레벨 {prof.level}</small>
          </div>
          <div className="lol-ranks">
            {['RANKED_SOLO_5x5', 'RANKED_FLEX_SR'].map((qt) => {
              const r = prof.ranks.find((x) => x.queue === qt);
              return (
                <div key={qt} className={`lol-rank t-${(r?.tier ?? 'none').toLowerCase()}`}>
                  <small>{qt === 'RANKED_SOLO_5x5' ? '솔로랭크' : '자유랭크'}</small>
                  {r ? (
                    <>
                      <b>
                        {TIER[r.tier] ?? r.tier} {['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(r.tier) ? '' : r.rank}
                      </b>
                      <span>{r.lp} LP</span>
                      <small>
                        {r.wins}승 {r.losses}패 · {pct((r.wins / Math.max(1, r.wins + r.losses)) * 100)}
                      </small>
                    </>
                  ) : (
                    <b className="st-muted">배치 전</b>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {busy && <p className="st-muted">{busy}</p>}
      {games && (
        <>
          <div className="st-seg" role="group" aria-label="게임 종류">
            {(
              [
                ['all', '전체'],
                ['solo', '솔로랭크'],
                ['flex', '자유랭크'],
                ['normal', '일반'],
                ['aram', '칼바람'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={q === k ? 'on' : ''} onClick={() => setQ(k)}>
                {label}
              </button>
            ))}
          </div>
          {!list.length ? (
            <p className="st-muted">이 종류의 경기가 아직 없어요.</p>
          ) : (
            <>
              <section className="st-card">
                <h3 className="st-h">
                  최근 {s.games}판 · {s.wins}승 {s.losses}패
                </h3>
                <div className="lol-sum">
                  <div className="lol-donut" style={{ ['--p' as string]: `${s.winRate}%` }}>
                    <b>{pct(s.winRate)}</b>
                  </div>
                  <div>
                    <b className="lol-kda">
                      {f1(s.k)} / <span className="bad">{f1(s.d)}</span> / {f1(s.a)}
                    </b>
                    <small>
                      KDA <b className={s.kda >= 4 ? 'lol-good' : ''}>{s.kda.toFixed(2)}</b> · 킬 관여 {pct(s.kp)}
                    </small>
                    <small className="st-muted">
                      {st.now >= 2 ? `지금 ${st.now}${st.nowWin ? '연승 🔥' : '연패 🧊'} · ` : ''}최고 {st.bestWin}연승 · 최다 {st.bestLose}연패
                    </small>
                  </div>
                </div>
                <div className="nba-avg">
                  {[
                    ['분당 CS', f1(s.csMin)],
                    ['분당 딜', Math.round(s.dmgMin).toLocaleString('ko-KR')],
                    ['평균 딜', Math.round(s.dmg).toLocaleString('ko-KR')],
                    ['분당 골드', Math.round(s.goldMin).toLocaleString('ko-KR')],
                    ['시야 점수', f1(s.vision)],
                    ['평균 시간', `${Math.round(s.minutes / Math.max(1, s.games))}분`],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <small>{k}</small>
                      <b>{v}</b>
                    </div>
                  ))}
                </div>
                {recent.length >= 5 && (
                  <LineChart
                    label="최근 경기 KDA (오른쪽이 최근)"
                    height={130}
                    points={recent
                      .slice(0, 20)
                      .reverse()
                      .map((g, i) => ({ label: String(i + 1), title: `${dd?.byId[g.champ] ?? g.champ} ${g.k}/${g.d}/${g.a} ${g.win ? '승' : '패'}`, y: Math.round(kda(g.k, g.d, g.a) * 100) / 100 }))}
                    format={(x) => x.toFixed(1)}
                  />
                )}
              </section>

              <section className="st-card">
                <h3 className="st-h">모스트 챔피언</h3>
                <div className="lol-champs">
                  {champs.slice(0, 10).map((c) => (
                    <div key={c.champ} className="lol-champ st-tap" {...tap(() => setChamp(c.champ))}>
                      {dd && <img src={champImg(dd, c.champ)} alt="" loading="lazy" />}
                      <div>
                        <b>{dd?.byId[c.champ] ?? c.champ}</b>
                        <small className="st-muted">
                          CS {f1(c.csMin)}/분 · 딜 {Math.round(c.dmg).toLocaleString('ko-KR')}
                        </small>
                      </div>
                      <div className="lol-champ-r">
                        <b className={c.kda >= 4 ? 'lol-good' : ''}>{c.kda.toFixed(2)} KDA</b>
                        <small>
                          {f1(c.k)}/{f1(c.d)}/{f1(c.a)}
                        </small>
                      </div>
                      <div className="lol-champ-r">
                        <b className={c.winRate >= 60 ? 'lol-good' : c.winRate < 45 ? 'bad' : ''}>{pct(c.winRate)}</b>
                        <small>{c.games}판</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="st-card">
                <h3 className="st-h">포지션</h3>
                <div className="sh-dist">
                  {byPosition(list).map((p) => (
                    <div key={p.pos} className="sh-dist-row">
                      <span>{POS[p.pos]}</span>
                      <div className="sh-bar">
                        <i style={{ width: `${(p.games / Math.max(1, s.games)) * 100}%` }} />
                      </div>
                      <small>
                        {p.games}판 ({pct((p.games / Math.max(1, s.games)) * 100)}) · 승률 {pct(p.winRate)} · KDA {p.kda.toFixed(2)}
                      </small>
                    </div>
                  ))}
                </div>
                <h3 className="st-h">언제 잘하나</h3>
                <div className="sh-dist">
                  {[...byHour(list), ...byWeekday(list).map((x) => ({ ...x, label: `${x.label}요일` }))]
                    .filter((x) => x.games)
                    .map((x) => (
                      <div key={x.label} className="sh-dist-row">
                        <span>{x.label}</span>
                        <div className="sh-bar">
                          <i style={{ width: `${x.winRate}%` }} className={x.winRate >= 55 ? 'good' : x.winRate < 45 ? 'low' : ''} />
                        </div>
                        <small>
                          승률 {pct(x.winRate)} · {x.games}판
                        </small>
                      </div>
                    ))}
                </div>
              </section>

              <section className="st-card">
                <h3 className="st-h">최근 경기</h3>
                <div className="lol-games">
                  {recent.slice(0, limit).map((g) => (
                    <GameRow key={g.id} g={g} dd={dd} />
                  ))}
                </div>
                {recent.length > limit && (
                  <button className="st-link" onClick={() => setLimit(limit + 20)}>
                    더 보기
                  </button>
                )}
              </section>
            </>
          )}

          {prof && dd && prof.mastery.length > 0 && (
            <section className="st-card">
              <h3 className="st-h">챔피언 숙련도</h3>
              <div className="lol-mastery">
                {prof.mastery.map((m) => {
                  const c = dd.champ[m.champ];
                  return c ? (
                    <div key={m.champ}>
                      <img src={champImg(dd, c.id)} alt="" loading="lazy" />
                      <b>{c.name}</b>
                      <small>
                        Lv.{m.level} · {m.points.toLocaleString('ko-KR')}점
                      </small>
                    </div>
                  ) : null;
                })}
              </div>
            </section>
          )}

          <YearCard games={games} dd={dd} end={end} busy={!!busy} onOlder={() => void older()} />
          {champ && <ChampSheet champ={champ} games={list.filter((g) => g.champ === champ)} dd={dd} onClose={() => setChamp(null)} />}
        </>
      )}
    </div>
  );
}

function GameRow({ g, dd }: { g: LolGame; dd: Dd | null }) {
  const r = kda(g.k, g.d, g.a);
  return (
    <div className={`lol-game ${g.remake ? 'remake' : g.win ? 'win' : 'lose'}`}>
      <div className="lol-game-meta">
        <b>{queueName(g.q)}</b>
        <small>{ago(g.at)}</small>
        <small>{g.remake ? '다시하기' : g.win ? '승리' : '패배'}</small>
        <small>
          {Math.floor(g.dur / 60)}분 {g.dur % 60}초
        </small>
      </div>
      <div className="lol-game-champ">
        {dd && <img src={champImg(dd, g.champ)} alt={dd.byId[g.champ] ?? g.champ} loading="lazy" />}
        <i>{g.lvl}</i>
        <span className="lol-spells">{dd && g.spells.map((sp, i) => (dd.spell[sp] ? <img key={i} src={`${IMG}/${dd.v}/img/spell/${dd.spell[sp]}.png`} alt="" loading="lazy" /> : null))}</span>
      </div>
      <div className="lol-game-kda">
        <b>
          {g.k} / <span className="bad">{g.d}</span> / {g.a}
        </b>
        <small className={r >= 4 ? 'lol-good' : ''}>{r.toFixed(2)} KDA</small>
        {g.multi >= 2 && <small className="lol-multi">{['', '', '더블킬', '트리플킬', '쿼드라킬', '펜타킬'][Math.min(5, g.multi)]}</small>}
      </div>
      <div className="lol-game-more">
        <small>킬관여 {pct(g.kp * 100)}</small>
        <small>
          CS {g.cs} ({f1(g.cs / Math.max(1, g.dur / 60))})
        </small>
        <small>
          딜 {g.dmg.toLocaleString('ko-KR')}
          {g.dmgRank === 1 ? ' 🥇' : ''}
        </small>
        <small>시야 {g.vision}</small>
      </div>
      <div className="lol-items">{dd && g.items.map((it, i) => (it ? <img key={i} src={`${IMG}/${dd.v}/img/item/${it}.png`} alt="" loading="lazy" /> : <span key={i} />))}</div>
    </div>
  );
}

/** 한 해 결산 (서버에 모은 경기로. 더 예전 경기를 받을수록 정확해짐) */
function YearCard({ games, dd, end, busy, onOlder }: { games: LolGame[]; dd: Dd | null; end: boolean; busy: boolean; onOlder: () => void }) {
  const now = new Date(Date.now() + 9 * 3600_000).getUTCFullYear();
  const [year, setYear] = useState(now);
  const y = yearRecap(games, year);
  const oldest = games.length ? Math.min(...games.map((g) => g.at)) : 0;
  const covered = oldest && new Date(oldest + 9 * 3600_000).getUTCFullYear() < year;
  const name = (c: string) => dd?.byId[c] ?? c;
  return (
    <section className="lol-year">
      <div className="sh-head">
        <h3>🎮 {year} 롤 결산</h3>
        <select className="st-input xs" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="연도">
          {[now, now - 1].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      {!y.games ? (
        <p>이 해 경기가 아직 없어요.</p>
      ) : (
        <>
          <div className="lol-year-big">
            <div>
              <small>한 판 수</small>
              <b>{y.games.toLocaleString('ko-KR')}판</b>
            </div>
            <div>
              <small>한 시간</small>
              <b>{Math.round(y.hours).toLocaleString('ko-KR')}시간</b>
            </div>
            <div>
              <small>승률</small>
              <b>{pct(y.winRate)}</b>
            </div>
            <div>
              <small>킬 / 데스 / 어시</small>
              <b>
                {y.kills.toLocaleString('ko-KR')} / {y.deaths.toLocaleString('ko-KR')} / {y.assists.toLocaleString('ko-KR')}
              </b>
            </div>
          </div>
          <ul className="lol-year-list">
            {y.most && (
              <li>
                {dd && <img src={champImg(dd, y.most.champ)} alt="" />} 가장 많이 한 챔피언 <b>{name(y.most.champ)}</b> {y.most.games}판 · 승률 {pct(y.most.winRate)}
              </li>
            )}
            {y.bestChamp && y.bestChamp.champ !== y.most?.champ && (
              <li>
                {dd && <img src={champImg(dd, y.bestChamp.champ)} alt="" />} 가장 잘한 챔피언 (5판 이상) <b>{name(y.bestChamp.champ)}</b> 승률 {pct(y.bestChamp.winRate)} · KDA {y.bestChamp.kda.toFixed(2)}
              </li>
            )}
            {y.pos && (
              <li>
                주 포지션 <b>{POS[y.pos]}</b>
              </li>
            )}
            <li>
              챔피언 <b>{y.champs}</b>개를 했어요
            </li>
            {y.pentas > 0 && (
              <li>
                펜타킬 <b>{y.pentas}</b>번 🎉
              </li>
            )}
            {y.quadras > 0 && (
              <li>
                쿼드라킬 이상 <b>{y.quadras}</b>판
              </li>
            )}
            {y.firstBloods > 0 && (
              <li>
                퍼스트 블러드 <b>{y.firstBloods}</b>번
              </li>
            )}
            {y.best && (
              <li>
                최고의 판: <b>{name(y.best.champ)}</b> {y.best.k}/{y.best.d}/{y.best.a} ({new Date(y.best.at).toLocaleDateString('ko-KR')})
              </li>
            )}
            {y.longest && (
              <li>
                가장 긴 판: {Math.round(y.longest.dur / 60)}분 ({name(y.longest.champ)}, {y.longest.win ? '승' : '패'})
              </li>
            )}
          </ul>
          <div className="lol-months">
            {y.months.map((m) => (
              <div key={m.month} title={`${m.month}월 ${m.games}판 · 승률 ${pct(m.winRate)}`}>
                <i style={{ height: `${Math.min(100, (m.games / Math.max(1, ...y.months.map((x) => x.games))) * 100)}%` }} />
                <small>{m.month}</small>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="lol-year-note">
        지금까지 모은 경기 {games.length}판{oldest ? ` (${new Date(oldest).toLocaleDateString('ko-KR')}부터)` : ''}. {end ? 'Riot 이 주는 가장 예전 경기까지 받았어요.' : covered ? '' : '더 예전 경기를 받으면 결산이 더 정확해져요.'}
      </p>
      {!end && !covered && (
        <button className="btn btn-sm" disabled={busy} onClick={onOlder}>
          {busy ? '받는 중…' : '예전 경기 40판 더 받기'}
        </button>
      )}
    </section>
  );
}

/** 챔피언 하나: 판별 KDA 흐름 · 자주 산 아이템 · 스펠 · 포지션 · 최고의 판 · 그 챔피언 경기 */
function ChampSheet({ champ, games, dd, onClose }: { champ: string; games: LolGame[]; dd: Dd | null; onClose: () => void }) {
  const c = champDetail(games);
  const name = dd?.byId[champ] ?? champ;
  const recent = [...games].sort((a, b) => b.at - a.at);
  return (
    <Sheet title={name} onClose={onClose}>
      <div className="lol-sum">
        {dd && <img className="lol-icon" src={champImg(dd, champ)} alt="" />}
        <div>
          <b className="lol-kda">
            {c.s.games}판 · 승률 {pct(c.s.winRate)}
          </b>
          <small>
            {f1(c.s.k)} / {f1(c.s.d)} / {f1(c.s.a)} · KDA <b className={c.s.kda >= 4 ? 'lol-good' : ''}>{c.s.kda.toFixed(2)}</b>
          </small>
          <small className="st-muted">
            분당 CS {f1(c.s.csMin)} · 분당 딜 {Math.round(c.s.dmgMin).toLocaleString('ko-KR')} · 킬 관여 {pct(c.s.kp)}
          </small>
        </div>
      </div>
      {recent.length >= 3 && (
        <LineChart
          label="판별 KDA (오른쪽이 최근)"
          height={120}
          points={recent
            .slice(0, 20)
            .reverse()
            .map((g, i) => ({ label: String(i + 1), title: `${g.k}/${g.d}/${g.a} ${g.win ? '승' : '패'}`, y: Math.round(kda(g.k, g.d, g.a) * 100) / 100 }))}
          format={(x) => x.toFixed(1)}
        />
      )}
      {dd && c.items.length > 0 && (
        <>
          <h4 className="ta-h">자주 산 아이템</h4>
          <div className="lol-build">
            {c.items.map((x) => (
              <span key={x.id}>
                <img src={`${IMG}/${dd.v}/img/item/${x.id}.png`} alt="" loading="lazy" />
                <small>{pct((x.n / c.s.games) * 100)}</small>
              </span>
            ))}
          </div>
        </>
      )}
      {dd && c.spells.length > 0 && (
        <>
          <h4 className="ta-h">스펠</h4>
          <div className="lol-build">
            {c.spells.map((x) => (
              <span key={x.key}>
                {x.ids.map((id) => (dd.spell[id] ? <img key={id} src={`${IMG}/${dd.v}/img/spell/${dd.spell[id]}.png`} alt="" loading="lazy" /> : null))}
                <small>
                  {x.n}판 · 승률 {pct(x.winRate)}
                </small>
              </span>
            ))}
          </div>
        </>
      )}
      {c.pos.length > 0 && <p className="st-muted sm">포지션: {c.pos.map((p) => `${POS[p.pos] ?? p.pos} ${p.games}판`).join(' · ')}</p>}
      {c.best && (
        <p className="sm">
          최고의 판:{' '}
          <b>
            {c.best.k}/{c.best.d}/{c.best.a}
          </b>{' '}
          ({new Date(c.best.at).toLocaleDateString('ko-KR')}, {c.best.win ? '승' : '패'})
        </p>
      )}
      <div className="lol-games">
        {recent.slice(0, 10).map((g) => (
          <GameRow key={g.id} g={g} dd={dd} />
        ))}
      </div>
    </Sheet>
  );
}
