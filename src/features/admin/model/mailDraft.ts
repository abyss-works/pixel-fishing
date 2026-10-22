// 관리자 우편 작성 — 받는 사람 입력을 보내기 요청의 대상으로 읽는다.
// 한 줄에 한 사람이고 "계정 id 골드"(공백 또는 쉼표 구분)다. 골드를 생략하면 0이다. 빈 줄은 건너뛴다.

export interface RecipientParse {
  recipients: { userId: string; gold: number }[];
  /** 형태가 틀린 줄 번호(1부터) */
  badLines: number[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRecipients(text: string): RecipientParse {
  const recipients: RecipientParse['recipients'] = [];
  const badLines: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const [userId, goldText, ...rest] = line.split(/[\s,]+/);
    const gold = goldText === undefined ? 0 : Number(goldText);
    if (rest.length > 0 || !UUID.test(userId) || !Number.isSafeInteger(gold) || gold < 0) {
      badLines.push(i + 1);
      return;
    }
    recipients.push({ userId, gold });
  });
  return { recipients, badLines };
}

/** 미리보기·보내기에서 서버가 돌려준 형태 문제를 안내 문장으로 바꾼다 */
export const MAIL_PROBLEM_TEXT: Record<string, string> = {
  title: '제목은 1~60자여야 해요.',
  body: '본문은 1~2,000자여야 해요.',
  gold: '골드는 0 이상 10억 이하의 정수여야 해요.',
  recipients: '받는 사람이 없거나 계정 id 형식이 틀렸어요.',
  duplicate: '같은 계정이 두 번 들어 있어요.',
};
