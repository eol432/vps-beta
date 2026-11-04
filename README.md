# RIVALS – 친구들과 총싸움 (Render 배포용)

브라우저에서 즐기는 3D 멀티플레이 FPS 입니다. 이 폴더를 그대로 Render에 올리면 친구들과 같은 방에서 플레이할 수 있어요.

## 폴더 구성

| 파일 | 설명 |
|---|---|
| `public/index.html` | 게임 본체 (v2.0.3) |
| `server.js` | 게임 파일 제공 + 멀티플레이(WebSocket) 서버 |
| `package.json` | 필요한 패키지(`ws`)와 시작 명령 |
| `render.yaml` | Render 자동 설정 파일 |
| `.gitignore` | 깃에 올리지 않을 파일 목록 |

## Render에 올리는 방법

1. 이 폴더 전체를 GitHub 저장소로 올립니다. (`node_modules`는 올리지 않아도 됩니다.)
2. [Render](https://render.com) 에 로그인 → **New +** → **Blueprint** 를 선택하고 그 저장소를 연결합니다.
   (`render.yaml`을 자동으로 읽어 설정해 줍니다.)
   - Blueprint 대신 **New + → Web Service**로 직접 만들 경우: Build Command `npm install`, Start Command `npm start`, Health Check Path `/healthz`
3. 배포가 끝나면 나오는 주소(`https://이름.onrender.com`)를 친구들에게 알려주면 됩니다.

## 내 컴퓨터에서 실행

```bash
npm install
npm start
# http://localhost:3000 접속
```

## 알아두면 좋은 점

- **방 나누기:** 주소 뒤에 `?room=이름`을 붙이면 따로 노는 방이 됩니다. (예: `https://이름.onrender.com/?room=우리반`) 붙이지 않으면 모두 `main` 방에 들어갑니다. 방 하나에 최대 40명입니다.
- **무료 플랜:** 15분 동안 아무도 접속하지 않으면 서버가 잠들고, 다시 접속하면 깨어나는 데 약 1분 걸립니다. 서버가 재시작되면 접속이 끊겼다가 자동으로 다시 연결됩니다.
- **3D 라이브러리:** `three.js`는 인터넷(cdnjs)에서 불러오므로 접속하는 사람의 기기가 인터넷에 연결되어 있어야 합니다.
- **같은 맵:** 장애물 배치는 고정 시드라서 모든 접속자가 같은 맵을 봅니다.
