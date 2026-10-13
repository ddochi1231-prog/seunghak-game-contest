# 배포 안내: 구글시트 + Apps Script + GitHub Pages

```
학생 브라우저 ──(화면·게임 파일)──▶ GitHub Pages   (web/ 폴더, 무료 정적 호스팅)
      │
      └──(로그인·순위·후기 API)──▶ Apps Script 웹앱 ──▶ 구글 시트 (데이터 저장)
```

준비물: 구글 계정(개인 Gmail 권장), GitHub 계정, 이 프로젝트 폴더.
소요 시간: 처음이면 약 30분.

---

## 1단계. 구글 시트와 Apps Script 만들기

1. https://sheets.google.com → **빈 스프레드시트** 만들기 → 이름: `승학초 게임대회 DB`
2. 메뉴 **확장 프로그램 → Apps Script** 클릭 (새 탭이 열림)
3. 왼쪽 파일 `코드.gs`의 내용을 모두 지우고, 이 폴더의 `apps-script/Code.gs` 내용을 **전부 복사해 붙여넣기** → 💾 저장 (프로젝트 이름은 아무거나)
4. 위쪽 함수 선택 칸에서 **`setup`** 선택 → ▶ **실행**
5. 처음에는 권한 창이 뜹니다.
   - **권한 검토** → 내 계정 선택
   - "Google에서 확인하지 않은 앱" 경고 → **고급 → (프로젝트 이름)(안전하지 않음)으로 이동 → 허용**
   - 내가 만든 스크립트이므로 안전합니다.
6. 시트로 돌아가면 `users`, `scores`, `reviews`, `settings` 탭이 생겨 있어야 합니다.
7. **`settings` 탭의 `adminPassword` 값(B3)을 나만 아는 암호로 바꾸세요.** (선생님 화면 로그인 암호)

> 학교(Workspace) 계정으로 만들면 관리자가 "모든 사용자" 공개를 막아 둔 경우가 있습니다. 막히면 개인 Gmail로 만드세요.

## 2단계. 웹 앱으로 배포하기

1. Apps Script 오른쪽 위 **배포 → 새 배포**
2. 톱니바퀴(유형 선택) → **웹 앱**
3. 설정
   - 설명: `v1`
   - **다음 사용자로 실행: 나**
   - **액세스 권한이 있는 사용자: 모든 사용자** ← 꼭 "모든 사용자" (Google 계정 사용자 ✕)
4. **배포** → 웹 앱 **URL**(`https://script.google.com/macros/s/…/exec`) 복사
5. 확인: 그 URL을 브라우저 주소창에 붙여넣으면 `{"ok":true,"msg":"승학초 게임 대회 API 정상 동작 중"}` 가 보여야 합니다.

### ⚠️ 코드를 고친 뒤 다시 배포할 때 (매우 중요)
**배포 → 배포 관리 → ✏️ 편집 → 버전: 새 버전 → 배포.**
`새 배포`를 누르면 **URL이 바뀌어** config.js를 또 고쳐야 합니다. 같은 URL을 유지하려면 반드시 "배포 관리 → 편집 → 새 버전"을 쓰세요.
(이 프로젝트는 순위 방식을 바꾸면서 `Code.gs`가 수정되었습니다. 예전에 배포해 두었다면 이 방법으로 새 버전을 올려야 합니다.)

## 3단계. 웹앱에 API 주소 넣기

`web/config.js`를 열어 `apiUrl`에 2단계의 URL을 붙여넣습니다.

```js
window.APP_CONFIG = {
  title: "승학초 게임 대회",
  apiUrl: "https://script.google.com/macros/s/여기에_복사한_주소/exec",
  pollMs: 5000,
};
```

**내 컴퓨터에서 먼저 확인**
```bash
python tools/serve.py 8001
```
→ http://localhost:8001 에서 로그인 → 게임 하나 플레이 → 구글 시트의 `users`, `scores` 탭에 줄이 생기면 연결 성공입니다.
(구글시트에 기록하지 않고 연습만 하려면 `python tools/serve.py 8001 --demo`)

## 4단계. GitHub에 올리기

### 4-1. 저장소 만들기
1. https://github.com → 로그인 → 오른쪽 위 **+ → New repository**
2. Repository name: 예) `seunghak-game-contest`
3. **Public** 선택 (무료 계정은 비공개 저장소로 Pages를 쓸 수 없습니다) → **Create repository**
   (README/.gitignore 추가 체크는 하지 마세요. 이미 있습니다.)

> 🔒 **공개 저장소·공개 주소에는 학생 10명의 이름·반(제작자 표시)이 보입니다.** 학교·학부모 동의가 필요한지 확인하세요. 꺼리면 `tools/build_games.py`의 제작자 표기를 이니셜로 바꾸거나 Netlify의 비밀번호 보호 같은 대안을 쓰세요.
> `.ent` 원본과 안내 PDF는 `.gitignore`로 **올라가지 않게** 해 두었습니다. (웹에 필요한 건 `web/` 안에 이미 변환되어 있음)

