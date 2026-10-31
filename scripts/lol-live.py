# 롤 게임 중 실시간 내 기록 보기 (Riot Live Client Data API, 내 컴퓨터에서만 동작)
# 쓰는 법: 롤 게임에 들어간 뒤  python scripts/lol-live.py   (Python 3, 따로 설치할 것 없음)
# 게임 클라이언트가 127.0.0.1:2999 에 스스로 서명한 인증서를 써서, 이 주소에만 인증서 확인을 끈다.
import json, os, ssl, time, urllib.request

URL = "https://127.0.0.1:2999/liveclientdata/allgamedata"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE  # 127.0.0.1 전용


def mmss(s):
    return f"{int(s // 60)}:{int(s % 60):02d}"


def tick():
    try:
        with urllib.request.urlopen(URL, context=CTX, timeout=3) as r:
            d = json.load(r)
        a = d.get("activePlayer", {})
        # 예전 클라이언트는 summonerName, 지금은 riotId(이름#태그)를 쓴다
        my = a.get("riotId") or a.get("summonerName")
        me = next((p for p in d.get("allPlayers", []) if (p.get("riotId") or p.get("summonerName")) == my), {})
        s = me.get("scores", {})
        t = d.get("gameData", {}).get("gameTime", 0)
        k, de, asst, cs = s.get("kills", 0), s.get("deaths", 0), s.get("assists", 0), s.get("creepScore", 0)
        kda = f"{(k + asst) / de:.2f}" if de else "Perfect"
        os.system("cls" if os.name == "nt" else "clear")
        print(f"[{mmss(t)}] {me.get('championName', '?')} (레벨 {a.get('level', '?')})")
        print(f"KDA {k}/{de}/{asst}  ({kda})")
        print(f"CS {cs}  (분당 {cs / t * 60 if t else 0:.1f})")
        print(f"골드 {int(a.get('currentGold', 0))}  · 시야 점수 {round(s.get('wardScore', 0))}")
        if me.get("isDead"):
            print(f"💀 부활까지 {int(me.get('respawnTimer', 0)) + 1}초")
    except Exception as e:
        os.system("cls" if os.name == "nt" else "clear")
        print(f"게임 데이터를 기다리는 중… ({e}) — 게임에 들어가면 나와요")


while True:
    tick()
    time.sleep(2)
