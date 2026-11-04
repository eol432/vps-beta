# RIVALS – 친구들과 총싸움

브라우저에서 즐기는 3D 멀티플레이 총싸움 게임입니다. (Three.js + Node.js + Socket.IO)
훈련장(봇), 팀 매치, PVP, 1vs1(야차)를 지원하고, 같은 주소로 접속한 친구들끼리 바로 함께 플레이할 수 있어요.

## 폴더 구조

```
├─ public/          게임 화면 (index.html, net-shim.js)
├─ .gitignore
├─ package.json
├─ README.md
├─ render.yaml      Render 배포 설정
└─ server.js        웹 서버 + 멀티플레이 중계 서버
```

## 내 컴퓨터에서 실행

```bash
npm install
npm start
```

브라우저에서 http://localhost:3000 접속. 친구와 같은 네트워크라면 `http://내IP:3000` 으로도 접속할 수 있어요.

## Render에 배포하기

1. 이 폴더 전체를 GitHub 저장소에 올립니다.
2. [Render](https://render.com) 로그인 → **New +** → **Blueprint** → 저장소 선택
   (`render.yaml`을 자동으로 읽어서 설정됩니다)
   - 직접 만들 경우: **New + → Web Service**, Build Command `npm install`, Start Command `npm start`
3. 배포가 끝나면 `https://○○○.onrender.com` 주소를 친구들에게 공유하세요.

### 참고
- 무료(Free) 플랜은 15분간 접속이 없으면 잠들고, 다시 접속하면 켜지는 데 30~60초 걸려요.
- 게임 상태는 서버 메모리에만 저장됩니다. 서버 인스턴스는 **1개**로 유지하세요.
- 최대 동시 접속 수는 환경변수 `MAX_PLAYERS`로 조절할 수 있어요. (기본 60)
