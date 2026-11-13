/// <reference types="vite/client" />
// 공개 문서(게임 소개, 이용약관, 개인정보 처리방침, 운영정책)를 확장자 없는 주소로 내 준다.
// 로그인 없이 열리는 문서라 세션을 읽지 않고 쿠키도 만들지 않는다.
// 이용약관, 개인정보 처리방침, 운영정책은 같은 판(시행일)을 쓴다. 판은 판 정책 모듈이 한 곳에서 정한다.
//
// 문서의 정본은 마크다운 본문이고, 서버 번들에 문자열로 들어간다. 서버는 기동할 때 한 번 HTML로 바꿔 둔다.
// 별도 빌드 단계와 생성 파일이 없고, 정적 파일 제공이 판 토큰이 든 원본을 어떤 주소 표기로도 내지 못하며,
// 이미지에서 서버가 따로 파일을 찾지 않는다.
import { Router } from 'express';
import { LEGAL_PATHS } from '../../src/features/account/model/googleFlow.js';
import { consentPolicy } from '../_auth/consentPolicy.js';
import { markdownToDocument, VERSION_TOKEN } from './legalMarkdown.js';
import about from './legalDocs/about.md?raw';
import policy from './legalDocs/policy.md?raw';
import privacy from './legalDocs/privacy.md?raw';
import terms from './legalDocs/terms.md?raw';

/** 문서의 주소와 마크다운 본문. 약관, 처리방침, 운영정책의 주소는 게임 안 링크 상수를 그대로 쓰고, 소개는 게임에서 링크하지 않는다 */
const SOURCES: Record<string, string> = {
  '/about': about,
  [LEGAL_PATHS.terms]: terms,
  [LEGAL_PATHS.privacy]: privacy,
  [LEGAL_PATHS.policy]: policy,
};

// 문서 주소에 해시가 없어 내용이 바뀌면 같은 주소에서 바뀐다. 오래 붙들어 두지 않는다.
const CACHE_CONTROL = 'public, max-age=300';

/** 본문을 HTML로 바꾸고 현재 판을 채워 둔다. 시행일 설정이 잘못되면 기동하지 않는다. 주소의 대소문자는 구분한다 */
export function legalPages(): Router {
  const { version } = consentPolicy();
  const router = Router({ caseSensitive: true });
  for (const [path, source] of Object.entries(SOURCES)) {
    const html = markdownToDocument(source, path).replaceAll(VERSION_TOKEN, version);
    // 한 문서에 주소가 둘이 되지 않게 확장자 있는 주소는 영구 이동으로 돌린다
    router.get(`${path}.html`, (_req, res) => { res.redirect(301, path); });
    router.get(path, (_req, res) => {
      res.set('Cache-Control', CACHE_CONTROL).type('html').send(html);
    });
  }
  return router;
}
