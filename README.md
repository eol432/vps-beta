# RIVALS – 친구들과 총싸움 (Render 배포용)

브라우저 3D 총싸움 게임입니다. GitHub에 올리고 Render에 연결하면 링크 하나로 친구들과 온라인 대전이 됩니다.

## 구조

```
.
├── public/
│   ├── index.html      # 게임 본체
│   └── room-shim.js    # claude.ai 전용 multiplayer 대신 쓰는 WebSocket 연결 코드
├── server.js           # 정적 파일 서버 + 실시간 룸(WebSocket /ws)
├── package.json
├── render.yaml         # Render 설정(Blueprint)
└── .gitignore
```

## 배포 방법

1. GitHub에서 새 저장소를 만들고 이 폴더의 파일을 전부 올립니다.
   ```bash
   git init
   git add .
   git commit -m "RIVALS"
   git branch -M main
   git remote add origin https://github.com/<내아이디>/<저장소>.git
   git push -u origin main
   ```
2. [render.com](https://render.com) 로그인 → **New → Blueprint** → 위 저장소 선택 → Apply.
   (Blueprint 대신 **New → Web Service**로 만들 때는 Build `npm install`, Start `node server.js`)
3. 배포가 끝나면 나오는 `https://rivals-online-xxxx.onrender.com` 주소를 친구들에게 공유하세요.

## 로컬 실행

```bash
npm install
npm start     # http://localhost:3000
```

## 참고

- Render 무료 플랜은 15분간 접속이 없으면 잠들고, 다시 열 때 30초~1분 걸립니다.
- 모든 접속자가 하나의 룸을 공유하고, 팀 매치 / PVP / 훈련장 등은 게임 안의 모드로 구분됩니다.
- 서버는 메시지를 그대로 중계만 합니다. (치팅 방지 로직은 없음 — 친구끼리 하는 용도)
- 채팅의 관리자 비밀번호는 `index.html` 안에 그대로 들어 있어 누구나 볼 수 있습니다.
