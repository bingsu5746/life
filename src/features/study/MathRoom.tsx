// 공부 › 수학 방: 부모님과 쓰는 Discord 수학 서버의 채널 글(강의 영상 · 진도 · 답변)을 보고, 앱에서 질문을 보낸다
import { useEffect, useState } from 'react';
import { discordChannels, discordInfo, discordMsgs, discordSend, type DcMsg } from '../auth/api';
import { toast } from './ui';

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) ?? '';
    } catch {
      return '';
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 저장 못 해도 화면은 그대로 */
    }
  },
};
const msgOf = (e: unknown) => (e instanceof Error ? e.message : '받지 못했어요.');
const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/** 글 안의 주소는 누를 수 있게 */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </>
  );
}

function Msg({ m }: { m: DcMsg }) {
  return (
    <li className="mr-msg">
      <div className="mr-head">
        <b>{m.author}</b>
        <small className="st-muted">{when(m.at)}</small>
      </div>
      {m.text && (
        <p className="mr-text">
          <Linked text={m.text} />
        </p>
      )}
      {m.files.map((f) =>
        f.type.startsWith('image/') ? (
          <a key={f.url} href={f.url} target="_blank" rel="noreferrer">
            <img className="mr-img" src={f.url} alt={f.name} loading="lazy" />
          </a>
        ) : f.type.startsWith('video/') ? (
          <video key={f.url} className="mr-video" src={f.url} controls preload="metadata" />
        ) : (
          <a key={f.url} className="mr-file" href={f.url} target="_blank" rel="noreferrer">
            📎 {f.name} <small className="st-muted">{size(f.size)}</small>
          </a>
        ),
      )}
    </li>
  );
}

export function MathRoom() {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof discordInfo>> | null>(null);
  const [err, setErr] = useState('');
  const [guild, setGuild] = useState(() => store.get('mr-guild'));
  const [chans, setChans] = useState<{ id: string; name: string; cat: string }[]>([]);
  const [chan, setChan] = useState(() => store.get('mr-chan'));
  const [msgs, setMsgs] = useState<DcMsg[] | null>(null);
  const [more, setMore] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    discordInfo()
      .then((r) => {
        setInfo(r);
        if (r.guilds.length && !r.guilds.some((g) => g.id === guild)) setGuild(r.guilds[0].id);
      })
      .catch((e) => setErr(msgOf(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!guild) return;
    store.set('mr-guild', guild);
    discordChannels(guild)
      .then((c) => {
        setChans(c);
        if (c.length && !c.some((x) => x.id === chan)) setChan(c[0].id);
      })
      .catch((e) => setErr(msgOf(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guild]);
  useEffect(() => {
    if (!chan) return;
    store.set('mr-chan', chan);
    let live = true;
    setMsgs(null);
    discordMsgs(chan)
      .then((m) => {
        if (!live) return;
        setMsgs(m);
        setMore(m.length === 50);
      })
      .catch((e) => live && setErr(msgOf(e)));
    return () => {
      live = false;
    };
  }, [chan, tick]);

  const older = () => {
    if (!msgs?.length) return;
    discordMsgs(chan, msgs[msgs.length - 1].id)
      .then((m) => {
        setMsgs([...msgs, ...m]);
        setMore(m.length === 50);
      })
      .catch((e) => toast(msgOf(e)));
  };
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await discordSend(chan, text);
      setText('');
      toast('보냈어요');
      setTick((t) => t + 1);
    } catch (e) {
      toast(msgOf(e));
    } finally {
      setSending(false);
    }
  };

  const cats = [...new Set(chans.map((c) => c.cat))];
  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2>수학 방</h2>
        {chan && (
          <button className="btn btn-sm" onClick={() => setTick((t) => t + 1)}>
            새로고침
          </button>
        )}
      </div>
      {err && <p className="st-muted">{err}</p>}
      {!info && !err && <p className="st-muted">받는 중…</p>}
      {info && !info.guilds.length && (
        <section className="st-card">
          <p>
            봇 「{info.bot}」이 아직 서버에 없어요. 아래 링크를 열어 수학 서버를 고르고 <b>승인</b>을 누르면 들어가요. (서버 관리 권한이 있는 계정으로)
          </p>
          <a className="btn btn-primary" href={info.invite} target="_blank" rel="noreferrer">
            봇 초대하기
          </a>
        </section>
      )}
      {info && info.guilds.length > 0 && (
        <div className="lc-bar">
          {info.guilds.length > 1 && (
            <select className="st-input" value={guild} onChange={(e) => setGuild(e.target.value)} aria-label="서버">
              {info.guilds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <select className="st-input" value={chan} onChange={(e) => setChan(e.target.value)} aria-label="채널">
            {cats.map((cat) => (
              <optgroup key={cat || '-'} label={cat || '채널'}>
                {chans
                  .filter((c) => c.cat === cat)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      # {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      {info && !info.contentIntent && <p className="st-muted sm">개발자 포털 Bot 메뉴에서 MESSAGE CONTENT INTENT 를 켜야 글 내용이 보여요.</p>}
      {chan && (
        <section className="st-card mr-send">
          <textarea className="st-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="이 채널에 보낼 질문 (봇 이름으로 올라가요)" aria-label="보낼 글" />
          <button className="btn btn-primary" disabled={!text.trim() || sending} onClick={send}>
            {sending ? '보내는 중…' : '보내기'}
          </button>
        </section>
      )}
      {chan && !msgs && !err && <p className="st-muted">글 받는 중…</p>}
      {msgs && !msgs.length && <p className="st-muted">이 채널에는 아직 글이 없어요.</p>}
      {msgs && msgs.length > 0 && (
        <ul className="mr-list">
          {msgs.map((m) => (
            <Msg key={m.id} m={m} />
          ))}
        </ul>
      )}
      {msgs && msgs.length > 0 && more && (
        <button className="btn" onClick={older}>
          예전 글 더 보기
        </button>
      )}
    </div>
  );
}