### 4-2. 내 컴퓨터에서 올리기 (PowerShell)
```powershell
cd "C:\Users\user\Desktop\26-승학초게임대회"
git init -b main
git add .
git status          # .ent, .pdf 가 목록에 없어야 정상 (web/, apps-script/, tools/ 등만)
git commit -m "승학초 게임 대회 웹앱"
git remote add origin https://github.com/내아이디/seunghak-game-contest.git
git push -u origin main
```
- 처음 `git push` 때 로그인 창이 뜨면 GitHub 계정으로 로그인합니다.
- GitHub CLI가 설치되어 있다면 한 줄로도 됩니다: `gh repo create seunghak-game-contest --public --source=. --push`
- GitHub Desktop을 쓴다면: File → Add local repository → 이 폴더 → Publish repository(**Keep this code private 체크 해제**)

## 5단계. GitHub Pages 켜기 (자동 배포)

1. 저장소 → **Settings → Pages**
2. **Build and deployment → Source: `GitHub Actions`** 선택 (저장 버튼 없음)
3. 저장소 **Actions** 탭 → `Deploy web to GitHub Pages`가 초록 ✅가 될 때까지 기다림 (1~3분)
   - 빨간 ❌이면 클릭해서 로그 확인. 대부분 2번(Source)을 안 바꾼 경우입니다.
4. 주소: `https://내아이디.github.io/seunghak-game-contest/`
   (Actions 실행 결과의 `deploy` 단계 또는 Settings → Pages 위쪽에도 표시됨)

`.github/workflows/pages.yml`이 `web/` 폴더만 배포하도록 이미 설정되어 있어서, 이후에는 **`git push`만 하면 자동으로 다시 배포**됩니다.

## 6단계. 최종 점검 체크리스트
- [ ] 배포 주소에서 로그인 화면/목록이 보인다 (데스크탑·노트북 크롬/엣지)
- [ ] 게임 하나를 열어 ▶ 게임 시작 → 실제로 실행된다 (처음 10~30초 로딩)
- [ ] 로그인(학년·반·번호·이름) → 구글 시트 `users`에 줄이 생긴다
- [ ] 점수 게임(동전 모으기/바나나 구하기/표적 클릭) 플레이 후 `scores`에 기록, 순위에 표시
- [ ] 후기를 쓰면 `reviews`에 생기고, 다른 컴퓨터에서 5~10초 뒤 보인다
- [ ] 선생님 화면(`배포주소/#/admin`)에서 1단계에서 정한 암호로 열린다
- [ ] 테스트 기록을 지운다: 시트의 `users/scores/reviews`에서 2행 이하 삭제 (1행 제목줄은 남기기)

## 7단계. 나중에 고칠 때
| 바꾸는 것 | 방법 |
|---|---|
| 화면·게임 | 파일 수정 → `git add . && git commit -m "수정" && git push` → 자동 재배포 (브라우저 새로고침이 안 되면 Ctrl+F5) |
| .ent 게임 교체 | 루트에 새 .ent 넣기 → `python tools/build_games.py` → commit/push |
| 순위 방식·서버 규칙 | `Code.gs`의 `GAME_RULES` + `web/games/manifest.json`(또는 build_games.py의 INFO) **둘 다** 수정 → Apps Script **새 버전 배포** + git push |
| 관리자 암호 | 시트 `settings` 탭 B3 값 직접 수정 |

## 문제 해결
| 증상 | 원인·해결 |
|---|---|
| 화면은 뜨는데 로그인이 "인터넷 연결을 확인해 주세요" | `config.js`의 `apiUrl` 오타/비어 있음, 또는 배포 액세스가 "모든 사용자"가 아님. 2단계 5번 확인 |
| 로그인하면 "시트에서 setup을 먼저 실행해 주세요" | 1단계 4번 `setup` 실행 안 됨 |
| 코드를 고쳤는데 그대로다 | "새 버전"으로 배포하지 않음 (2단계 ⚠️) |
| 순위가 거꾸로/후기 평가 게임에 점수가 들어감 | `GAME_RULES`가 예전 값 → 새 버전 배포 |
| GitHub 주소가 404 | Pages Source가 `GitHub Actions`인지, Actions가 ✅인지 확인. 주소 끝에 저장소 이름 포함 |
| 학교에서만 안 됨 | 학교망이 `script.google.com` 또는 `github.io`를 막는 중 → 정보부장/통신사에 허용 요청, 또는 Netlify 등 다른 호스팅 |
| 처음 게임 로딩이 오래 걸림 | 엔트리 런타임 약 18MB. 한 번 받으면 캐시됨. 수업 전에 교사 PC에서 한 번 열어 두기 |

## 운영 팁과 한도
- **동시에 처리되는 요청은 약 30개**가 한계입니다. 한 번에 30명 이상이 몰리면 학급별로 시간을 나누세요. (조회는 잠금 없이 5초 캐시로 처리하도록 개선해 두었습니다.)
- **구글 시트는 교사만** 열 수 있게 하세요. 학생과 공유하면 관리자 암호(`settings` 탭)가 보입니다.
- 대회 종료: 선생님 화면 → **대회 종료(기록 잠금)**
- 백업: 대회 후 시트를 `파일 → 사본 만들기` 또는 `다운로드 → CSV`로 보관
- 개인정보: 대회가 끝나면 시트의 `users`(이름)와 `reviews`를 삭제하고, 필요하면 GitHub 저장소를 Private으로 바꾸거나 Pages를 끄세요 (Settings → Pages / 저장소 맨 아래 Danger Zone).
