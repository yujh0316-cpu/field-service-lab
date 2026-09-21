"use strict";

// 이 파일은 equipment-data.js의 데이터를 HTML/SVG 화면으로 바꾸는 역할만 담당합니다.
// state와 $ 함수는 app.js와 같은 전역 공간에서 공유합니다.
// 장비마다 다른 기능 연결도를 그립니다. 제품 외관과 실제 내부 설계 도면은 구분합니다.
// 증착 SVG 원본은 DUV/EUV/TRACK에서 돌아왔을 때 복원하기 위해 저장합니다.
const depositionMap = document.getElementById("equipmentMap").innerHTML;
// 직전에 그린 모드를 기억해 상태 갱신 때마다 SVG 전체를 다시 만들지 않습니다.
let drawnMode = null;

// 장비 제조사·모델·특징·공정 흐름과 제품 참고 이미지를 소개 영역에 표시합니다.
function renderEquipmentProfile() {
  // 현재 선택된 모드의 장비 한 개를 카탈로그에서 가져옵니다.
  const model = equipmentCatalog[state.mode];
  $("equipmentProfile").innerHTML = /* HTML */ `
    <div class="profile-copy">
      <div class="profile-eyebrow">
        ${model.maker}
        <span>REFERENCE PLATFORM</span>
      </div>
      <h2>${model.name}</h2>
      <div class="spec-pills">${model.facts.map((f) => `<span>${f}</span>`).join("")}</div>
      <p>${model.description}</p>
      <a href="${model.reference}" target="_blank" rel="noopener noreferrer">제조사 공개 자료 ↗</a>
    </div>
    <div class="profile-reference">
      ${model.image
        ? `<a href="${model.reference}" target="_blank" rel="noopener noreferrer"><img src="${model.image}" alt="${model.maker} ${model.name} 공식 제품 이미지" loading="lazy" referrerpolicy="no-referrer"></a><small>제품 외관 참고 · © ${model.maker}</small>`
        : `<div class="profile-monogram">${state.mode}</div><small>특정 제품을 복제하지 않은 교육 모델</small>`}
    </div>
  `;
  // 원격 사진을 불러오지 못해도 제조사 원문 링크와 훈련 화면을 계속 사용할 수 있습니다.
  $("equipmentProfile")
    .querySelectorAll("img")
    .forEach(
      (img) =>
        (img.onerror = () => {
          const parent = img.parentElement;
          img.remove();
          parent.textContent = "제품 외관은 제조사 자료에서 확인 ↗";
        }),
    );
  // 공정 단계 사이에 장식용 화살표를 넣되 스크린리더에서는 화살표를 숨깁니다.
  $("processFlow").innerHTML = model.flow
    .map((f, i) => `<span><b>${String(i + 1).padStart(2, "0")}</b>${f}</span>`)
    .join('<i aria-hidden="true">→</i>');
}

