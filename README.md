# 레고학교 담벼락

코드·QR로 참여하는 게시판입니다.

- [사이트](https://legoschool-wall.legoschool.chatgpt.site)
- [관리자](https://legoschool-wall.legoschool.chatgpt.site/?admin=1)

## 기능

- 6자리 코드 클릭 복사, QR 참여·공유
- 스크롤해도 상단에 고정되는 코드와 QR
- 140자 글, 공감, 최신순·공감순
- 관리자 보드 생성·수정·마감·삭제, 무작위 뽑기, 결과 저장
- 숫자 4자리 관리자 비밀번호, 로그인 시도 제한
- 모바일 화면과 키보드 조작

## 로컬 실행

Node.js 22 이상(테스트는 24 권장).

```sh
npm ci
npm start
```

http://localhost:4317 에서 실행됩니다. 관리자 화면에서 최초 비밀번호를 설정합니다.
로컬 기록은 data/에 저장되며 Git에 포함하지 않습니다.

## 클라우드 배포

공개 사이트는 Cloudflare Worker 호환 서버와 D1을 사용합니다.
cloud/worker.mjs가 배포 서버, server.mjs가 로컬 서버입니다.
클라우드는 2초 간격으로 갱신하고, 로컬은 SSE를 사용합니다.

```sh
npm run build
npm test
```

직접 배포하려면 wrangler.json의 D1 ID를 본인 DB로 바꾸고 drizzle/의 스키마 마이그레이션을 적용합니다.
ADMIN_CREDENTIAL 비밀 변수에 로컬 data/admin.json의 내용을 설정하세요. 비밀번호 해시이므로 공개하지 마세요.
IMPORT_TOKEN은 기존 데이터 이전 시에만 일시적으로 설정하며 평상시에는 제거합니다.
프로젝트의 .openai/hosting.json은 원본 Sites 배포 연결입니다. 포크에서 Sites로 배포할 경우 새 프로젝트 ID로 교체하세요.

공개 저장소에는 운영 게시글·비밀번호·세션·환경 변수가 포함되지 않습니다.
4자리 비밀번호를 사용하는 소규모 게시판이며 개인정보나 민감한 기록의 보관 용도로 설계되지 않았습니다.

## 개발

- npm run db:generate: 변경된 DB 스키마의 마이그레이션 생성
- npm run build: 정적 파일을 포함한 Worker 빌드
- npm test: 로컬·클라우드 권한 및 저장 동작 검증
- AGENTS.md: 간결한 화면 문구와 권한 처리 지침

## 라이선스

MIT. public/qrcode.js는 Kazuhiko Arase의 qrcode-generator 1.4.4(MIT)이며 원본 저작권 표시를 유지합니다.
