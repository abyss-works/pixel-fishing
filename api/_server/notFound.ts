// 등록되지 않은 경로의 마지막 응답. Express 기본 "Cannot GET" 본문 대신 /api는 API 오류 형식, 그 밖은 정돈된 HTML을 낸다.
import type { Request, Response } from 'express';

const PAGE = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>페이지를 찾을 수 없습니다</title>
</head>
<body>
<h1>페이지를 찾을 수 없습니다</h1>
<p>주소가 바뀌었거나 없는 페이지입니다. <a href="/">처음 화면으로 돌아가기</a></p>
</body>
</html>
`;

export function notFound(req: Request, res: Response): void {
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'not-found' });
    return;
  }
  res.status(404).type('html').send(PAGE);
}
