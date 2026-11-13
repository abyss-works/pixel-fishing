// 플레이 흐름 시뮬레이션 CLI — 해역 전환, 해역별 누적 실질 낚시 시간과 8시간 환산 일수, 최초 10분, 예외 흐름, 방치 EV, 게이트 검사, 몬테카를로 분포, 이동 시간 관측, 요리 효과, 진행 업적 보상.
// 사용: pnpm balance:flow [transition|days|opening|exception|ev|gates|dist|travel|effects|window|recipes|achievements] [--override 파일] [--json] [--legend-at N] [--axis idle|manual] [--max-days N] [--seed N] [--trials N] [effects 옵션: --bite --rare --variant --size --move --named --margin --units] [--help]
// 제품 규칙을 그대로 불러 계산하며, 같은 인자의 출력은 항상 같다(dist는 시드 고정). gates는 위반이 있으면 종료 코드 1로 끝난다.
import { runCli } from './balance/flow/report';

const { stdout, stderr, exitCode } = runCli(process.argv.slice(2));
if (stdout) console.log(stdout);
if (stderr) console.error(stderr);
process.exitCode = exitCode;
