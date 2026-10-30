// 저장소 · AI 풀이: AI 에게 물어본 문제를 과목별로 모아 본다. 누르면 그 대화를 AI 화면에서 이어서
import { useState } from 'react';
import { solveImgUrl } from '../auth/api';
import { remove, useStudy } from './store';
import { confirmDelete, Empty, go, SubjectDot, subjectsOf } from './ui';

export function SavedProblems() {
  const d = useStudy();
  const [subject, setSubject] = useState<string>('');
  const all = Object.values(d.problems)
    .filter((p) => !p.deleted)
    .sort((a, b) => b.at - a.at);
  const subjects = subjectsOf(d).filter((s) => all.some((p) => p.subjectId === s.id));
  const list = subject ? all.filter((p) => p.subjectId === subject) : all;
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
              {s.name} {all.filter((p) => p.subjectId === s.id).length}
            </button>
          ))}
        </div>
      )}
      {!list.length && (
        <Empty icon="area-ai" title="아직 모은 문제가 없어요">
          AI 에게 물어본 문제가 여기에 저절로 모여요.
        </Empty>
      )}
      <div className="vault-list">
        {list.map((p) => {
          const img = p.msgs.flatMap((m) => m.imgKeys ?? [])[0];
          const ans = p.msgs.find((m) => m.role === 'assistant' && !m.error)?.text ?? '';
          return (
            <div key={p.id} className="vault-item">
              <button className="vault-open" onClick={() => go(`/ai/${p.id}`)}>
                {img ? <img src={solveImgUrl(img)} alt="" loading="lazy" /> : <span className="vault-noimg" />}
                <span className="vault-text">
                  <b>
                    <SubjectDot id={p.subjectId} d={d} /> {p.title}
                  </b>
                  <small>
                    {new Date(p.at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                    {p.subjectId && d.subjects[p.subjectId] ? ` · ${d.subjects[p.subjectId].name}` : ''}
                  </small>
                  {ans && <span className="vault-ans">{ans.replace(/[$*#\\]/g, '').slice(0, 140)}</span>}
                </span>
              </button>
              <button className="st-x" aria-label={`${p.title} 지우기`} onClick={() => confirmDelete(`「${p.title}」`) && remove('problems', p.id)}>
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
