# RIVALS – 친구들과 총싸움 (Render 배포용)

`vps_3_0_0.html` 게임을 Render에서 온라인으로 플레이할 수 있게 만든 패키지입니다.

## 구조
- `public/index.html` : 게임 본체 (단일 HTML)
- `server.js` : 정적 파일 + WebSocket(`/ws`) 서버 (외부 패키지 없음)
- `render.yaml` : Render 설정 (Blueprint)
- `package.json`, `.gitignore`

## 배포 방법
1. 이 폴더 전체를 GitHub 저장소에 올립니다.
2. Render 대시보드 → **New → Blueprint** → 저장소 선택 → Apply
   (또는 **New → Web Service**: Build `npm install`, Start `npm start`)
3. 배포가 끝나면 `https://rivals-online.onrender.com` 같은 주소가 생깁니다. 친구에게 공유하세요.

## 로컬 실행
```
npm start
```
브라우저에서 http://localhost:3000 을 열면 됩니다.

## 참고
- 무료 플랜은 15분간 접속이 없으면 잠들고, 다시 열면 첫 접속에 약 1분 걸릴 수 있어요. 화면에 🟢 온라인이 뜰 때까지 기다리면 자동 연결됩니다.
- 서버는 플레이어 상태와 이벤트를 중계만 합니다 (판정은 각 클라이언트에서 처리).
