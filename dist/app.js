"use strict";
// 이 파일은 훈련의 상태 전이와 사용자 조작을 담당합니다.
// 읽는 순서: 데이터 → 상태 → 알람/판정 함수 → 화면 렌더링 → 이벤트/WebMCP 연결입니다.
// HTML의 id로 요소를 찾는 단축 함수입니다. 예: $("status")는 상태 표시 영역입니다.
const $ = (id) => document.getElementById(id);
// 1. 훈련 데이터: 증상 6종 × 원인 변형 2개입니다. 모든 계측값과 판정은 교육용입니다.
// checks: 점검 항목, causes/actions: 선택지, variants: 무작위로 선택할 문제입니다.
// variant의 cause/action은 정답 선택지의 0부터 시작하는 번호입니다.
// results는 항목별 점검 결과, bad는 강조할 결과 번호, lesson은 복구 후 해설입니다.
const depositionScenarios = [
  // 증착 문제 1: 실제 챔버 누설과 배기 밸브 미개방을 구분합니다.
  {
    id: "vac",
    code: "SIM-VAC-01",
    name: "진공 도달 시간 초과",
    system: "진공 계통",
    summary: "목표 압력에 도달하지 못함",
    part: "vacuum",
    symptom: "Pump-down 제한 시간 90초를 초과했습니다. 다음 공정 진행이 차단되었습니다.",
    checks: [
      "펌프 운전 상태와 전류 확인",
      "밸브 피드백과 배기 경로 확인",
      "격리 압력 상승 시험 기록 확인",
    ],
    causes: ["챔버 씰 누설", "배기 밸브 미개방", "진공 센서 통신 불량"],
    actions: [
      "안전 격리 후 씰 점검·교체 의뢰",
      "안전 격리 후 배기 밸브 구동부 점검 의뢰",
      "압력계 통신 경로 점검 의뢰",
    ],
    variants: [
      {
        cause: 0,
        action: 0,
        results: [
          "펌프 RUN 신호와 모터 전류가 정상입니다.",
          "배기 밸브 OPEN 명령과 위치 피드백이 일치합니다.",
          "가스 차단·배기 격리 기록에서 압력이 빠르게 상승합니다. 씰 주변 누설 시험 양성입니다.",
        ],
        bad: 2,
        lesson:
          "펌프가 정상이어도 누설은 배기 도달을 방해합니다. 압력 상승만으로 단정하지 않고 누설 시험 결과까지 확인했습니다.",
      },
      {
        cause: 1,
        action: 1,
        results: [
          "펌프 RUN 신호와 모터 전류가 정상입니다.",
          "OPEN 명령에도 CLOSED 피드백이 유지됩니다. 구동부 응답이 없습니다.",
          "직전 기밀 시험은 합격입니다. 현재 배기 경로가 확보되지 않아 도달 시험을 완료할 수 없습니다.",
        ],
        bad: 1,
        lesson: "펌프 자체뿐 아니라 챔버에서 펌프까지의 배기 경로도 확인해야 합니다.",
      },
    ],
  },
  // 증착 문제 2: 상류 공급 압력과 MFC 영점 문제를 구분합니다.
  {
    id: "gas",
    code: "SIM-GAS-02",
    name: "가스 유량 편차",
    system: "가스 계통",
    summary: "설정 유량과 실제 유량 불일치",
    part: "gas",
    symptom: "MFC 피드백이 설정 유량 허용 범위를 벗어났습니다. 가스 공급과 RF가 차단된 상태입니다.",
    checks: [
      "MFC 설정값·실측값과 통신 상태 확인",
      "상류 공급 압력과 밸브 상태 확인",
      "차단 조건에서 영점 검증 기록 확인",
    ],
    causes: ["상류 가스 공급 압력 부족", "MFC 영점 오프셋", "RF 매칭 불량"],
    actions: [
      "가스 담당자에게 공급 압력 계통 점검 의뢰",
      "승인 절차에 따른 MFC 영점·교정 의뢰",
      "RF 매칭 네트워크 점검 의뢰",
    ],
    variants: [
      {
        cause: 0,
        action: 0,
        results: [
          "설정 유량 대비 실측 유량이 낮습니다. 통신과 전원은 정상입니다.",
          "상류 압력이 승인 범위 미만입니다. 공급 밸브 OPEN 피드백은 정상입니다.",
          "승인된 무유량 조건의 영점 기록이 정상입니다.",
        ],
        bad: 1,
        lesson:
          "유량 미달은 MFC 고장만을 뜻하지 않습니다. 공급 압력과 필요한 차압이 확보되는지 확인합니다.",
      },
      {
        cause: 1,
        action: 1,
        results: [
          "설정값과 실측값 사이에 일정한 편차가 있습니다. 통신은 정상입니다.",
          "상류 압력과 밸브 피드백이 정상입니다.",
          "검증된 무유량 조건에서도 +12 sccm이 표시됩니다.",
        ],
        bad: 2,
        lesson:
          "정상 공급 조건에서 무유량 영점이 어긋나면 센서 영점·교정 상태를 점검합니다. 임의로 공정 설정을 바꾸어 보상하지 않습니다.",
      },
    ],
  },
  // 증착 문제 3: RF 매칭 구동과 압력 제어 진동을 구분합니다.
  {
    id: "rf",
    code: "SIM-RF-03",
    name: "RF 반사 전력 상승",
    system: "플라즈마 계통",
    summary: "플라즈마 전달 전력 불안정",
    part: "rf",
    symptom: "반사 전력이 훈련 기준 50 W를 초과했습니다. RF 출력이 보호 정지되었습니다.",
    checks: [
      "트립 직전 순방향·반사 전력 추세 확인",
      "매칭 네트워크 응답 로그 확인",
      "동시점 챔버 압력과 가스 추세 확인",
    ],
    causes: ["매칭 네트워크 구동 오류", "공정 압력 제어 불안정", "냉각수 필터 막힘"],
    actions: [
      "RF 전원 격리 후 매칭 구동부 점검 의뢰",
      "압력 제어 밸브와 제어 루프 점검 의뢰",
      "냉각 회로 정비 의뢰",
    ],
    variants: [
      {
        cause: 0,
        action: 0,
        results: [
          "순방향 300 W 명령 중 반사 전력이 85 W까지 증가했습니다.",
          "튜닝 명령 변화에도 매칭 위치가 고정되며 구동 오류가 기록됩니다.",
          "압력과 유량 추세가 허용 범위 안에서 안정적입니다.",
        ],
        bad: 1,
        lesson:
          "RF 반사 전력은 부하 정합의 단서입니다. 공정 조건과 매칭 구동 응답을 연계해 원인을 좁힙니다.",
      },
      {
        cause: 1,
        action: 1,
        results: [
          "순방향 설정은 일정하나 반사 전력 피크가 반복됩니다.",
          "매칭 위치는 변화하며 구동 오류는 없습니다.",
          "가스 유량은 안정적이나 압력 제어 밸브 위치와 압력에 반복 진동이 나타납니다.",
        ],
        bad: 2,
        lesson:
          "반사 전력 상승이 항상 RF 전원 고장은 아닙니다. 압력 변화로 플라즈마 부하가 변하는 경우도 검토합니다.",
      },
    ],
  },
  // 증착 문제 4: 실제 냉각 유량 저하와 센서 오지시를 구분합니다.
  {
    id: "cool",
    code: "SIM-CL-04",
    name: "냉각수 유량 부족",
    system: "냉각 계통",
    summary: "냉각 인터록 발생",
    part: "cooling",
    symptom: "냉각수 유량이 훈련 하한 2.0 L/min 미만입니다. RF와 가열 출력이 보호 차단되었습니다.",
    checks: ["냉각기 운전 상태 확인", "필터 전후 차압 기록 확인", "유량 센서와 독립 유량계 비교"],
    causes: ["냉각수 필터 막힘", "유량 센서 오지시", "챔버 씰 누설"],
    actions: [
      "냉각 회로 격리 후 필터 정비 의뢰",
      "냉각 회로 격리 후 유량 센서 검증·교체 의뢰",
      "챔버 씰 정비 의뢰",
    ],
    variants: [
      {
        cause: 0,
        action: 0,
        results: [
          "냉각기 RUN 상태입니다. 저장조 수위와 공급 온도는 정상입니다.",
          "필터 전후 차압이 정비 기준 이상입니다.",
          "장비 센서와 독립 유량계 모두 약 0.8 L/min을 표시합니다.",
        ],
        bad: 1,
        lesson:
          "독립 측정에서도 유량이 낮으면 실제 공급 문제를 의심합니다. 필터 차압으로 유로 제한을 확인할 수 있습니다.",
      },
      {
        cause: 1,
        action: 1,
        results: [
          "냉각기 운전과 공급 온도가 정상입니다.",
          "필터 차압이 정상 범위입니다.",
          "장비 센서는 0.8 L/min, 독립 유량계는 정상 3.2 L/min을 표시합니다.",
        ],
        bad: 2,
        lesson:
          "센서 표시와 실제 유량 부족은 다를 수 있습니다. 독립 계측으로 검증하되 인터록을 우회하지 않습니다.",
      },
    ],
  },
  // 증착 문제 5: 게이트 밸브 공압과 위치 센서 문제를 구분합니다.
  {
    id: "gate",
    code: "SIM-GV-05",
    name: "게이트 밸브 응답 없음",
    system: "이송 계통",
    summary: "밸브 위치 확인 시간 초과",
    part: "gate",
    symptom: "게이트 밸브 위치 확인이 제한 시간을 초과했습니다. 웨이퍼 이송이 정지되었습니다.",
    checks: [
      "챔버·로드록 차압과 이송 허가 확인",
      "공압 공급 상태 확인",
      "밸브 명령·위치 센서 기록 비교",
    ],
    causes: ["밸브 구동 공압 부족", "밸브 위치 센서 불량", "로드록 압력 불일치"],
    actions: [
      "에너지 격리 후 공압 계통 점검 의뢰",
      "에너지 격리 후 위치 센서 검증 의뢰",
      "승인 절차에 따른 로드록 압력 제어 점검 의뢰",
    ],
    variants: [
      {
        cause: 0,
        action: 0,
        results: [
          "차압이 허용 범위이며 이송 허가 조건을 만족합니다.",
          "공압 공급 압력이 승인된 구동 범위 미만입니다.",
          "OPEN 명령에도 실제 미동작이 확인되며 CLOSED 피드백을 유지합니다.",
        ],
        bad: 1,
        lesson:
          "위치 확인 오류에는 구동 에너지 부족이 포함됩니다. 공압과 실제 움직임을 확인해 센서 문제와 구별합니다.",
      },
      {
        cause: 1,
        action: 1,
        results: [
          "차압과 이송 허가 조건이 정상입니다.",
          "공압 공급이 승인 범위입니다.",
          "승인된 점검 기록에서 실제 개방이 확인되었으나 OPEN 센서 신호가 없습니다.",
        ],
        bad: 2,
        lesson:
          "명령·실제 위치·센서 피드백을 나누어 확인합니다. 위치 확인 전 강제로 이송을 재개하지 않습니다.",
      },
    ],
  },
  // 증착 문제 6: 히터 출력 회로와 온도 센서 문제를 구분합니다.
  {
    id: "temp",
    code: "SIM-TH-06",
    name: "기판 온도 편차",
    system: "온도 계통",
    summary: "온도 안정화 조건 미충족",
    part: "chamber",
    symptom:
      "기판 온도가 훈련 허용 범위를 벗어났습니다. 온도 안정화와 후속 증착 단계가 차단되었습니다.",
    checks: [
      "설정 온도와 제어기 출력 확인",
      "히터 출력 명령·전류 기록 비교",
      "온도 센서와 기준 계측값 비교",
    ],
    causes: ["히터 출력 회로 단선", "온도 센서 오지시", "가스 공급 압력 부족"],
    actions: [
      "전기 에너지 격리 후 히터 회로 점검 의뢰",
      "온도 센서 검증·교정 의뢰",
      "가스 공급 계통 점검 의뢰",
    ],
    variants: [
      {
        cause: 0,
        action: 0,
        results: [
          "온도가 목표보다 낮아 제어기가 가열 출력을 요구합니다.",
          "출력 명령은 있으나 히터 전류가 0 A입니다. 보호 계통 점검 후 회로 단선 기록이 확인됩니다.",
          "장비 센서와 기준 계측값이 모두 목표 미만으로 일치합니다.",
        ],
        bad: 1,
        lesson:
          "출력 명령과 실제 에너지 전달은 다릅니다. 명령·전류·독립 온도 측정을 함께 확인합니다.",
      },
      {
        cause: 1,
        action: 1,
        results: [
          "장비 표시가 목표보다 낮아 가열 요구가 발생했습니다.",
          "히터 출력 명령에 따른 전류 응답이 확인됩니다.",
          "장비 센서는 목표 미만이나 기준 계측값은 목표 부근입니다. 센서 편차가 확인됩니다.",
        ],
        bad: 2,
        lesson:
          "기준 계측과의 차이로 센서 문제를 분리합니다. 센서 이상 상태에서 가열을 계속하지 않습니다.",
      },
    ],
  },
];
// 선택한 장비가 바뀌면 이 배열도 해당 장비의 시나리오 배열로 교체됩니다.
let scenarios = lithographyScenarios.DUV;

