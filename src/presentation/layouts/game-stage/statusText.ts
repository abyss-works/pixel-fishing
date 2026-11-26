// 낚시 상태 띠의 안내 문구 - 입력 장치 이름이 들어간 문구만 모바일에서 바뀐다.
// 판정 영역 규칙은 도움말과 스탯 창에서 설명하므로 상태 띠에는 매번 반복하지 않는다.
interface StatusParts { lead: string; judge?: string }

const STATUS = {
  wait: (device: string): StatusParts => ({ lead: `입질을 기다리는 중이에요.\n“!”가 뜨면 ${device} 눌러 주세요.` }),
  bite: (): StatusParts => ({ lead: '지금 눌러 주세요.' }),
  catch: (): StatusParts => ({ lead: '물고기를 끌어올리는 중이에요…' }),
};

export function statusParts(phase: keyof typeof STATUS, mobile: boolean): StatusParts {
  return STATUS[phase](mobile ? '화면을' : '스페이스를');
}
