// 공개 문서(게임 소개, 이용약관, 개인정보 처리방침)를 확장자 없는 주소로 내 준다.
// 로그인 없이 열리는 정적 문서라 세션을 읽지 않고 쿠키도 만들지 않는다.
import { readFileSync } from 'node:fs';
import { Router } from 'express';
import { LEGAL_PATHS } from '../../src/features/account/model/googleFlow.js';
import { consentPolicy } from '../_auth/consentPolicy.js';

/** 문서의 주소. 약관과 처리방침은 게임 안 링크 상수를 그대로 쓰고, 소개는 게임에서 링크하지 않는다. 파일은 주소와 같은 이름의 HTML이다 */
const PAGE_PATHS: string[] = ['/about', ...Object.values(LEGAL_PATHS)];

/** 문서 안에서 현재 판(시행일)이 들어갈 자리. 응답할 때 서버의 현재 판으로 바꾼다 */
export const VERSION_TOKEN = '{{판}}';

// 문서 파일 이름에는 해시가 없어 내용이 바뀌면 같은 주소에서 바뀐다. 오래 붙들어 두지 않는다.
const CACHE_CONTROL = 'public, max-age=300';

/** 문서를 기동 때 한 번 읽어 현재 판을 채워 둔다. 파일이 없거나 시행일 설정이 잘못되면 기동하지 않는다 */
export function legalPages(staticDir: string): Router {
  const { version } = consentPolicy();
  const router = Router();
  for (const path of PAGE_PATHS) {
    const html = readFileSync(`${staticDir}${path.slice(1)}.html`, 'utf-8').replaceAll(VERSION_TOKEN, version);
    // 한 문서에 주소가 둘이 되지 않게 확장자 있는 주소는 영구 이동으로 돌린다
    router.get(`${path}.html`, (_req, res) => { res.redirect(301, path); });
    router.get(path, (_req, res) => {
      res.set('Cache-Control', CACHE_CONTROL).type('html').send(html);
    });
  }
  return router;
}