// 2. 증착 장비 구조도에서 부품을 선택했을 때 보여주는 설명입니다.
const parts = {
  gas: "MFC는 가스 질량 유량을 설정값에 맞춥니다. 공급 압력, 실제 유량, 영점과 통신 상태를 함께 확인합니다.",
  rf: "RF 전원은 플라즈마에 에너지를 공급합니다. 매칭 네트워크는 부하와 전원의 임피던스를 정합하여 반사 전력을 줄입니다.",
  chamber:
    "PECVD는 샤워헤드로 가스를 분배하고 가열 전극 위 기판에 박막을 형성합니다. PVD 모델은 타깃과 가열 기판 홀더를 사용합니다.",
  vacuum:
    "펌프와 배기 밸브는 공기를 배기하고 공정 압력 형성을 돕습니다. 누설·배기 경로 문제 등을 구분해서 점검합니다.",
  cooling:
    "냉각 회로는 장비 부품의 열을 제거합니다. PVD에서는 타깃 냉각도 중요합니다. 인터록과 독립 측정값을 비교하세요.",
  gate: "로드록은 외부와 진공 공간 사이에서 웨이퍼를 전달합니다. 게이트 밸브는 차압·위치 피드백·이송 허가 조건에 연동됩니다.",
};
// 학습 자료 목록: [표시 이름, 설명, 원문 주소] 순서입니다.
const sources = [
  [
    "Oxford Instruments · PECVD 원리",
    "샤워헤드, RF 상부 전극, 가열 기판 구조",
    "https://plasma.oxinst.com/technologies/pecvd",
  ],
  [
    "Pfeiffer Vacuum · 진공 펌프 매뉴얼",
    "누설·도달 압력·펌프 상태 점검 원리",
    "https://www.pfeiffer-vacuum.com/in/assets/121256/1/PU0110BEN_C.pdf",
  ],
  [
    "Brooks Instrument · MFC 매뉴얼",
    "유량 오차와 공급 차압 점검",
    "https://cms.brooksinstrument.com/-/media/brooks/documentation/products/mass-flow-controllers/elastomer-sealed/slamf/installation-manual-slamf.pdf?hash=8a23aa61e58843994b7cd7ace1fa8217&sc_lang=en",
  ],
  [
    "MKS · RF 전달 및 매칭",
    "플라즈마 전원과 매칭 네트워크의 역할",
    "https://www.mks.com/n/pulsed-radio-frequency-rf-solution-for-critical-processes",
  ],
  [
    "MKS · Dynamic Frequency Tuning",
    "압력 변화와 반사 전력의 관계",
    "https://www.mks.com/n/dynamic-frequency-tuning",
  ],
  [
    "Kurt J. Lesker · 스퍼터 소스 진단",
    "베이스 압력·점화 압력·냉각수 등 진단 항목",
    "https://www.lesker.com/process-equipment-division/service-and-support/sputter-source-diagnostics-form.cfm",
  ],
  [
    "Kurt J. Lesker · 타깃 냉각",
    "냉각 회로 침전물과 유량 제한·과열",
    "https://www.lesker.com/newweb/faqs/question.cfm?id=466",
  ],
];
// 3. 현재 훈련 상태를 한곳에서 관리합니다. 새로고침하면 초기화됩니다.
// stage: ready(대기) → alarm(고장) → repaired(조치 완료) → resolved(복구 검증 완료)
// ack는 알람 확인 여부, checked는 완료한 점검 번호, cause/action은 사용자 선택입니다.
const state = {
  // mode/selected는 현재 장비와 시나리오 목록 번호입니다.
  mode: "DUV",
  selected: 0,
  // active/variant는 실행 중인 증상과 무작위 원인 변형입니다.
  active: null,
  variant: null,
  stage: "ready",
  // checked에는 사용자가 연 점검 결과의 번호가 들어갑니다.
  checked: [],
  ack: false,
  cause: "",
  action: "",
  attempts: 0,
  sound: true,
  // logs는 시간순 이벤트, message/messageType은 화면 판정 안내입니다.
  logs: [],
  message: "",
  messageType: "",
  // started/elapsed는 훈련 시작 시각과 완료까지 걸린 초입니다.
  started: 0,
  elapsed: 0,
  // 면접 모드는 서술 답변·의사결정·점수표를 추가합니다.
  interviewMode: false,
  answer: { hypothesis: "", evidence: "", exclusion: "", next: "" },
  productionDecision: "",
  escalationDecision: "",
  evidenceCost: 0,
  score: null,
  session: { active: false, plan: [], position: 0, results: [] },
};
// 소리 생성기와 반복 경보 타이머를 보관합니다.
let audioContext, alarmTimer;
// 시간과 메시지를 기록한 뒤 이벤트 로그 화면을 갱신합니다.
function log(message, type = "") {
  // 24시간제 현재 시각과 메시지를 한 묶음으로 저장합니다.
  state.logs.push({
    time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
    message,
    type,
  });
  renderLogs();
}
// 이벤트를 시간순으로 표시하고 최신 기록이 보이도록 스크롤합니다.
function renderLogs() {
  $("eventLog").innerHTML = state.logs.length
    ? state.logs
        .map(
          (x) => /* HTML */ `
            <div class="${x.type}">
              <time>${x.time}</time>
              <span>${x.message}</span>
            </div>
          `,
        )
        .join("")
    : /* HTML */ `
        <div>
          <time>READY</time>
          <span>Case 접수 대기 중입니다.</span>
        </div>
      `;
  $("eventLog").scrollTop = $("eventLog").scrollHeight;
}
// 4. 브라우저 오디오로 짧은 경보음을 만듭니다. 음소거·확인 후에는 재생하지 않습니다.
function beep() {
  // 브라우저 정책상 첫 사용자 조작 뒤에만 AudioContext가 정상적으로 시작됩니다.
  if (!state.sound || state.ack || state.stage !== "alarm") return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume().catch(() => {});
    const o = audioContext.createOscillator(),
      g = audioContext.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(720, audioContext.currentTime);
    o.frequency.setValueAtTime(920, audioContext.currentTime + 0.15);
    g.gain.setValueAtTime(0.07, audioContext.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.4);
    o.connect(g);
    g.connect(audioContext.destination);
    o.start();
    o.stop(audioContext.currentTime + 0.42);
  } catch {
    $("sound").textContent = "소리 사용 불가";
  }
}
// 반복 소리만 멈춥니다. 고장 상태를 복구하는 함수가 아닙니다.
function stopAlarm() {
  clearInterval(alarmTimer);
  alarmTimer = null;
}
// 고장 점검 또는 복구 검증 중에는 문제와 장비를 바꿀 수 없습니다.
function busy() {
  return state.stage === "alarm" || state.stage === "repaired";
}
function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function requiredEvidenceCount() {
  return state.interviewMode ? 2 : 3;
}
function interviewReady() {
  if (!state.interviewMode) return true;
  return (
    Object.values(state.answer).every((v) => v.trim().length >= 8) &&
    state.productionDecision !== "" &&
    state.escalationDecision !== ""
  );
}
function calculateScore() {
  const answerLengths = Object.values(state.answer).map((v) => v.trim().length);
  const writing = answerLengths.reduce((sum, n) => sum + (n >= 20 ? 5 : n >= 8 ? 3 : 0), 0);
  const evidence = Math.max(6, 15 - Math.max(0, state.evidenceCost - 4) * 2);
  const communication =
    (state.productionDecision === "hold" ? 10 : 0) +
    (state.escalationDecision === "joint" || state.escalationDecision === "specialist" ? 10 : 0);
  const effectiveSeconds = state.elapsed + state.evidenceCost * 60;
  const speed = effectiveSeconds <= 360 ? 15 : effectiveSeconds <= 600 ? 11 : effectiveSeconds <= 900 ? 8 : 4;
  return {
    total: 30 + evidence + writing + communication + speed,
    diagnosis: 30,
    evidence,
    writing,
    communication,
    speed,
    effectiveSeconds,
  };
}
function allScenarioEntries() {
  return Object.keys(equipmentCatalog).flatMap((mode) =>
    (lithographyScenarios[mode] || depositionScenarios).map((scenario, index) => ({ mode, index, id: scenario.id })),
  );
}
function launchSessionCase() {
  const item = state.session.plan[state.session.position];
  if (!item) return;
  state.session.active = true;
  if (state.mode !== item.mode) selectEquipment(item.mode);
  state.selected = item.index;
  inject(item.index);
}
function startRandomSession() {
  if (busy()) return { error: "진행 중인 Case를 먼저 완료하세요." };
  const shuffled = allScenarioEntries().sort(() => Math.random() - 0.5);
  const chosen = [];
  for (const item of shuffled) {
    if (!chosen.some((x) => x.mode === item.mode)) chosen.push(item);
    if (chosen.length === 3) break;
  }
  state.interviewMode = true;
  state.session = { active: true, plan: chosen, position: 0, results: [] };
  launchSessionCase();
  return { cases: chosen.map((x) => x.id) };
}
function nextSessionCase() {
  if (!state.session.active || state.stage !== "resolved") return;
  state.session.position++;
  if (state.session.position >= state.session.plan.length) {
    state.session.active = false;
    render();
    return;
  }
  reset(true);
  launchSessionCase();
}
// 5. 선택한 증상의 원인을 무작위로 정하고 새 훈련과 경보를 시작합니다.
function inject(index = state.selected) {
  // 잘못된 번호나 이미 진행 중인 훈련은 기존 상태를 보존하고 오류를 반환합니다.
  if (busy()) return { error: "진행 중인 훈련을 먼저 완료하세요." };
  if (!Number.isInteger(index) || !scenarios[index])
    return { error: "유효하지 않은 시나리오입니다." };
  state.selected = index;
  state.active = scenarios[index];
  // 같은 증상 안의 두 원인 중 하나를 매번 무작위로 선택합니다.
  state.variant = state.active.variants[Math.floor(Math.random() * state.active.variants.length)];
  Object.assign(state, {
    stage: "alarm",
    checked: [],
    ack: false,
    cause: "",
    action: "",
    attempts: 0,
    message: "",
    messageType: "",
    started: Date.now(),
    elapsed: 0,
    answer: { hypothesis: "", evidence: "", exclusion: "", next: "" },
    productionDecision: "",
    escalationDecision: "",
    evidenceCost: 0,
    score: null,
    logs: [],
  });
  log(`Case 접수 · ${state.mode} / ${state.active.code} · ${state.active.name}`, "log-alarm");
  log("Production HOLD · 알람 수신 당시 계측값을 보존했습니다.");
  render();
  stopAlarm();
  beep();
  alarmTimer = setInterval(beep, 2400);
  return { status: state.stage, code: state.active.code };
}
// 알람을 확인하면 소리를 멈추고 점검을 허용합니다. 인터록은 유지합니다.
function ack() {
  if (state.stage !== "alarm" || state.ack) return;
  state.ack = true;
  stopAlarm();
  log("Alarm acknowledged · 경보음 정지. 장비 HOLD는 유지됩니다.");
  render();
}
// 점검 결과를 한 번만 공개합니다. 알람 확인 전의 점검은 허용하지 않습니다.
function check(index) {
  if (
    !state.ack ||
    state.stage !== "alarm" ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 3 ||
    state.checked.includes(index)
  )
    return;
  state.checked.push(index);
  state.evidenceCost += state.active.evidenceCosts?.[index] || index + 1;
  log(`Evidence ${index + 1} 확보 · ${state.active.checks[index]}`);
  state.message = "";
  render();
}
// 6. 세 항목을 모두 점검한 뒤 원인과 조치가 함께 맞는지 판정합니다.
// 오답은 고장을 유지하고 재시도를 기록합니다. 정답도 별도 복구 검증이 필요합니다.
function applyAction() {
  // 점검을 모두 열기 전에는 추측만으로 정비 조치를 실행할 수 없습니다.
  if (
    state.stage !== "alarm" ||
    !state.ack ||
    state.checked.length < requiredEvidenceCount() ||
    state.cause === "" ||
    state.action === "" ||
    !interviewReady()
  )
    return;
  state.attempts++;
  if (
    Number(state.cause) !== state.variant.cause ||
    Number(state.action) !== state.variant.action
  ) {
    state.message =
      "선택한 원인·조치 조합으로는 이상이 해소되지 않았습니다. 정상인 계통과 이상인 계통을 다시 비교하세요.";
    if (state.active.crossEquipment) state.message += ` ${state.variant.lesson}`;
    state.messageType = "error";
    log(`Corrective Action ${state.attempts} · 이상 지속`, "log-alarm");
    render();
    return;
  }
  state.stage = "repaired";
  state.message =
    "선택한 정비가 시뮬레이션에서 완료되었습니다. 복구 검증으로 재시험과 인터록 해제를 확인하세요.";
  state.messageType = "success";
  log("Corrective Action 완료 · Verification 대기");
  render();
}
// 조치 완료 상태에서만 재시험을 통과시켜 복구하고 경과 시간을 기록합니다.
function verify() {
  if (state.stage !== "repaired") return;
  state.stage = "resolved";
  state.elapsed = Math.round((Date.now() - state.started) / 1000);
  if (state.interviewMode) {
    state.score = calculateScore();
    if (state.session.active)
      state.session.results.push({
        code: state.active.code,
        mode: state.mode,
        score: state.score.total,
        time: state.score.effectiveSeconds,
      });
  }
  stopAlarm();
  log("Verification PASS · 계측값 정상 / 인터록 해제 / 가상 공정 재개");
  render();
}
// 선택한 장비·시나리오와 소리 설정은 유지하고 훈련 기록을 비웁니다.
function reset(keepSession = false) {
  // 장비와 문제 선택은 남기고 실행 중 훈련에 해당하는 값만 초기화합니다.
  stopAlarm();
  Object.assign(state, {
    active: null,
    variant: null,
    stage: "ready",
    checked: [],
    ack: false,
    cause: "",
    action: "",
    attempts: 0,
    message: "",
    answer: { hypothesis: "", evidence: "", exclusion: "", next: "" },
    productionDecision: "",
    escalationDecision: "",
    evidenceCost: 0,
    score: null,
    logs: [],
  });
  if (!keepSession && state.session.active)
    state.session = { active: false, plan: [], position: 0, results: [] };
  render();
  renderLogs();
}
// 7. 왼쪽 시나리오 목록과 오류 주입 버튼의 선택·잠금 상태를 표시합니다.
function renderList() {
  $("scenarioCount").textContent = String(scenarios.length).padStart(2, "0");
  $("scenarioList").innerHTML = scenarios
    .map(
      (s, i) => /* HTML */ `
        <button
          class="scenario ${i === state.selected ? "selected" : ""}"
          data-scenario="${i}"
          aria-pressed="${i === state.selected}"
          ${busy() ? "disabled" : ""}
        >
          <small>${s.code} / ${s.system}</small>
          <strong>${s.name}</strong>
          <span>${s.summary}</span>
        </button>
      `,
    )
    .join("");
  $("inject").disabled = busy();
  $("random").disabled = busy();
  $("randomSession").disabled = busy();
  $("mode").disabled = busy();
  $("interviewMode").disabled = busy() || state.session.active;
  $("interviewMode").textContent = `면접 모드 · ${state.interviewMode ? "ON" : "OFF"}`;
  $("interviewMode").setAttribute("aria-pressed", String(state.interviewMode));
  $("inject").textContent =
    state.stage === "resolved" ? "＋ 같은 Case 다시 접수" : "＋ 선택 Case 접수";
}
// 계측 데이터: [항목 이름, 값, 단위, 훈련 기준, 이상 여부] 순서입니다.
// 장비 모드와 고장에 따라 값을 바꾸며, 점검 중에는 알람 당시 스냅샷을 보여줍니다.
function readings() {
  // 교차 사례는 접수 장비 외의 계측도 같은 항목으로 복구 전후 비교합니다.
  if (state.active?.crossEquipment || state.active?.multiFactor)
    return (busy() ? state.active.metrics : state.active.normalMetrics).map((row) => [...row]);
  // 노광·포토 장비는 카탈로그 정상값을 복사한 뒤 고장 변형 값으로 덮어씁니다.
  if (equipmentCatalog[state.mode].metrics) {
    const values = equipmentCatalog[state.mode].metrics.map((row) => [...row]);
    if (busy()) {
      const changes = state.variant.measured || state.active.measured;
      Object.entries(state.variant.metricRows || {}).forEach(([index, row]) => {
        values[index] = [...row];
      });
      Object.entries(changes).forEach(([index, value]) => {
        values[index][1] = value;
        values[index][4] = true;
      });
    }
    return values;
  }
  const pvd = state.mode === "PVD";
  let m = [
    ["챔버 압력", pvd ? 5 : 800, "mTorr", pvd ? "4–6" : "760–840"],
    ["가스 유량", pvd ? 40 : 100, "sccm", pvd ? "38–42" : "95–105"],
    ["반사 전력", 8, "W", "≤ 50"],
    ["냉각수 유량", 3.2, "L/min", "≥ 2.0"],
  ];
  if (state.active?.id === "temp")
    m[3] = ["기판 온도", pvd ? 100 : 300, "°C", pvd ? "95–105" : "295–305"];
  if (busy()) {
    const s = state.active.id;
    if (s === "vac") m[0] = ["배기 종료 압력", 75, "mTorr", pvd ? "≤ 0.05" : "≤ 10", true];
    if (["vac", "gate", "temp"].includes(s)) {
      m[1] = ["가스 유량", 0, "sccm", "차단"];
      m[2] = ["반사 전력", 0, "W", "RF OFF"];
    }
    if (s === "gas") {
      m[1][1] = state.variant.cause === 0 ? (pvd ? 18 : 45) : pvd ? 52 : 112;
      m[1][4] = true;
    }
    if (s === "rf") {
      m[2][1] = 85;
      m[2][4] = true;
    }
    if (s === "cool") {
      m[3][1] = 0.8;
      m[3][4] = true;
    }
    if (s === "temp") {
      m[3][1] = pvd ? 65 : 245;
      m[3][4] = true;
    }
  }
  return m;
}
// 계측 데이터를 화면 카드로 변환합니다. 이상 값은 CSS의 alert 클래스로 강조합니다.
function renderMetrics() {
  $("metrics").innerHTML = readings()
    .map(
      ([name, value, unit, range, alert]) => /* HTML */ `
        <div class="metric ${alert ? "alert" : ""}">
          <div class="metric-label">${name}</div>
          <div class="metric-value">
            ${value}
            <span>${unit}</span>
          </div>
          <div class="metric-range">${busy() ? "알람 당시" : "가상 공정"} · 기준 ${range}</div>
        </div>
      `,
    )
    .join("");
}
// 8. 오른쪽 진단 화면: 대기 안내 / 점검·조치 / 복구 결과 중 현재 상태에 맞게 구성합니다.
// 동적으로 만든 버튼과 체크박스에는 화면을 만든 뒤 이벤트를 다시 연결합니다.
function renderBench() {
  // 대기 상태에는 사용 순서를, 완료 상태에는 점수와 학습 해설을 보여줍니다.
  const el = $("workbench");
  if (!state.active) {
    el.innerHTML = /* HTML */ `
      <div class="empty">
        <span class="empty-icon">⌁</span>
        <h3>새 Service Case 대기</h3>
        <p>
          왼쪽에서 Incident를 접수하세요.
          <br />
          계측과 점검 증거를 모으고
          <br />
          원인·조치·가동 승인을 기록합니다.
        </p>
        <ol>
          <li>Alarm acknowledge</li>
          <li>Evidence collection</li>
          <li>Root cause & action</li>
          <li>Verification & closure</li>
        </ol>
      </div>
    `;
    return;
  }
  const s = state.active;
  if (state.stage === "resolved") {
    const score = state.score;
    const sessionDone = state.session.results.length === state.session.plan.length;
    el.innerHTML = /* HTML */ `
      <div class="recover-heading">✓ CASE CLOSED · VERIFICATION PASS</div>
      <div class="bench-body">
        <div class="closure-meta">
          <span>
            ATTEMPTS
            <b>${state.attempts}</b>
          </span>
          <span>
            ELAPSED
            <b>${Math.floor(state.elapsed / 60)}m ${state.elapsed % 60}s</b>
          </span>
        </div>
        ${score
          ? /* HTML */ `
              <section class="interview-score" aria-label="면접 평가 점수">
                <div class="score-ring"><strong>${score.total}</strong><span>/100</span></div>
                <div class="score-breakdown">
                  <span>진단 <b>${score.diagnosis}/30</b></span>
                  <span>증거 효율 <b>${score.evidence}/15</b></span>
                  <span>답변 구조 <b>${score.writing}/20</b></span>
                  <span>고객 대응 <b>${score.communication}/20</b></span>
                  <span>시간 <b>${score.speed}/15</b></span>
                </div>
                <p>증거 요청 비용을 포함한 유효 시간 · ${Math.floor(score.effectiveSeconds / 60)}m ${score.effectiveSeconds % 60}s</p>
              </section>
              <section class="answer-review">
                <h3>내 면접 답변</h3>
                <dl>
                  <div><dt>가설</dt><dd>${escapeHtml(state.answer.hypothesis)}</dd></div>
                  <div><dt>핵심 근거</dt><dd>${escapeHtml(state.answer.evidence)}</dd></div>
                  <div><dt>타 장비 배제</dt><dd>${escapeHtml(state.answer.exclusion)}</dd></div>
                  <div><dt>다음 조치</dt><dd>${escapeHtml(state.answer.next)}</dd></div>
                </dl>
              </section>
            `
          : ""}
        <h3 class="step-title">Confirmed Root Cause</h3>
        <p>${s.causes[state.variant.cause]}</p>
        <h3 class="step-title">Corrective Action</h3>
        <p class="bench-note">${s.actions[state.variant.action]}</p>
        <div class="feedback success">
          <b>${s.crossEquipment ? "면접 피드백 · 왜 다른 장비 탓이 아닌가" : "ENGINEERING NOTE"}</b>
          <br />
          ${state.variant.lesson}
          ${s.crossEquipment ? "<p>교육용 가상 데이터 · 알람·계측·시험 결과는 실제 장비 사양이 아닙니다.</p>" : ""}
        </div>
        <div class="feedback">
          Verification:
          ${s.recovery ||
          (s.id === "vac"
            ? "배기 도달 조건 및 공정 압력 정상"
            : s.id === "gate"
              ? "밸브 피드백 일치 및 이송 허가 정상"
              : "관련 계측값 정상")}
          <br />
          <br />
          Interlock release · Production release recorded
        </div>
        <button class="primary" id="reportButton">Field Service Report 생성</button>
        ${state.session.active
          ? `<button class="secondary" id="sessionNext">${sessionDone ? "3-Case 종합 결과 보기" : `다음 랜덤 Case (${state.session.results.length + 1}/3) →`}</button>`
          : '<button class="secondary" id="next">Case 종료 후 대기 화면 →</button>'}
        ${state.session.results.length
          ? `<div class="session-progress"><b>${sessionDone ? `3-CASE TOTAL · ${Math.round(state.session.results.reduce((sum, r) => sum + r.score, 0) / state.session.results.length)}점 평균` : "RANDOM INTERVIEW"}</b>${state.session.results
              .map((r, i) => `<span>${i + 1}. ${r.mode} · ${r.score}점</span>`)
              .join("")}</div>`
          : ""}
        <p class="bench-note">
          기록은 이번 세션에서만 유지되며 실제 장비의 가동 승인을 의미하지 않습니다.
        </p>
      </div>
    `;
    $("reportButton").onclick = openServiceReport;
    if (state.session.active) $("sessionNext").onclick = nextSessionCase;
    else $("next").onclick = reset;
    return;
  }
  el.innerHTML = /* HTML */ `
    ${state.interviewMode
      ? `<div class="interview-status"><span>INTERVIEW ${state.session.active ? `${state.session.position + 1}/3` : "MODE"}</span><b>${Math.floor(((Date.now() - state.started) / 1000 + state.evidenceCost * 60) / 60)}m 유효 시간</b><em>증거 비용 ${state.evidenceCost}분</em></div>`
      : ""}
    <div class="alert-box">
      <small>
        ${s.code} / ${state.stage === "repaired" ? "VERIFICATION PENDING" : "INTERLOCK"}
      </small>
      <h3>${s.name}</h3>
      <p>${s.symptom}</p>
    </div>
    <div class="bench-body">
      <button id="ack" class="secondary" ${state.ack ? "disabled" : ""}>
        ${state.ack ? "✓ Alarm acknowledged" : "1. Alarm acknowledge · 경보음 정지"}
      </button>
      <p class="bench-note">
        보호 정지 상태에서 진단 기록을 조회합니다. 물리 점검과 정비는 승인된 안전 격리 절차를 이행한
        것으로 시뮬레이션합니다.
      </p>
      <h3 class="step-title">
        2. 필요한 정보 요청
        <span>${state.checked.length} / 3 · 최소 ${requiredEvidenceCount()}개</span>
      </h3>
      ${s.checks
        .map(
          (c, i) => /* HTML */ `
            <div class="check">
              <div class="check-line">
                <input
                  id="check${i}"
                  type="checkbox"
                  ${state.checked.includes(i) ? "checked" : ""}
                  ${!state.ack || state.checked.includes(i) || state.stage !== "alarm"
                    ? "disabled"
                    : ""}
                  data-check="${i}"
                />
                <label for="check${i}">${c}<small>요청 비용 +${s.evidenceCosts?.[i] || i + 1}분</small></label>
              </div>
              ${state.checked.includes(i)
                ? /* HTML */ `
                    <p class="check-result ${state.variant.bad === i ? "abnormal" : ""}">
                      ${state.variant.results[i]}
                    </p>
                  `
                : ""}
            </div>
          `,
        )
        .join("")}
      <section class="evidence-timeline" aria-label="증거 타임라인">
        <h3>증거 타임라인</h3>
        <div>${(s.timeline || [["T−20m", "기준값 정상"], ["T−08m", "첫 편차 감지"], ["T−02m", "인터록 조건 접근"], ["T+00", "경보 · 장비 HOLD"]])
          .map(([time, event]) => `<span><time>${time}</time><b>${event}</b></span>`)
          .join("")}</div>
      </section>
      ${state.interviewMode
        ? /* HTML */ `
            <section class="interview-answer">
              <h3>3. 면접 답변 구성</h3>
              <label>가설<textarea id="answerHypothesis" placeholder="현재 가장 가능성 높은 원인과 확신 수준">${escapeHtml(state.answer.hypothesis)}</textarea></label>
              <label>핵심 근거<textarea id="answerEvidence" placeholder="계측·교차 시험에서 무엇을 근거로 삼았는지">${escapeHtml(state.answer.evidence)}</textarea></label>
              <label>다른 장비 배제<textarea id="answerExclusion" placeholder="왜 트랙·노광·증착 중 다른 계통이 아닌지">${escapeHtml(state.answer.exclusion)}</textarea></label>
              <label>다음 조치<textarea id="answerNext" placeholder="안전 조치, 추가 시험, 에스컬레이션 범위">${escapeHtml(state.answer.next)}</textarea></label>
            </section>
          `
        : ""}
      <h3 class="step-title">${state.interviewMode ? "4" : "3"}. Root cause & corrective action</h3>
      <label for="cause" class="field">Evidence에 가장 맞는 Root Cause</label>
      <select id="cause" ${state.checked.length < 3 || state.stage !== "alarm" ? "disabled" : ""}>
        <option value="">원인 선택</option>
        ${s.causes
          .map(
            (x, i) => /* HTML */ `
              <option value="${i}" ${state.cause === String(i) ? "selected" : ""}>${x}</option>
            `,
          )
          .join("")}
      </select>
      ${state.interviewMode
        ? /* HTML */ `
            <label for="productionDecision" class="field">고객/공정팀에 전달할 생산 판단</label>
            <select id="productionDecision">
              <option value="">판단 선택</option>
              <option value="hold" ${state.productionDecision === "hold" ? "selected" : ""}>관련 로트 HOLD 유지 · 근거와 재개 조건 공유</option>
              <option value="run" ${state.productionDecision === "run" ? "selected" : ""}>즉시 정상 생산 재개</option>
              <option value="adjust" ${state.productionDecision === "adjust" ? "selected" : ""}>승인 없이 레시피 보정 후 진행</option>
            </select>
            <label for="escalationDecision" class="field">에스컬레이션 경로</label>
            <select id="escalationDecision">
              <option value="">경로 선택</option>
              <option value="joint" ${state.escalationDecision === "joint" ? "selected" : ""}>교차 장비 담당자 공동 검토</option>
              <option value="specialist" ${state.escalationDecision === "specialist" ? "selected" : ""}>이상 계통 전문팀에 증거 패키지 전달</option>
              <option value="none" ${state.escalationDecision === "none" ? "selected" : ""}>추가 근거 없이 현장 단독 종결</option>
            </select>
          `
        : ""}
      <label for="action" class="field">Corrective Action</label>
      <select id="action" ${state.checked.length < 3 || state.stage !== "alarm" ? "disabled" : ""}>
        <option value="">조치 선택</option>
        ${s.actions
          .map(
            (x, i) => /* HTML */ `
              <option value="${i}" ${state.action === String(i) ? "selected" : ""}>${x}</option>
            `,
          )
          .join("")}
      </select>
      <button
        id="apply"
        class="secondary"
        ${state.checked.length < requiredEvidenceCount() ||
        state.cause === "" ||
        state.action === "" ||
        !interviewReady() ||
        state.stage !== "alarm"
          ? "disabled"
          : ""}
      >
        Corrective Action 실행
      </button>
      ${state.message
        ? /* HTML */ `
            <div role="status" class="feedback ${state.messageType}">${state.message}</div>
          `
        : ""}
      <h3 class="step-title">${state.interviewMode ? "5" : "4"}. Verification & release</h3>
      <button id="verify" class="primary" ${state.stage !== "repaired" ? "disabled" : ""}>
        Verification 실행 · 인터록 확인
      </button>
      <button id="abandon" class="quiet reset-training">Case 취소 및 초기화</button>
    </div>
  `;
  $("ack").onclick = ack;
  $("cause").onchange = (e) => {
    state.cause = e.target.value;
    updateApply();
  };
  $("action").onchange = (e) => {
    state.action = e.target.value;
    updateApply();
  };
  if (state.interviewMode) {
    for (const [id, key] of [["answerHypothesis", "hypothesis"], ["answerEvidence", "evidence"], ["answerExclusion", "exclusion"], ["answerNext", "next"]])
      $(id).oninput = (e) => { state.answer[key] = e.target.value; updateApply(); };
    $("productionDecision").onchange = (e) => { state.productionDecision = e.target.value; updateApply(); };
    $("escalationDecision").onchange = (e) => { state.escalationDecision = e.target.value; updateApply(); };
  }
  $("apply").onclick = applyAction;
  $("verify").onclick = verify;
  $("abandon").onclick = () => {
    if (window.confirm("진행 중인 점검과 로그를 초기화하고 Case를 취소할까요?")) reset();
  };
  el.querySelectorAll("[data-check]").forEach(
    (x) => (x.onchange = () => check(Number(x.dataset.check))),
  );
}
// 점검과 두 선택지가 모두 완료된 경우에만 조치 버튼을 활성화합니다.
function updateApply() {
  $("apply").disabled =
    state.checked.length < requiredEvidenceCount() ||
    state.cause === "" ||
    state.action === "" ||
    !interviewReady() ||
    state.stage !== "alarm";
}
// 9. 상태를 화면 전체에 반영합니다. 데이터 변경 후 호출하는 공통 갱신 함수입니다.
function render() {
  renderList();
  renderMetrics();
  renderBench();
  $("status").className = `badge ${busy() ? "alarm" : "good"}`;
  $("status").textContent =
    state.stage === "alarm"
      ? "경보 · INTERLOCK"
      : state.stage === "repaired"
        ? "조치 완료 · 검증 대기"
        : state.stage === "resolved"
          ? "복구 완료 · RUN"
          : "정상 · READY";
  $("equipmentLabel").textContent = equipmentCatalog[state.mode].bay;
  renderEquipmentMap();
  renderServiceConsole();
}

