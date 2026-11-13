// 공개 문서(게임 소개, 이용약관, 개인정보 처리방침)를 확장자 없는 주소로 내 준다.
// 로그인 없이 열리는 정적 문서라 세션을 읽지 않고 쿠키도 만들지 않는다.
import { Router } from 'express';
import { LEGAL_PATHS } from '../../src/features/account/model/googleFlow.js';

/** 문서의 주소. 약관과 처리방침은 게임 안 링크 상수를 그대로 쓰고, 소개는 게임에서 링크하지 않는다. 파일은 주소와 같은 이름의 HTML이다 */
const PAGE_PATHS: string[] = ['/about', ...Object.values(LEGAL_PATHS)];

// 문서 파일 이름에는 해시가 없어 내용이 바뀌면 같은 주소에서 바뀐다. 오래 붙들어 두지 않는다.
const MAX_AGE_MS = 5 * 60 * 1000;

export function legalPages(staticDir: string): Router {
  const router = Router();
  for (const path of PAGE_PATHS) {
    // 한 문서에 주소가 둘이 되지 않게 확장자 있는 주소는 영구 이동으로 돌린다
    router.get(`${path}.html`, (_req, res) => { res.redirect(301, path); });
    router.get(path, (_req, res, next) => {
      res.sendFile(`${path.slice(1)}.html`, { root: staticDir, maxAge: MAX_AGE_MS }, err => { if (err) next(err); });
    });
  }
  return router;
}
