"use strict";

// 실제 CS 업무 화면처럼 보이게 만드는 Case, 이력, Trend, Fault Tree, 보고서 기능입니다.
// 장비의 실제 고객 정보가 아닌 포트폴리오용 가상 FAB 데이터만 사용합니다.
const serviceProfiles = {
  DUV: {
    asset: "LITHO-DUV-01",
    location: "FAB 2 · BAY L08",
    lot: "W24K-381",
    pm: "2026-08-28",
    owner: "Lithography CS",
    history: [
      ["09-08", "정렬 기준 웨이퍼 점검", "CLOSED"],
      ["08-28", "월간 PM · 액침 계통", "CLOSED"],
      ["08-14", "노광량 기준 측정", "MONITOR"],
    ],
  },
  EUV: {
    asset: "LITHO-EUV-01",
    location: "FAB 2 · BAY E03",
    lot: "W24K-417",
    pm: "2026-09-02",
    owner: "EUV On-site Support",
    history: [
      ["09-11", "진공 회복 시간 추세 검토", "MONITOR"],
      ["09-02", "월간 PM · 열 안정화", "CLOSED"],
      ["08-21", "스테이지 기준 측정", "CLOSED"],
    ],
  },
  TRACK: {
    asset: "PHOTO-TRK-03",
    location: "FAB 2 · BAY P12",
    lot: "W24K-392",
    pm: "2026-09-05",
    owner: "Photo Track CS",
    history: [
      ["09-12", "현상 모듈 균일도 확인", "CLOSED"],
      ["09-05", "주간 PM · 베이크 플레이트", "CLOSED"],
      ["08-30", "레지스트 공급 조건 확인", "MONITOR"],
    ],
  },
  PECVD: {
    asset: "DEP-CVD-04",
    location: "FAB 1 · BAY D07",
    lot: "W24D-220",
    pm: "2026-09-01",
    owner: "Deposition CS",
    history: [
      ["09-10", "MFC 영점 검증", "CLOSED"],
      ["09-01", "월간 PM · 챔버", "CLOSED"],
      ["08-18", "배기 시간 증가 관찰", "MONITOR"],
    ],
  },
  PVD: {
    asset: "DEP-PVD-02",
    location: "FAB 1 · BAY D11",
    lot: "W24D-233",
    pm: "2026-08-31",
    owner: "Deposition CS",
    history: [
      ["09-09", "타깃 냉각 유량 확인", "CLOSED"],
      ["08-31", "월간 PM · 스퍼터 소스", "CLOSED"],
      ["08-17", "RF 매칭 추세 검토", "MONITOR"],
    ],
  },
};

// 현재 Case 번호는 장비와 선택한 시나리오 번호로 구성해 화면 안에서 일관되게 유지합니다.
function caseNumber() {
  return `INC-${serviceProfiles[state.mode].asset}-${String(state.selected + 1).padStart(2, "0")}`;
}

// 상태에 따라 접수·진단·검증·종료라는 현업형 Case 상태명을 반환합니다.
function caseStatus() {
  return {
    ready: "STANDBY",
    alarm: state.ack ? "DIAGNOSIS" : "NEW ALARM",
    repaired: "VERIFICATION",
    resolved: "CLOSED",
  }[state.stage];
}

// 상단 Case strip에 장비 ID, FAB 위치, Lot, 우선순위와 현재 상태를 표시합니다.
function renderCaseHeader() {
  const profile = serviceProfiles[state.mode];
  const severity = busy() ? "SEV 2 · PRODUCTION HOLD" : "NORMAL MONITORING";
  $("caseHeader").innerHTML = /* HTML */ `
    <div class="case-identity">
      <span class="case-kicker">SERVICE TICKET</span>
      <strong>${caseNumber()}</strong>
    </div>
    <dl class="case-facts">
      <div>
        <dt>ASSET</dt>
        <dd>${profile.asset}</dd>
      </div>
      <div>
        <dt>LOCATION</dt>
        <dd>${profile.location}</dd>
      </div>
      <div>
        <dt>LOT</dt>
        <dd>${profile.lot}</dd>
      </div>
      <div>
        <dt>OWNER</dt>
        <dd>${profile.owner}</dd>
      </div>
    </dl>
    <div class="case-state">
      <span class="severity ${busy() ? "high" : ""}">${severity}</span>
      <strong>${caseStatus()}</strong>
    </div>
  `;
}