// 장비를 변경하면 해당 장비의 문제 목록과 상태를 함께 초기화합니다.
function selectEquipment(mode) {
  // 외부 도구가 잘못된 모드를 보내도 기존 화면을 바꾸지 않습니다.
  if (!Object.hasOwn(equipmentCatalog, mode)) return { error: "알 수 없는 장비입니다." };
  if (busy()) return { error: "진행 중인 훈련을 먼저 완료하세요." };
  state.mode = mode;
  $("mode").value = mode;
  state.selected = 0;
  scenarios = lithographyScenarios[mode] || depositionScenarios;
  renderEquipmentProfile();
  reset(state.session.active);
  return { mode, scenarios: scenarios.map((s) => s.id) };
}

// 10. 사용자 조작 연결: 시나리오, 오류 주입, 장비 선택, 소리, 부품 설명, 자료 창입니다.
// 시나리오 목록은 이벤트 위임을 사용해 동적으로 만든 버튼도 한 번에 처리합니다.
$("scenarioList").onclick = (e) => {
  const b = e.target.closest("[data-scenario]");
  if (b && !busy()) {
    state.selected = Number(b.dataset.scenario);
    renderList();
  }
};
$("inject").onclick = () => inject();
// 무작위 버튼은 현재 장비 문제 중 하나를 골라 곧바로 고장을 시작합니다.
$("random").onclick = () => inject(Math.floor(Math.random() * scenarios.length));
$("interviewMode").onclick = () => {
  if (busy()) return;
  state.interviewMode = !state.interviewMode;
  render();
};
$("randomSession").onclick = startRandomSession;
$("mode").onchange = (e) => {
  if (busy()) return;
  selectEquipment(e.target.value);
};
// 음소거는 반복 알람만 제어하며 진단 상태에는 영향을 주지 않습니다.
$("sound").onclick = () => {
  state.sound = !state.sound;
  $("sound").textContent = state.sound ? "소리 켜짐" : "소리 꺼짐";
  $("sound").setAttribute("aria-pressed", String(state.sound));
  if (state.sound) beep();
};
$("sound").setAttribute("aria-pressed", "true");
// 학습 자료 팝업은 노광/포토 자료와 기존 증착 자료를 하나의 목록으로 합칩니다.
$("sourcesButton").onclick = () => $("sources").showModal();
$("closeSources").onclick = () => $("sources").close();
$("closeReport").onclick = () => $("report").close();
$("sourceLinks").innerHTML = [...lithographySources, ...sources]
  .map(
    ([name, description, url]) => /* HTML */ `
      <a href="${url}" target="_blank" rel="noopener noreferrer">
        ${name} ↗
        <span>${description}</span>
      </a>
    `,
  )
  .join("");
