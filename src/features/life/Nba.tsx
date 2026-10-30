// 취미 · 농구 · NBA: 경기 일정·결과 (Highlightly 농구 API, 서버를 거쳐 받는다)
export function NbaPage({ sub }: { sub?: string }) {
  void sub;
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>NBA</h2>
      </div>
      <p className="st-muted">NBA 경기 일정·결과를 곧 여기에 보여 줄게요.</p>
    </div>
  );
}