// 계측값을 서로 다른 단위 대신 0~100 상대 추세로 바꿔 한 그래프에서 비교합니다.
function trendPoints(metric, index) {
  const alert = Boolean(metric[4]);
  const points = [];
  for (let i = 0; i < 20; i++) {
    const baseline = 38 + index * 8 + ((i * 7 + index * 11) % 9);
    const deviation = alert && i > 11 ? (i - 11) * 6 : 0;
    const recovery = state.stage === "resolved" && i > 15 ? -(i - 15) * 4 : 0;
    const level = Math.max(8, Math.min(92, baseline + deviation + recovery));
    points.push(`${28 + i * 25},${118 - level}`);
  }
  return points.join(" ");
}

// 최근 20분의 계측 추세를 SVG로 그립니다. 붉은 선은 현재 알람 계측입니다.
function renderTrendChart() {
  const palette = ["#77d8ff", "#c3f477", "#d3a8ff", "#f4c66f"];
  const metrics = readings();
  const lines = metrics
    .map(
      (metric, index) =>
        `<polyline points="${trendPoints(metric, index)}" stroke="${metric[4] ? "#ff8082" : palette[index]}"/>`,
    )
    .join("");
  $("trendChart").innerHTML = /* HTML */ `
    <svg viewBox="0 0 530 150" role="img" aria-label="최근 20분 공정 계측 상대 추세">
      <g class="trend-grid">
        <path d="M28 28H503M28 63H503M28 98H503M28 133H503" />
        <path d="M28 18V133M178 18V133M328 18V133M503 18V133" />
      </g>
      <path class="trend-limit" d="M28 43H503" />
      <g class="trend-series">${lines}</g>
      <g class="trend-axis">
        <text x="28" y="147">-20m</text>
        <text x="170" y="147">-14m</text>
        <text x="320" y="147">-7m</text>
        <text x="478" y="147">NOW</text>
      </g>
    </svg>
    <div class="trend-legend">
      ${metrics
        .map(
          (metric, index) => /* HTML */ `
            <span>
              <i style="--series:${metric[4] ? "#ff8082" : palette[index]}"></i>
              ${metric[0]}
              <b>${metric[1]} ${metric[2]}</b>
            </span>
          `,
        )
        .join("")}
    </div>
  `;
  $("trendMode").textContent = busy() ? "ALARM SNAPSHOT" : "LIVE BASELINE";
}