// 현재 장비의 기능 연결도를 그리고 진행 중인 고장 계통을 붉게 강조합니다.
function renderEquipmentMap() {
  const model = equipmentCatalog[state.mode];
  // 장비 종류가 실제로 바뀐 경우에만 SVG의 구조를 교체합니다.
  if (drawnMode !== state.mode) {
    const map = $("equipmentMap");
    // nodes가 없는 PECVD/PVD는 index.html에 작성된 증착 장비 SVG를 재사용합니다.
    if (!model.nodes) {
      map.innerHTML = depositionMap;
      map.setAttribute("aria-label", "증착 장비의 가스·RF·진공·냉각 기능 연결도");
    } else {
      // 사각형은 계통, 화살표는 기능상 연결을 뜻합니다. 위치·관로·광선의 실제 경로가 아닙니다.
      // 노드 중심 사이를 잇는 SVG 경로를 생성합니다.
      const lines = model.links
        .map(([from, to]) => {
          const a = model.nodes[from],
            b = model.nodes[to];
          return `<path d="M${a[3] + 80} ${a[4] + 50} L${b[3] + 80} ${b[4] + 50}"/>`;
        })
        .join("");
      // 각 노드를 키보드로도 선택 가능한 SVG 버튼 그룹으로 생성합니다.
      const nodes = model.nodes
        .map(
          (
            [id, label, sub, x, y],
            i,
          ) => `<g class="part" data-part="${id}" tabindex="0" role="button" aria-label="${label}">
        <rect class="part-body" x="${x}" y="${y}" width="160" height="104" rx="8"/>
        <text class="node-number" x="${x + 16}" y="${y + 25}">${String(i + 1).padStart(2, "0")}</text>
        <circle class="part-led" cx="${x + 142}" cy="${y + 20}" r="4"/>
        <text class="node-title" x="${x + 80}" y="${y + 56}" text-anchor="middle">${label}</text>
        <text class="node-sub" x="${x + 80}" y="${y + 82}" text-anchor="middle">${sub}</text>
      </g>`,
        )
        .join("");
      // 배경 격자, 화살표, 노드와 안내 문구를 하나의 SVG 내용으로 합칩니다.
      map.innerHTML = `<defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#293848" stroke-width=".6"/></pattern><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#72899f"/></marker><linearGradient id="metal" x2="1" y2="1"><stop stop-color="#304458"/><stop offset="1" stop-color="#192a3a"/></linearGradient></defs><rect width="800" height="510" fill="url(#grid)"/><text x="26" y="28" class="map-meta">${model.bay} · FUNCTIONAL VIEW</text><g class="system-links" stroke="#72899f" stroke-width="2" marker-end="url(#arrow)" fill="none">${lines}</g>${nodes}<rect x="253" y="214" width="294" height="37" rx="18" fill="#182536" stroke="#344b64"/><text x="400" y="238" class="map-center-label" text-anchor="middle">${model.family} · 기능 연결도</text><text x="26" y="485" class="map-meta">개념적 연결 관계 · 실제 내부 배치·광 경로 도면이 아닙니다.</text>`;
      map.setAttribute("aria-label", `${model.name} 기능 연결도`);
    }
    drawnMode = state.mode;
    $("partInfo").textContent = model.description;
    bindPartEvents();
  }
  // PECVD/PVD 공통 SVG의 라벨·가스 경로·전극 색상을 선택 모드에 맞춥니다.
  if (!model.nodes) {
    $("chamberType").textContent =
      state.mode === "PVD" ? "마그네트론 타깃 + 가열 기판 홀더" : "샤워헤드 + 가열 전극";
    $("gasType").textContent = state.mode === "PVD" ? "Ar 스퍼터 가스 공급" : "공정 가스 유량 제어";
    document
      .querySelector(".gas-line")
      .setAttribute("d", state.mode === "PVD" ? "M155 150V88H265V221H294" : "M155 150V88H390V174");
    $("electrode").setAttribute("fill", state.mode === "PVD" ? "#c0a980" : "#a7b6c0");
    $("plasmaShape").style.opacity = busy() ? "0.1" : "1";
  }
  // 현재 고장과 일치하는 한 계통만 fault 상태로 표시합니다.
  document.querySelectorAll(".part").forEach((p) => {
    const fault = busy() && p.dataset.part === state.active.part;
    p.classList.toggle("fault", fault);
    // 색상뿐 아니라 텍스트 상태로도 알람 위치를 알립니다.
    p.setAttribute("aria-description", fault ? "알람이 발생한 계통" : "알람 없음");
  });
}

// 마우스 클릭과 Enter/Space 키 모두 같은 부품 설명을 보여주도록 연결합니다.
function bindPartEvents() {
  document.querySelectorAll(".part").forEach((p) => {
    // 선택 강조를 옮기고 장비별 부품 설명을 아래 안내 상자에 표시합니다.
    const show = () => {
      document.querySelectorAll(".part").forEach((x) => x.classList.remove("focused"));
      p.classList.add("focused");
      const descriptions = equipmentCatalog[state.mode].parts || parts;
      $("partInfo").textContent = descriptions[p.dataset.part];
    };
    p.onclick = show;
    p.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        show();
      }
    };
  });
}