renderEquipmentProfile();
render();
// 11. 지원 브라우저에서만 동작하는 선택적 WebMCP 연동입니다.
// 화면과 같은 상태·고장 주입 함수를 사용하며 읽기 도구로 정답을 공개하지 않습니다.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  for (const tool of [
    {
      name: "read_training_state",
      description:
        "현재 화면의 장비, 알람, 진단 진행 상태와 공개된 점검 결과를 읽습니다. 정답은 노출하지 않습니다.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => ({
        mode: state.mode,
        availableScenarios: scenarios.map((s) => ({ id: s.id, name: s.name })),
        status: state.stage,
        alarm: state.active?.code ?? null,
        acknowledged: state.ack,
        checks: state.checked.map((i) => ({
          name: state.active.checks[i],
          result: state.variant.results[i],
        })),
      }),
    },
    {
      name: "select_training_equipment",
      description:
        "훈련 장비를 선택하고 해당 장비의 문제 목록으로 전환합니다. 진행 중인 훈련은 덮어쓰지 않습니다.",
      inputSchema: {
        type: "object",
        properties: { mode: { type: "string", enum: Object.keys(equipmentCatalog) } },
        required: ["mode"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => {
        if (
          !input ||
          typeof input.mode !== "string" ||
          Object.keys(input).some((k) => k !== "mode")
        )
          throw Error("Invalid input");
        return selectEquipment(input.mode);
      },
    },
    {
      name: "start_fault_simulation",
      description:
        "현재 장비에서 가상 고장을 발생시킵니다. 실장비와 연결되지 않습니다. 진행 중인 훈련은 덮어쓰지 않습니다.",
      inputSchema: {
        type: "object",
        properties: {
          scenario: {
            type: "string",
            enum: [...depositionScenarios, ...Object.values(lithographyScenarios).flat()].map(
              (x) => x.id,
            ),
          },
        },
        required: ["scenario"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => {
        if (
          !input ||
          typeof input.scenario !== "string" ||
          Object.keys(input).some((k) => k !== "scenario")
        )
          throw Error("Invalid input");
        const i = scenarios.findIndex((x) => x.id === input.scenario);
        if (i < 0) throw Error("Unknown scenario");
        return inject(i);
      },
    },
  ]) {
    try {
      Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(
        () => {},
      );
    } catch {}
  }
}

