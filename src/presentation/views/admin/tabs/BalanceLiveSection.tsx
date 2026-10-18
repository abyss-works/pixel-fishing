// 라이브 지표 구역 — 밸런스 탭에서 시뮬레이션 위에 놓이는 실측 지표 칸이다. 아직 연결된 조회가 없어서
// 자리와 안내 문구만 있다.
// 연결할 때는 다른 구역(바운티 퍼널 등)처럼 이 컴포넌트 안에서 기능 계층의 조회 훅을 호출하고,
// granted일 때만 조회한다. 그 전까지 이 구역은 아무것도 조회하지 않는다.
import Note from '../../../ui/Note';
import { Cell } from '../layout';

export default function BalanceLiveSection({ granted }: {
  /** 관리자 세션 여부 — 연결 뒤에는 이 값이 조회를 켠다 */
  granted: boolean;
}) {
  return (
    <Cell title="라이브 지표">
      <Note className="my-0">
        라이브 지표는 아직 연결되지 않았어요. 연결되면 이 자리에 표시돼요.
        {!granted && ' 운영 DB에 연결해야 채워져요.'}
      </Note>
    </Cell>
  );
}
