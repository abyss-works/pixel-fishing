// 공개 문서(게임 소개, 이용약관, 개인정보 처리방침)를 확장자 없는 주소로 내 준다.
// 로그인 없이 열리는 정적 문서라 세션을 읽지 않고 쿠키도 만들지 않는다.
import { Router } from 'express';

/** 주소와 정적 폴더 안의 파일 이름. 약관과 처리방침의 주소는 게임 안 링크 상수와 같아야 한다 */
export const LEGAL_PAGE_FILES = {
  '/about': 'about.html',
  '/terms': 'terms.html',
  '/privacy': 'privacy.html',
} as const;

// 문서 파일 이름에는 해시가 없어 내용이 바뀌면 같은 주소에서 바뀐다. 오래 붙들어 두지 않는다.
const MAX_AGE_MS = 5 * 60 * 1000;

export function legalPages(staticDir: string): Router {
  const router = Router();
  for (const [path, file] of Object.entries(LEGAL_PAGE_FILES)) {
    router.get(path, (_req, res, next) => {
      res.sendFile(file, { root: staticDir, maxAge: MAX_AGE_MS }, err => { if (err) next(err); });
    });
  }
  return router;
}
