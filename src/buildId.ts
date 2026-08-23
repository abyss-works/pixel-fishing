// 배포 식별자 — 이 번들이 **어느 배포에서 나왔는지**. 릴리즈 버전(APP_VERSION)과 다른 축이다.
//
// APP_VERSION은 사람이 붙이는 이름이라 dev 빌드에서는 안 올라간다(roadmap 0.0).
// 낡은 탭 차단(426)과 "지금 보고 있는 화면이 최신인가"는 **배포 단위**로 판정해야 해서,
// 배포마다 반드시 달라지는 값이 따로 필요하다. Vercel의 커밋 SHA를 vite가 빌드 때 박는다
// (서버 함수는 같은 값을 런타임 env로 읽는다 — api/action.ts).
export const BUILD_ID = __BUILD_ID__;

/** 화면 표시용 짧은 형태. 'dev'(로컬)는 그대로 둔다 */
export const BUILD_LABEL = BUILD_ID === 'dev' ? 'dev' : BUILD_ID.slice(0, 7);
