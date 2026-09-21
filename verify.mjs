import vm from "node:vm";
import fs from "node:fs";
import assert from "node:assert/strict";

// 이 파일은 브라우저 없이 모든 장비와 원인 변형의 상태 전이를 빠르게 검사합니다.
// vm은 실제 사이트 JavaScript를 격리된 실행 공간에서 그대로 읽기 위해 사용합니다.
// 상태 전이와 장비별 문제 매핑을 검증합니다. 실제 화면은 브라우저에서 별도로 확인합니다.
// elements는 DOM 요소 대신 사용할 최소한의 가짜 화면 요소를 보관합니다.
const elements = new Map();
// 사이트 코드가 사용하는 속성과 메서드만 가진 가짜 HTML 요소입니다.
const element = () => ({
  innerHTML: "",
  textContent: "",
  style: {},
  classList: { toggle() {}, add() {}, remove() {} },
  setAttribute() {},
  querySelectorAll() {
    return [];
  },
});
// 등록된 WebMCP 도구를 모아 이름, 입력 제한과 실행 결과를 검사합니다.
const tools = [];
// document/window/타이머를 흉내 낸 실행 환경을 만듭니다.
const context = vm.createContext({
  document: {
    getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    querySelector: () => element(),
    querySelectorAll: () => [],
    modelContext: { registerTool: (t) => tools.push(t) },
  },
  window: { addEventListener() {} },
  setInterval: () => 1,
  clearInterval() {},
  Date,
  console,
  AbortController,
});
// 실제 브라우저와 동일한 script 순서로 네 파일을 실행합니다.
for (const file of ["equipment-data.js", "equipment-view.js", "service-console.js", "app.js"])
  vm.runInContext(fs.readFileSync(`dist/${file}`, "utf8"), context);
// 테스트에서 사용할 상태와 함수를 한 객체로 꺼냅니다.
const a = vm.runInContext(
  "({state,equipmentCatalog,selectEquipment,inject,ack,check,applyAction,verify,reset,readings,serviceReportText,startRandomSession,getScenarios:()=>scenarios})",
  context,
);
// 다섯 장비 → 모든 증상 → 각 원인 변형 순서로 완전한 훈련 흐름을 반복합니다.
let cases = 0;
let crossCases = 0;
for (const mode of Object.keys(a.equipmentCatalog)) {
  a.reset();
  a.selectEquipment(mode);
  assert.equal(a.state.mode, mode);
  assert.equal(a.state.selected, 0);
  const scenarios = a.getScenarios();
  assert.equal(new Set(scenarios.map((s) => s.id)).size, scenarios.length);
  if (a.equipmentCatalog[mode].nodes)
    for (const s of scenarios)
      assert.ok(a.equipmentCatalog[mode].nodes.some((n) => n[0] === s.part));
  for (let i = 0; i < scenarios.length; i++)
    for (const variant of scenarios[i].variants) {
      // 새 문제를 시작하고 진행 중 문제/장비 변경 방지와 알람 전 점검 방지를 확인합니다.
      a.reset();
      a.state.sound = false;
      a.inject(i);
      a.state.variant = variant;
      const scenario = scenarios[i];
      if (scenario.crossEquipment) {
        crossCases++;
        assert.equal(scenario.checks.length, 3);
        assert.equal(variant.results.length, 3);
        assert.equal(scenario.causes.length, 3);
        assert.equal(scenario.actions.length, 3);
        assert.ok(scenario.symptom.includes("교육용 가상 데이터"));
        assert.ok(variant.lesson.includes("탓이 아닌 이유"));
        assert.ok(a.readings().some((row) => row[4]));
        assert.ok(a.readings().some((row) => row[4] === false));
        assert.deepEqual(a.readings(), scenario.metrics);
        assert.ok(elements.get("workbench").innerHTML.includes("교육용 가상 데이터"));
      }
      assert.equal(a.state.stage, "alarm");
      assert.ok(elements.get("caseHeader").innerHTML.includes("SERVICE TICKET"));
      assert.ok(
        elements.get("trendChart").innerHTML.includes("ALARM") ||
          elements.get("trendChart").innerHTML.includes("polyline"),
      );
      assert.ok(elements.get("faultTree").innerHTML.includes("Alarm captured"));
      assert.ok(a.inject(i).error);
      assert.ok(a.selectEquipment(mode).error);
      a.check(0);
      assert.equal(a.state.checked.length, 0);
      a.verify();
      assert.equal(a.state.stage, "alarm");
      // 알람 확인 뒤 같은 점검을 두 번 눌러도 한 번만 기록되는지 확인합니다.
      a.ack();
      a.check(0);
      a.check(0);
      assert.equal(a.state.checked.length, 1);
      a.state.cause = String(variant.cause);
      a.state.action = String(variant.action);
      a.applyAction();
      assert.equal(a.state.attempts, 0);
      a.check(1);
      a.check(2);
      // 원인 오답과 조치 오답은 복구되지 않고 시도 횟수만 늘어나야 합니다.
      a.state.cause = String((variant.cause + 1) % 3);
      a.state.action = String(variant.action);
      a.applyAction();
      assert.equal(a.state.stage, "alarm");
      assert.equal(a.state.attempts, 1);
      if (scenario.crossEquipment) assert.ok(a.state.message.includes(variant.lesson));
      a.state.cause = String(variant.cause);
      a.state.action = String((variant.action + 1) % 3);
      a.applyAction();
      assert.equal(a.state.stage, "alarm");
      // 올바른 원인과 조치 뒤 재시험까지 해야 resolved 상태가 됩니다.
      a.state.action = String(variant.action);
      a.applyAction();
      assert.equal(a.state.stage, "repaired");
      assert.ok(a.inject(i).error);
      a.verify();
      assert.equal(a.state.stage, "resolved");
      assert.equal(a.state.attempts, 3);
      assert.ok(a.state.logs.at(-1).message.includes("PASS"));
      assert.ok(a.readings().every((m) => !m[4]));
      assert.ok(a.serviceReportText().includes("FIELD SERVICE REPORT"));
      assert.ok(a.serviceReportText().includes("ROOT CAUSE"));
      if (scenario.crossEquipment) {
        assert.deepEqual(a.readings(), scenario.normalMetrics);
        assert.ok(elements.get("workbench").innerHTML.includes("왜 다른 장비 탓이 아닌가"));
        assert.ok(a.serviceReportText().includes(variant.lesson));
        assert.ok(a.serviceReportText().includes("교육용 가상 데이터"));
      }
      cases++;
    }
}
assert.equal(crossCases, 3, "교차 장비 면접 사례는 정확히 3개여야 합니다.");
assert.equal(cases, 50);

