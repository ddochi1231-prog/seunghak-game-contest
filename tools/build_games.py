"""루트 폴더의 .ent 파일을 풀어 web/games/ 에 정적 파일로 만든다.
게임 소개·조작법·순위 방식은 '26-승학초 엔트리 게임 안내' PDF 내용을 아래 INFO 에 옮긴 것이다.
그림(web/img/gNN.png)은 PDF 에서 뽑은 것 (python tools/extract_pdf_images.py).
사용: python tools/build_games.py
"""
import json, re, shutil, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "games"

# rankType : score_high(점수 높을수록) | time_low(빨리 클리어할수록) | review(점수 없이 후기 별점으로 평가)
# scoreVar : 점수로 읽을 엔트리 변수 이름 (없으면 None)
# scoreMode: peak(플레이 중 최고값) | final(끝났을 때 값)
INFO = [
    dict(title="공과 별", desc="발판에 닿으면 자동으로 튀는 공을 움직여 별에 도달하는 게임",
         controls="A: 왼쪽 / D: 오른쪽", steps="긴 발판 → 높이가 다른 네 발판 → 끝 화면",
         finish="두 번째 별에 닿으면 끝 화면", ops="‘튕기기’ 변수는 점수가 아닌 이동 속도 → 클리어 시간 방식",
         rankType="time_low", scoreVar=None, color="#ffe7a8"),
    dict(title="동전 모으기", desc="판으로 축구공을 튕기며 동전을 모음. 동전당 10점, 목숨 3개",
         controls="마우스 좌우 이동", steps="한 화면에서 동전 획득과 공 받기를 반복",
         finish="가시에 닿아 목숨이 0이 되면 종료", ops="최고 점수 방식",
         rankType="score_high", scoreVar="점수", scoreMode="peak", color="#cfe6ff"),
    dict(title="달리기 경주", desc="자동으로 달리는 상대와 오른쪽 끝까지 경주",
         controls="← 와 → 를 번갈아 눌렀다 떼기", steps="준비·시작 안내 → 경주",
         finish="먼저 오른쪽 벽에 도착한 캐릭터의 승리 선언 후 종료", ops="승리한 경우에만 클리어 기록 필요",
         rankType="time_low", scoreVar=None, color="#d9ccff"),
    dict(title="무늬 만들기", desc="벽에 튕기는 공이 색과 밝기를 바꾸며 무늬를 찍는 체험",
         controls="Tab: 지우고 방향 변경 / 클릭: 공 크기 변경", steps="조작 안내 → 한 화면에서 자유 체험",
         finish="자동 종료·승패 없음. 멈춤 버튼으로 마침", ops="시간 순위보다 후기·별점 평가 적합",
         rankType="review", scoreVar=None, color="#ffd6ec"),
    dict(title="떨어지는 캐릭터", desc="여러 캐릭터가 위에서 아래로 반복해서 떨어지는 생존형 구성",
         controls="← · → 로 캐릭터 이동. 배경도 같은 키로 이동", steps="한 화면에서 낙하 반복",
         finish="생명 0 종료 조건은 있으나 감소 동작·충돌 연결 불완전", ops="대회 전 충돌·생명·종료 처리 수정 필요 (그때까지 후기·별점 평가)",
         rankType="review", scoreVar=None, color="#d4f5dc"),
    dict(title="바나나 구하기", desc="바구니로 바나나를 받음. 시간이 지날수록 빨라지고 자주 등장",
         controls="START 클릭 / 마우스 좌우 이동", steps="시작 → 3·2·1·GO → 바나나 받기 → 결과",
         finish="생명 값이 0보다 작아지면 Game over", ops="Score는 1초마다 증가하는 생존 시간형 점수",
         rankType="score_high", scoreVar="Score", scoreMode="peak", color="#fff1a6"),
    dict(title="색깔 상자", desc="150개 상자가 마우스를 바라보며 방향을 바꾸는 시각 효과",
         controls="마우스 이동 / Space: 투명도 / 클릭: 모양·복제 / Enter: 지정 모양", steps="상자 배열 생성 → 자유 체험",
         finish="자동 종료·승패 없음. 멈춤 버튼으로 마침", ops="시간 순위보다 후기·별점 평가 적합",
         rankType="review", scoreVar=None, color="#ffd9c7"),
    dict(title="늦잠 이야기", desc="지각한 줄 알고 학교에 간 엔트리봇의 반전 이야기",
         controls="대사를 읽으며 대기 / 시계·결과 버튼 클릭", steps="9개 장면: 기상 → 지각 걱정 → 학교 → 개교기념일 발견 → 마지막",
         finish="결과 확인 버튼을 누르면 엔딩 문구", ops="이야기 관람형. 후기·별점 평가 적합",
         rankType="review", scoreVar=None, color="#d7e3ff"),
    dict(title="표적 클릭", desc="10초 동안 엔트리봇 표적을 클릭하고 폭탄을 피함",
         controls="시작 클릭 / 표적 클릭", steps="시작 → 10초 플레이 → 결과",
         finish="10초 후 점수 표시. 다시 하기로 초기화", ops="일반 표적 +10, 연결된 폭탄 -50. 추가 표적·폭탄 일부 연결 확인 필요",
         rankType="score_high", scoreVar="맞춘 횟수", scoreMode="final", color="#ffd0d0"),
    dict(title="사자와 다람쥐", desc="사자가 다람쥐를 만나고 다람쥐가 도망가는 애니메이션",
         controls="시작 버튼. 별도 조작 없음", steps="사자 산책 → 다람쥐 등장 → 도망 → 포효·이동",
         finish="이동 반복. 자동 종료 없이 멈춤 버튼으로 마침", ops="이야기 관람형. 후기·별점 평가 적합",
         rankType="review", scoreVar=None, color="#ffe0b8"),
]


