import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';

type Block =
  | { kind: 'code'; lines: string[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; lines: string[] };

const FENCE_OPEN_RE = /^```/;
const FENCE_CLOSE_RE = /^```\s*$/;
const LIST_ITEM_RE = /^[-*]\s+(.*)$/;
const INLINE_TOKEN_RE = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|`[^`\n]+?`)/g;

function parseBlocks(raw: string): Block[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
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

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(INLINE_TOKEN_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      out.push(text.slice(lastIndex, idx));
    }
    const token = match[0];
    const key = `${keyPrefix}-${tokenIndex++}`;
    if (token.startsWith('**') && token.endsWith('**')) {
      out.push(
        <strong key={key} className="font-bold">
          {renderInline(token.slice(2, -2), `${key}-b`)}
        </strong>,
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      out.push(
        <em key={key} className="italic">
          {renderInline(token.slice(1, -1), `${key}-i`)}
        </em>,
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      out.push(
        <code
          key={key}
          className="border border-line bg-bg px-1 font-mono text-[0.92em] text-accent break-all"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIndex = idx + token.length;
  }

  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
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
    const withoutInline = withoutList
      .replace(/`([^`\n]+?)`/g, '$1')
      .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
      .replace(/\*([^*\n]+?)\*/g, '$1');
    out.push(withoutInline);
  }

  return out.join('\n');
}

/** XSS 안전한 공지 전용 마크다운 렌더러. HTML 태그를 실행하지 않고 순수 React 노드로만 변환한다. */
export default function NoticeMarkdown({
  body,
  className,
}: {
  body: string;
  className?: string;
}) {
  const blocks = parseBlocks(body);

  return (
    <div className={cx('flex flex-col gap-1.5 text-xs leading-relaxed break-words', className)}>
      {blocks.map((block, blockIdx) => {
        if (block.kind === 'code') {
          return (
            <pre
              key={blockIdx}
              className="m-0 border border-line bg-bg px-2.5 py-2 font-mono text-2xs leading-relaxed text-text whitespace-pre-wrap break-words"
            >
              <code>{block.lines.join('\n')}</code>
            </pre>
          );
        }

        if (block.kind === 'list') {
          return (
            <ul key={blockIdx} className="m-0 list-disc pl-4 flex flex-col gap-0.5">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="break-words">
                  {renderInline(item, `l-${blockIdx}-${itemIdx}`)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIdx} className="m-0 break-words">
            {block.lines.map((line, lineIdx) => (
              <Fragment key={lineIdx}>
                {lineIdx > 0 && <br />}
                {renderInline(line, `p-${blockIdx}-${lineIdx}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
