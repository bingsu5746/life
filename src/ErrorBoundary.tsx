// 화면에서 오류가 나도 하얀 화면 대신 무슨 오류인지 보여 주고 다시 해 볼 수 있게 (주소가 바뀌면 다시 그려 본다)
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(p: { resetKey: string }, s: { error: Error | null; key: string }) {
    return p.resetKey !== s.key ? { error: null, key: p.resetKey } : null;
  }
  componentDidCatch(error: Error) {
    console.error('화면 오류', error);
  }
  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    const text = `${e.name}: ${e.message}\n${(e.stack ?? '').split('\n').slice(0, 4).join('\n')}`;
    return (
      <div className="st-page narrow err-box">
        <h2>화면을 그리다가 오류가 났어요</h2>
        <p className="st-muted">자료는 그대로 있어요. 아래 글을 복사해서 알려 주시면 고칠게요.</p>
        <pre>{text}</pre>
        <div className="st-inline">
          <button className="btn btn-primary" onClick={() => location.reload()}>
            다시 불러오기
          </button>
          <button className="btn" onClick={() => void navigator.clipboard?.writeText(text)}>
            오류 글 복사
          </button>
          <button className="btn" onClick={() => (location.hash = '#/')}>
            메인으로
          </button>
        </div>
      </div>
    );
  }
}
