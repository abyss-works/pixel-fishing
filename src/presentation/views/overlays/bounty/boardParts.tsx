import type { ReactNode } from 'react';
import { GAME_DAY_RESET_TEXT } from '../../../../game/rules/time.js';
import Button from '../../../ui/Button';
import Tip from '../../../ui/Tip';
import { fmtMinutes, fmtRatioTight } from '../../../ui/format';

// 수배판 카드(일반 의뢰, 네임드 토벌, 유물)가 함께 쓰는 조각.

/** 이름 왼쪽, 값 오른쪽의 줄 목록 — 카드 본문의 대상, 진행, 보상 같은 항목 */
export function BoardRows({ rows }: { rows: { key: string; label: ReactNode; value: ReactNode }[] }) {
  return (
    <ul className="list-none m-0 p-0 text-xs">
      {rows.map(r => (
        <li key={r.key} className="flex items-center justify-between gap-2 h-[26px] border-t border-line/60 first:border-t-0">
          <span className="text-text-dim shrink-0">{r.label}</span>
          <span className="min-w-0 truncate text-right">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** 수주 버튼 — 누를 수 없는 이유가 있으면 그 이유를, 없으면 수주 규칙 설명(있을 때)을 툴팁으로 보인다 */
export function AcceptButton({ disabled, reason, help, onClick }: {
  disabled: boolean; reason: string | null; help?: string; onClick: () => void;
}) {
  const button = <Button variant="primary" full disabled={disabled} onClick={onClick}>수주</Button>;
  const tip = reason ?? help;
  return tip ? <Tip wraps text={tip} className="block">{button}</Tip> : button;
}

/** 진행 막대와 "진행/목표" - 수배판 일반 의뢰 카드와 의뢰 창 카드가 함께 쓴다 */
export function ProgressMeter({ progress, count }: { progress: number; count: number }) {
  const shown = Math.min(progress, count);
  return (
    <div className="flex items-center gap-2 h-3.5">
      <span className="block flex-1 h-2 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]" role="meter"
            aria-label="진행" aria-valuemin={0} aria-valuemax={count} aria-valuenow={shown}>
        <span className="block h-full bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
              style={{ width: `${(shown / count) * 100}%` }} />
      </span>
      <span className="pf-accent text-2xs">{shown}/{count}</span>
    </div>
  );
}

/** 오늘 남은 클리어(일반 의뢰, 네임드 토벌) - 고정 정보 줄에 놓는 세 조각. 스냅샷이 오기 전에는 값 자리에 -를 둔다.
 *  초기화 시각과 클리어 기준은 이름의 툴팁이다 */
export function ClearsLeft({ leftAll, leftNamed, dailyCap, namedDailyCap, first, shortLabels }: {
  leftAll: number | null; leftNamed: number | null; dailyCap: number; namedDailyCap: number;
  /** 줄 맨 앞이면 이름 왼쪽에 구분선을 두지 않는다 */
  first?: boolean;
  /** 값 이름을 메뉴 줄의 의뢰 배지처럼 "일반", "네임드"로 줄인다 */
  shortLabels?: boolean;
}) {
  const left = fmtRatioTight;
  return (
    <>
      <span className={first ? 'text-text-dim' : 'pl-3 border-l border-line text-text-dim'}>
        <Tip text={<>보상을 받으면 클리어 1번이에요.<br />조건을 채우지 못한 의뢰는 {GAME_DAY_RESET_TEXT}에 사라져요.</>}>오늘 남은 클리어</Tip>
      </span>
      <span className="flex items-baseline gap-2">
        <span className="text-text-dim">{shortLabels ? '일반' : '일반 의뢰'}</span>
        <span className="pf-accent" aria-label="오늘 남은 일반 의뢰">{left(leftAll, dailyCap)}</span>
      </span>
      <span className="flex items-baseline gap-2 pl-3 border-l border-line">
        <span className="text-text-dim">{shortLabels ? '네임드' : '네임드 토벌'}</span>
        <span className="pf-accent" aria-label="오늘 남은 네임드 토벌">{left(leftNamed, namedDailyCap)}</span>
      </span>
    </>
  );
}

/** 흔적 남은 시간 - 라벨 "흔적", 설명 툴팁, 남은 분. 수배판과 의뢰 창의 네임드 카드가 함께 쓴다.
 *  도전권은 규칙 용어라 화면에 쓰지 않는다 */
export function TraceTime({ mins }: { mins: number }) {
  return (
    <span className="text-xs text-text-dim whitespace-nowrap">
      <Tip text={'흔적이 남아 있어요.\n이 구역 바다로 나가 흔적 카드의 추적을 눌러 보세요.'}>흔적</Tip>
      {' '}<span className="pf-accent text-text">{fmtMinutes(mins)}</span>
    </span>
  );
}

/** 네임드 카드 머리 줄 - 왼쪽에 대상 이름(titleTip이 있으면 이름의 툴팁), 오른쪽에 흔적 남은 시간(있을 때만) */
export function NamedCardHead({ title, titleTip, traceMins }: {
  title: string; titleTip?: ReactNode; traceMins: number | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 h-6">
      <b className="text-base text-epic truncate">{titleTip ? <Tip text={titleTip}>{title}</Tip> : title}</b>
      {traceMins !== null && <TraceTime mins={traceMins} />}
    </div>
  );
}