// 면접 모드: 정보 요청 비용, 서술 답변, 고객 판단, 점수표와 복합 원인 Case를 검사합니다.
a.reset();
a.selectEquipment("EUV");
const compoundIndex = a.getScenarios().findIndex((s) => s.id === "euv-compound");
assert.ok(compoundIndex >= 0);
a.state.interviewMode = true;
a.inject(compoundIndex);
a.ack();
a.check(0);
a.check(1);
assert.equal(a.state.checked.length, 2);
assert.equal(a.state.evidenceCost, 3);
a.state.answer = {
  hypothesis: "EUV 에너지와 PEB 대기 시간의 복합 영향으로 판단합니다.",
  evidence: "독립 에너지 편차와 대기 시간 분할 시험 결과가 각각 재현됩니다.",
  exclusion: "현상 유량과 하부막 두께가 기준 내라 단독 원인에서 배제합니다.",
  next: "로트 HOLD 후 조건을 분리한 DOE와 공동 에스컬레이션을 진행합니다.",
};
a.state.productionDecision = "hold";
a.state.escalationDecision = "joint";
a.state.cause = "0";
a.state.action = "0";
a.applyAction();
assert.equal(a.state.stage, "repaired");
a.verify();
assert.equal(a.state.stage, "resolved");
assert.equal(a.state.score.total, 100);
assert.ok(elements.get("workbench").innerHTML.includes("면접 평가 점수"));
assert.ok(a.serviceReportText().includes("INTERVIEW SCORE"));

// 3-Case 랜덤 면접은 서로 다른 장비 3개를 계획하고 첫 Case를 즉시 시작합니다.
a.reset();
const session = a.startRandomSession();
assert.equal(session.cases.length, 3);
assert.equal(new Set(a.state.session.plan.map((x) => x.mode)).size, 3);
assert.equal(a.state.stage, "alarm");
assert.equal(a.state.interviewMode, true);
a.reset();
// 전체 반복 후 초기화, 잘못된 입력, WebMCP 장비 간 격리 규칙을 별도로 확인합니다.
a.reset();
assert.equal(a.state.logs.length, 0);
assert.equal(a.state.active, null);
assert.ok(a.inject(-1).error);
assert.ok(a.selectEquipment("invalid").error);
assert.equal(tools.length, 3);
const select = tools.find((t) => t.name === "select_training_equipment"),
  start = tools.find((t) => t.name === "start_fault_simulation"),
  read = tools.find((t) => t.name === "read_training_state");
select.execute({ mode: "DUV" });
assert.throws(() => start.execute({ scenario: "gas" }));
start.execute({ scenario: "duv-align" });
assert.equal(read.execute().alarm, "SIM-DUV-ALIGN");
assert.ok(select.execute({ mode: "TRACK" }).error);
assert.throws(() => start.execute({ scenario: "invalid" }));
a.reset();
select.execute({ mode: "PVD" });
start.execute({ scenario: "gas" });
assert.equal(read.execute().mode, "PVD");
// 모든 검사가 끝나면 실제로 통과한 훈련 흐름 수를 출력합니다.
console.log(
  `PASS: ${cases} journeys across 5 equipment profiles (including ${crossCases} cross-equipment interviews and 1 compound case), interview scoring, 3-case session planning, cause/action guards, reset and 3 tool contracts.`,
);

