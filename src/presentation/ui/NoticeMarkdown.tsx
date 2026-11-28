import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { parseNoticeBlocks } from './noticeMarkdownText';

const MAX_INLINE_DEPTH = 4;

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

function renderInline(text: string, keyPrefix: string, depth = 0): ReactNode[] {
  if (depth >= MAX_INLINE_DEPTH) return [text];

  const out: ReactNode[] = [];
  let plain = '';
  let tokenIndex = 0;
  let i = 0;

  const flushPlain = () => {
    if (plain.length > 0) {
      out.push(plain);
      plain = '';
    }
  };

  while (i < text.length) {
    if (text[i] === '`') {
      const close = text.indexOf('`', i + 1);
      if (close > i + 1) {
        flushPlain();
        const key = `${keyPrefix}-${tokenIndex++}`;
        out.push(
          <code
            key={key}
            className="border border-line bg-bg px-1 font-mono text-[0.92em] text-accent break-all"
          >
            {text.slice(i + 1, close)}
          </code>,
        );
        i = close + 1;
        continue;
      }
    }

    if (text.startsWith('**', i)) {
      const close = findClosingDoubleStar(text, i + 2);
      if (close !== -1) {
        flushPlain();
        const key = `${keyPrefix}-${tokenIndex++}`;
        out.push(
          <strong key={key} className="font-bold">
            {renderInline(text.slice(i + 2, close), `${key}-b`, depth + 1)}
          </strong>,
        );
        i = close + 2;
        continue;
      }
    }

    if (text[i] === '*') {
      const close = findClosingSingleStar(text, i + 1);
      if (close !== -1) {
        flushPlain();
        const key = `${keyPrefix}-${tokenIndex++}`;
        out.push(
          <em key={key} className="italic">
            {renderInline(text.slice(i + 1, close), `${key}-i`, depth + 1)}
          </em>,
        );
        i = close + 1;
        continue;
      }
    }

    plain += text[i];
    i++;
  }

  flushPlain();
  return out;
}

/** XSS 안전한 공지 전용 마크다운 렌더러. HTML 태그를 실행하지 않고 순수 React 노드로만 변환한다. */
export default function NoticeMarkdown({
  body,
  className,
}: {
  body: string;
  className?: string;
}) {
  const blocks = parseNoticeBlocks(body);

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
