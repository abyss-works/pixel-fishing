export type NoticeBlock =
  | { kind: 'code'; lines: string[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; lines: string[] };

const FENCE_OPEN_RE = /^```[^`]*$/;
const FENCE_CLOSE_RE = /^```\s*$/;
const LIST_ITEM_RE = /^[-*]\s+(.*)$/;

/** 공지 본문을 코드블록, 글머리 목록, 문단 단위로 나눈다. */
export function parseNoticeBlocks(raw: string): NoticeBlock[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const blocks: NoticeBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (FENCE_OPEN_RE.test(line)) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !FENCE_CLOSE_RE.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && FENCE_CLOSE_RE.test(lines[i])) i++;
      blocks.push({ kind: 'code', lines: codeLines });
      continue;
    }

    if (LIST_ITEM_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = LIST_ITEM_RE.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ kind: 'list', items });
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length
      && lines[i].trim() !== ''
      && !FENCE_OPEN_RE.test(lines[i])
      && !LIST_ITEM_RE.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'paragraph', lines: paraLines });
  }

  return blocks;
}

function findClosingDoubleStar(text: string, start: number): number {
  let j = start;
  while (j < text.length) {
    if (text[j] === '`') {
      const endTick = text.indexOf('`', j + 1);
      if (endTick > j + 1) {
        j = endTick + 1;
        continue;
      }
    }
    if (text.startsWith('**', j)) {
      while (text[j + 2] === '*') j++;
      if (j > start) return j;
    }
    j++;
  }
  return -1;
}

function findClosingSingleStar(text: string, start: number): number {
  let j = start;
  while (j < text.length) {
    if (text[j] === '`') {
      const endTick = text.indexOf('`', j + 1);
      if (endTick > j + 1) {
        j = endTick + 1;
        continue;
      }
    }
    if (text.startsWith('**', j)) {
      j += 2;
      continue;
    }
    if (text[j] === '*') {
      if (j > start) return j;
    }
    j++;
  }
  return -1;
}

function stripInlineMarkdown(text: string, depth = 0): string {
  if (depth >= 4) return text;
  let out = '';
  let i = 0;

  while (i < text.length) {
    if (text[i] === '`') {
      const close = text.indexOf('`', i + 1);
      if (close > i + 1) {
        out += text.slice(i + 1, close);
        i = close + 1;
        continue;
      }
    }

    if (text.startsWith('**', i)) {
      const close = findClosingDoubleStar(text, i + 2);
      if (close !== -1) {
        out += stripInlineMarkdown(text.slice(i + 2, close), depth + 1);
        i = close + 2;
        continue;
      }
    }

    if (text[i] === '*') {
      const close = findClosingSingleStar(text, i + 1);
      if (close !== -1) {
        out += stripInlineMarkdown(text.slice(i + 1, close), depth + 1);
        i = close + 1;
        continue;
      }
    }

    out += text[i];
    i++;
  }

  return out;
}

/** 공지 목록 표·배너 요약용으로 마크다운 기호(굵게, 기울임, 코드, 목록)를 벗긴 평문을 돌려준다. */
export function stripNoticeMarkdown(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (!inFence && FENCE_OPEN_RE.test(line)) {
      inFence = true;
      continue;
    }
    if (inFence) {
      if (FENCE_CLOSE_RE.test(line)) {
        inFence = false;
      } else {
        out.push(line);
      }
      continue;
    }

    const withoutList = line.replace(LIST_ITEM_RE, '$1');
    out.push(stripInlineMarkdown(withoutList));
  }

  return out.join('\n');
}
