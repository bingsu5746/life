// AI 풀이 모음: 과목별로 물어본 문제 목록. 누르면 그 대화를 AI 화면에서 이어서, 왼쪽으로 밀면 지운다
import { useState } from 'react';
import { solveImgUrl } from '../auth/api';
import { remove, useStudy } from './store';
import { Empty, go, SubjectDot, toast } from './ui';
import { SwipeDelete } from './SwipeDelete';
import type { SolvedProblem, StudyData } from './model';
import { aliveProblems, askedSubjects, NO_SUBJECT } from './vault';

function ProblemList({ list, d }: { list: SolvedProblem[]; d: StudyData }) {
  return (
    <div className="vault-list">
      {list.map((p) => {
        const img = p.msgs.flatMap((m) => m.imgKeys ?? [])[0];
        const ans = p.msgs.find((m) => m.role === 'assistant' && !m.error)?.text ?? '';
        return (
          <SwipeDelete
            key={p.id}
            label={p.title}
            onOpen={() => go(`/ai/${p.id}`)}
            onDelete={() => {
              remove('problems', p.id);
              toast(`「${p.title}」 지웠어요`);
            }}
          >
            <span className="vault-open">
              {img ? <img src={solveImgUrl(img)} alt="" loading="lazy" draggable={false} /> : <span className="vault-noimg" />}
              <span className="vault-text">
                <b>{p.title}</b>
                <small>
                  {new Date(p.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                  {p.subjectId && d.subjects[p.subjectId] ? ` · ${d.subjects[p.subjectId].name}` : ''}
                </small>
                {ans && <span className="vault-ans">{ans.replace(/[$*#\\]/g, '').slice(0, 140)}</span>}
              </span>
            </span>
          </SwipeDelete>
        );
      })}
    </div>
  );
}

/** AI 화면 · 과목 하나의 질문 목록 (/ai/s/<과목>) */
export function SubjectProblems({ subject }: { subject: string }) {
  const d = useStudy();
  const s = subject === NO_SUBJECT ? undefined : d.subjects[subject];
  const list = aliveProblems(d).filter((p) => (subject === NO_SUBJECT ? !p.subjectId || !d.subjects[p.subjectId] || d.subjects[p.subjectId].deleted : p.subjectId === subject));
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>
          {s && <SubjectDot id={s.id} d={d} />} {s?.name ?? '과목 없음'}
        </h2>
      </div>
      {!list.length ? <Empty title="이 과목으로 물어본 문제가 없어요" /> : <ProblemList list={list} d={d} />}
      {list.length > 0 && <p className="st-muted sm">왼쪽으로 밀면 지워요.</p>}
    </div>
  );
}

/** 저장소 · AI 풀이: 전체를 과목별로 거르기 */
export function SavedProblems() {
  const d = useStudy();
  const [subject, setSubject] = useState<string>('');
  const all = aliveProblems(d);
  const subjects = askedSubjects(d);
  const list = subject ? all.filter((p) => (subject === NO_SUBJECT ? !p.subjectId || !d.subjects[p.subjectId] : p.subjectId === subject)) : all;
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>AI 풀이</h2>
        <button className="btn btn-sm" onClick={() => go('/ai')}>
          새로 묻기
        </button>
      </div>
      {subjects.length > 0 && (
        <div className="st-seg sm">
          <button className={subject ? '' : 'on'} onClick={() => setSubject('')}>
            전체 {all.length}
          </button>
          {subjects.map((s) => (
            <button key={s.id} className={subject === s.id ? 'on' : ''} onClick={() => setSubject(s.id)}>
              {s.name} {s.n}
            </button>
          ))}
        </div>
      )}
      {!list.length ? (
        <Empty icon="area-ai" title="아직 모은 문제가 없어요">
          AI 에게 물어본 문제가 여기에 저절로 모여요.
        </Empty>
      ) : (
        <ProblemList list={list} d={d} />
      )}
    </div>
  );
}
