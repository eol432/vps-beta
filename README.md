# VPS 멀티플레이 게임 서버 (Render 배포용)

게임(`public/index.html`)과 멀티플레이 서버(`server.js`)가 한 서비스로 같이 돌아갑니다.
서버는 접속자들의 위치·체력을 모아서 전달하고, 피격·킬·야차 신청 같은 이벤트를 중계합니다.

## 폴더 구조
- `public/index.html` : 게임 본체
- `server.js` : 정적 파일 제공 + WebSocket(`/ws`) 멀티플레이 중계
- `render.yaml` : Render 설정
- `package.json` : 의존성(`ws`)

## 내 컴퓨터에서 실행
```
npm install
npm start
```
브라우저에서 http://localhost:3000 을 여러 탭으로 열면 서로 보입니다.

## Render에 배포
1. 이 폴더 전체를 GitHub 저장소에 올립니다. (`node_modules`는 올리지 않아도 됩니다)
2. Render 대시보드 → New → **Blueprint** → 저장소 선택 → 배포
   (또는 New → Web Service: Build Command `npm install`, Start Command `npm start`)
3. 배포가 끝나면 나오는 주소(https://...onrender.com)로 접속합니다.

## 참고
- 무료 플랜은 한동안 접속이 없으면 서버가 잠들어서, 첫 접속에 30초~1분쯤 걸릴 수 있습니다.
- 동시 접속 상한은 환경변수 `MAX_PLAYERS`(기본 40)로 바꿀 수 있습니다.
- 화면 왼쪽 아래의 FPS·핑 표시로 렉 원인을 구분할 수 있습니다.