def rewrite(node, prefix):
    """fileurl 이 temp/... 로 시작하면 서버 경로로 바꾼다."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "fileurl" and isinstance(v, str) and v.startswith("temp/"):
                node[k] = f"{prefix}/{v}"
            else:
                rewrite(v, prefix)
    elif isinstance(node, list):
        for v in node:
            rewrite(v, prefix)


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    ents = sorted(ROOT.glob("*.ent"))
    assert len(ents) == len(INFO), f".ent {len(ents)}개 / INFO {len(INFO)}개 - 개수가 달라요"
    manifest = []
    for i, (ent, info) in enumerate(zip(ents, INFO), start=1):
        gid = f"g{i:02d}"
        dest = OUT / gid
        dest.mkdir()
        with tarfile.open(ent, "r:*") as t:
            t.extractall(dest)
        pj = dest / "temp" / "project.json"
        proj = json.loads(pj.read_text(encoding="utf-8"))
        rewrite(proj, f"games/{gid}")
        # 켜져만 있고 쓰지 않는 AI·하드웨어 블록 목록 제거 (남겨두면 엔트리가 카메라·마이크 권한을 요청함)
        for k in ("aiUtilizeBlocks", "hardwareLiteBlocks", "externalModules", "externalModulesLite", "expansionBlocks"):
            if k in proj:
                proj[k] = []
        (dest / "project.json").write_text(json.dumps(proj, ensure_ascii=False), encoding="utf-8")
        pj.unlink()
        m = re.match(r"(\d)-(\d)\s*(.+)\.ent", ent.name)
        grade, klass, rest = m.group(1), m.group(2), m.group(3).replace("추천", "").strip()
        author = rest.split()[0]
        score_var = None
        if info.get("scoreVar"):
            v = next((v for v in proj.get("variables", []) if v.get("variableType") == "variable" and v.get("name") == info["scoreVar"]), None)
            assert v, f"{ent.name}: 변수 '{info['scoreVar']}' 를 찾지 못했어요"
            score_var = {"id": v["id"], "name": v["name"]}
        rank = info["rankType"]
        manifest.append({
            "id": gid, "title": info["title"], "author": author, "grade": int(grade), "class": int(klass),
            "file": ent.name, "thumb": f"img/{gid}.png", "color": info["color"],
            "desc": info["desc"], "controls": info["controls"], "steps": info["steps"], "finish": info["finish"], "ops": info["ops"],
            "rankType": rank, "unit": {"score_high": "점", "time_low": "초", "review": "점"}[rank],
            "scoreVar": score_var, "scoreMode": info.get("scoreMode", "peak"),
        })
        print(gid, ent.name, "→", info["title"], rank, score_var["name"] if score_var else "-")
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print("done", len(manifest))


main()
