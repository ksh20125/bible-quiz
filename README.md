# bible-quiz

교회/공동체에서 사용할 수 있는 **실시간 성경 퀴즈 웹앱**입니다.  
사용자는 익명 로그인으로 빠르게 참여하고, 퀴즈 풀이·일일 말씀 퀴즈·리더보드·개인 기록을 확인할 수 있습니다.

## 프로젝트 소개

이 프로젝트는 Next.js 기반의 단일 페이지 앱(SPA 스타일)으로 구성되어 있으며, Firebase를 백엔드로 사용합니다.

주요 기능:

- 익명 로그인 기반 사용자 등록 (이름/부서)
- 난이도/카테고리별 퀴즈 진행
- 일일 말씀 퀴즈 (정답 시 추가 점수)
- 실시간 리더보드 (전체/부서별)
- 내 기록 확인 (정답률, 최근 기록)
- 관리자 화면(숨김 진입)에서 문제/참가자/대회기간/점수 초기화 관리

---

## 기술 스택

### Frontend
- **Next.js 14**
- **React 18**
- **TypeScript**

### Backend / BaaS
- **Firebase Authentication** (익명 로그인)
- **Cloud Firestore** (사용자, 문제, 설정, 기록 저장)

### Tooling
- **ESLint**
- **npm**

---

## 실행 방법

### 1) 사전 요구사항

- Node.js 18 이상 권장
- npm

### 2) 의존성 설치

```bash
npm install
```

### 3) 개발 서버 실행

```bash
npm run dev
```

실행 후 브라우저에서 아래 주소로 접속:

- http://localhost:3000

### 4) 프로덕션 빌드/실행

```bash
npm run build
npm run start
```

---

## Firebase 설정 방법

현재 코드의 `firebase.ts`에는 Firebase 설정값이 직접 들어가 있습니다. 운영 시에는 **환경 변수 방식**으로 전환하는 것을 권장합니다.

### A. Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/)에서 새 프로젝트 생성
2. 프로젝트 설정 → 웹 앱 추가
3. 웹 앱 설정값(apiKey, authDomain 등) 확인

### B. Authentication 설정

1. Firebase Console → **Authentication** → 시작하기
2. **Sign-in method**에서 **익명(Anonymous)** 로그인 활성화

### C. Firestore Database 설정

1. Firebase Console → **Firestore Database** 생성
2. 개발 단계에서는 테스트 모드로 시작 가능
3. 필요 컬렉션 예시:
   - `users`
   - `questions`
   - `admin_config`

### D. (권장) 환경 변수로 설정 분리

루트에 `.env.local` 파일 생성 후 아래 값을 채워주세요:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...
```

그리고 `firebase.ts`를 아래처럼 수정해 사용하세요:

```ts
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};
```

> 참고: `NEXT_PUBLIC_` 접두사가 있는 값은 클라이언트 번들에 포함됩니다. Firebase 웹 설정값은 일반적으로 공개 가능한 식별자이지만, 보안은 반드시 Firestore Security Rules로 제어하세요.

---

## npm 스크립트

- `npm run dev` : 개발 서버 실행
- `npm run build` : 프로덕션 빌드
- `npm run start` : 빌드 결과 실행
- `npm run lint` : 린트 검사

---

## 향후 개선 아이디어

- 퀴즈 데이터 시드/관리 CLI 도입
- Firestore Security Rules 정교화
- 관리자 인증 강화(익명 로그인 + 관리자 권한 분리)
- 테스트 코드(단위/통합) 추가