// 선택한 장비의 가상 PM 일자와 최근 작업 이력을 표시합니다.
function renderMaintenanceHistory() {
  const profile = serviceProfiles[state.mode];
  $("maintenanceHistory").innerHTML = /* HTML */ `
    <div class="panel-heading compact-heading">
      <div>
        <h2>Asset History</h2>
        <span class="muted">LAST PM · ${profile.pm}</span>
      </div>
      <span class="history-count">${profile.history.length} RECORDS</span>
    </div>
    <div class="history-list">
      ${profile.history
        .map(
          ([date, work, status]) => /* HTML */ `
            <div>
              <time>${date}</time>
              <span>${work}</span>
              <b class="${status === "MONITOR" ? "monitor" : ""}">${status}</b>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

// 진단 단계가 진행될수록 Fault Tree의 노드가 순서대로 완료 상태가 됩니다.
function renderFaultTree() {
  const target = $("faultTree");
  if (!state.active) {
    target.innerHTML = `<p class="console-empty">Case가 열리면 증거 기반 진단 경로가 표시됩니다.</p>`;
    return;
  }
  const steps = [
    ["Alarm captured", true, state.active.code],
    ["Acknowledge", state.ack, state.ack ? "로그 보존 완료" : "대기"],
    ["Evidence collection", state.checked.length === 3, `${state.checked.length}/3 확보`],
    [
      "Root cause decision",
      state.cause !== "" && state.action !== "",
      state.cause === "" ? "대기" : "검토 중",
    ],
    [
      "Verification",
      state.stage === "resolved",
      state.stage === "repaired" ? "재시험 대기" : state.stage === "resolved" ? "PASS" : "대기",
    ],
  ];
  target.innerHTML = steps
    .map(
      ([label, done, detail], index) => /* HTML */ `
        <div class="fault-node ${done ? "done" : ""}">
          <i>${done ? "✓" : String(index + 1).padStart(2, "0")}</i>
          <span>
            <b>${label}</b>
            <small>${detail}</small>
          </span>
        </div>
      `,
    )
    .join("");
}

// 현재까지 확보한 로그와 점검 결과를 Escalation 패키지 형태로 요약합니다.
function renderEvidencePackage() {
  const target = $("evidencePackage");
  if (!state.active) {
    target.innerHTML = `<p class="console-empty">활성 Case 없음 · 전송할 증거 패키지가 없습니다.</p>`;
    return;
  }
  const readiness = Math.min(
    100,
    20 +
      (state.ack ? 20 : 0) +
      state.checked.length * 15 +
      (state.cause !== "" ? 10 : 0) +
      (state.stage === "resolved" ? 10 : 0),
  );
  target.innerHTML = /* HTML */ `
    <div class="evidence-head">
      <b>Escalation readiness</b>
      <strong>${readiness}%</strong>
    </div>
    <div class="readiness"><i style="width:${readiness}%"></i></div>
    <div class="evidence-tags">
      <span class="ready">Alarm log</span>
      <span class="${state.ack ? "ready" : ""}">Acknowledge</span>
      <span class="${state.checked.length === 3 ? "ready" : ""}">3-point evidence</span>
      <span class="${state.cause !== "" ? "ready" : ""}">Hypothesis</span>
    </div>
    <div class="approval-row">
      <span>
        <small>SAFETY ISOLATION</small>
        <b>${state.stage === "repaired" || state.stage === "resolved" ? "RECORDED" : "REQUIRED"}</b>
      </span>
      <span>
        <small>PRODUCTION RELEASE</small>
        <b>${state.stage === "resolved" ? "APPROVED" : "HOLD"}</b>
      </span>
    </div>
  `;
}

// 화면 상태를 읽어 제출 가능한 텍스트 서비스 리포트를 만듭니다.
function serviceReportText() {
  const profile = serviceProfiles[state.mode];
  const s = state.active;
  const results = state.checked
    .map((i) => `- ${s.checks[i]}: ${state.variant.results[i]}`)
    .join("\n");
  return `FIELD SERVICE REPORT
Case: ${caseNumber()}
Asset: ${profile.asset} / ${equipmentCatalog[state.mode].name}
Location: ${profile.location}
Lot: ${profile.lot}
Status: ${caseStatus()}
Alarm: ${s.code} · ${s.name}

EVIDENCE
${results}

ROOT CAUSE
${s.causes[state.variant.cause]}

CORRECTIVE ACTION
${s.actions[state.variant.action]}

${state.score ? `INTERVIEW SCORE\nTotal: ${state.score.total}/100\nDiagnosis: ${state.score.diagnosis}/30 · Evidence efficiency: ${state.score.evidence}/15 · Answer structure: ${state.score.writing}/20 · Communication: ${state.score.communication}/20 · Time: ${state.score.speed}/15\n\nCANDIDATE ANSWER\nHypothesis: ${state.answer.hypothesis}\nEvidence: ${state.answer.evidence}\nOther equipment excluded: ${state.answer.exclusion}\nNext action: ${state.answer.next}\nProduction decision: ${state.productionDecision}\nEscalation: ${state.escalationDecision}\n` : ""}

${s.crossEquipment ? `CROSS-EQUIPMENT INTERVIEW FEEDBACK\n${state.variant.lesson}\n교육용 가상 데이터 · 실제 장비 사양이 아닙니다.\n` : ""}

VERIFICATION
${s.recovery || "관련 계측값 정상"}
Interlock release: PASS
Elapsed: ${Math.floor(state.elapsed / 60)}m ${state.elapsed % 60}s

Independent simulation · fictional service record`;
}

// 종료된 Case의 보고서를 모달로 열고 텍스트 저장 버튼을 연결합니다.
function openServiceReport() {
  if (state.stage !== "resolved") return;
  const report = serviceReportText();
  $("reportBody").textContent = report;
  $("report").showModal();
  $("downloadReport").onclick = () => {
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${caseNumber()}-service-report.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };
}

// app.js의 render() 마지막에서 호출하는 서비스 콘솔 전체 갱신 함수입니다.
function renderServiceConsole() {
  renderCaseHeader();
  renderTrendChart();
  renderMaintenanceHistory();
  renderFaultTree();
  renderEvidencePackage();
}

