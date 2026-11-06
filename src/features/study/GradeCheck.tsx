// 시험지 채점: 정답을 넣고 내 답을 고르면 맞은 수 · 점수 · 틀린 번호. 결과는 기출·모의고사 풀이로 저장 (틀린 번호는 오답 노트로)
import { useEffect, useState } from 'react';
import { grade, parseAnswers, parsePoints } from './gradeCheck';
import { Field, go } from './ui';

const DRAFT = 'my-study.gradecheck.v1';
interface Draft {
  key: string;
  points: string;
  full: string;
  mine: string[];
}
const load = (): Draft => {
  try {
    const v = JSON.parse(localStorage.getItem(DRAFT) ?? 'null') as Draft | null;
    if (v && typeof v.key === 'string' && Array.isArray(v.mine)) return { key: v.key, points: String(v.points ?? ''), full: String(v.full ?? '100'), mine: v.mine.map(String) };
  } catch {
    /* 무시 */
  }
  return { key: '', points: '', full: '100', mine: [] };
};

export function GradeCheck() {
  const [dr, setDr] = useState<Draft>(load);
  const [bulk, setBulk] = useState('');
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT, JSON.stringify(dr));
    } catch {
      /* 무시 */
    }
  }, [dr]);
  const key = parseAnswers(dr.key);
  const pts = parsePoints(dr.points, key.length);
  const fullN = Number(dr.full);
  const full = Number.isFinite(fullN) && fullN > 0 && fullN <= 1000 ? fullN : 100;
  const mine = key.map((_, i) => dr.mine[i] ?? '');
  const filled = mine.filter((m) => m.trim()).length;
  const r = key.length ? grade(key, mine, pts, full) : null;
  const setMine = (i: number, v: string) => {
    const next = [...mine];
    next[i] = v;
    setDr({ ...dr, mine: next });
  };
  const save = () => {
    if (!r) return;
    const q = new URLSearchParams({ score: String(r.score), full: String(r.full), wrong: r.wrong.join(','), rec: '0' });
    go(`/review/papers-new?${q}`);
  };
  return (
    <div className="st-page narrow">
      <div className="st-page-head">
        <h2>채점</h2>
        {(dr.key || filled > 0) && (
          <button className="btn btn-sm" onClick={() => setDr({ key: '', points: '', full: '100', mine: [] })}>
            새로 하기
          </button>
        )}
      </div>
      <p className="st-hint">정답을 넣고 내 답을 고르면 바로 채점해요. 결과는 「기출·모의고사 풀이」로 저장할 수 있고, 틀린 번호는 거기서 오답 노트로 넣을 수 있어요. 쓰던 것은 이 기기에 임시로 남아요.</p>
      <section className="st-card st-form">
        <Field label="정답" hint={key.length ? `${key.length}문제` : '붙여 쓰면 한 글자가 한 문제 (예: 13524…), 주관식이 있으면 띄어 쓰기 (예: 1 3 12 5)'}>
          <textarea className="st-input" rows={2} value={dr.key} onChange={(e) => setDr({ ...dr, key: e.target.value })} placeholder="예: 3521443125" inputMode="numeric" />
        </Field>
        <div className="st-inline wrap">
          <Field label="배점 (선택)" hint={pts ? `합계 ${Math.round(pts.reduce((a, b) => a + b, 0) * 100) / 100}점` : `비우면 모든 문제 ${key.length ? Math.round((full / key.length) * 100) / 100 : '-'}점`}>
            <input className="st-input" value={dr.points} onChange={(e) => setDr({ ...dr, points: e.target.value })} placeholder="예: 2 2 3 3 4 (모자라면 마지막 값)" />
          </Field>
          {!pts && (
            <Field label="만점">
              <input className="st-input xs" inputMode="numeric" value={dr.full} onChange={(e) => setDr({ ...dr, full: e.target.value.replace(/[^\d.]/g, '') })} />
            </Field>
          )}
        </div>
      </section>

      {key.length > 0 && (
        <section className="st-card st-form">
          <h3 className="st-h">
            내 답 <small className="st-muted">{filled}/{key.length}</small>
          </h3>
          <Field label="글로 한꺼번에 넣기 (선택)" hint="정답과 같은 방식으로. 안 푼 문제는 - 로">
            <div className="st-inline">
              <input className="st-input" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="예: 3521-43125" inputMode="numeric" />
              <button
                type="button"
                className="btn btn-sm"
                disabled={!bulk.trim()}
                onClick={() => {
                  const a = parseAnswers(bulk);
                  setDr({ ...dr, mine: key.map((_, i) => a[i] ?? '') });
                  setBulk('');
                }}
              >
                넣기
              </button>
            </div>
          </Field>
          <div className="gc-grid">
            {key.map((k, i) => {
              const choice = /^[1-5]$/.test(k);
              const m = mine[i];
              return (
                <div key={i} className="gc-row">
                  <b className="gc-n">{i + 1}</b>
                  {choice ? (
                    <div className="gc-opts" role="group" aria-label={`${i + 1}번 내 답`}>
                      {['1', '2', '3', '4', '5'].map((o) => (
                        <button key={o} type="button" className={m === o ? 'on' : ''} aria-pressed={m === o} onClick={() => setMine(i, m === o ? '' : o)}>
                          {o}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input className="st-input xs" value={m} onChange={(e) => setMine(i, e.target.value.slice(0, 6))} aria-label={`${i + 1}번 내 답`} placeholder="답" />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {r && filled > 0 && (
        <section className="st-card" aria-live="polite">
          <div className="st-stat-row">
            <div>
              <small>점수</small>
              <b>
                {r.score}/{r.full}점
              </b>
            </div>
            <div>
              <small>맞은 문제</small>
              <b>
                {r.right}/{r.n}
              </b>
            </div>
            <div>
              <small>틀린 문제</small>
              <b>{r.wrong.length}개</b>
            </div>
          </div>
          {r.wrong.length > 0 && (
            <p className="st-sub">
              틀린 번호: {r.wrong.map((n) => `${n}번 (정답 ${key[n - 1]}${mine[n - 1] ? ` · 내 답 ${mine[n - 1]}` : ''})`).join(' · ')}
            </p>
          )}
          {r.blank.length > 0 && <p className="st-hint">안 푼 번호(틀림으로 셈): {r.blank.join(', ')}</p>}
          {/* 오른쪽 아래 ＋ 단추에 가리지 않게 왼쪽에 */}
          <div className="st-row">
            <button className="btn btn-primary" onClick={save}>
              기출·모의고사 풀이로 저장
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
