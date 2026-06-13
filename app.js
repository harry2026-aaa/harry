const screens = [...document.querySelectorAll(".screen")];
const navButtons = [...document.querySelectorAll(".bottom-nav button")];
const form = document.querySelector("#designForm");
const formSteps = [...document.querySelectorAll(".form-step")];
const progressBar = document.querySelector("#progressBar");
const stepLabel = document.querySelector("#stepLabel");
const prevStepButton = document.querySelector("#prevStep");
const nextStepButton = document.querySelector("#nextStep");
const fileInput = document.querySelector('input[name="planFile"]');
const fileName = document.querySelector("#fileName");

let currentStep = 0;
let latestReport = null;
const leadKey = "snva_store_design_leads";
const adminToken = "snva2026";
let adminUnlocked = new URLSearchParams(window.location.search).get("admin") === adminToken;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // 本地 file:// 打开时浏览器会禁用 Service Worker，不影响工具正常使用。
    });
  });
}

function showScreen(id) {
  if (id === "screenAdmin" && !adminUnlocked) {
    id = "screenStart";
  }
  screens.forEach((screen) => screen.classList.toggle("is-active", screen.id === id));
  navButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.target === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (id === "screenAdmin") renderLeads();
}

function setAdminVisibility() {
  const adminScreen = document.querySelector("#screenAdmin");
  if (adminScreen) {
    adminScreen.hidden = !adminUnlocked;
    adminScreen.setAttribute("aria-hidden", String(!adminUnlocked));
  }
}

function openAdmin() {
  adminUnlocked = true;
  setAdminVisibility();
  renderLeads();
  showScreen("screenAdmin");
}

function setStep(index) {
  currentStep = Math.max(0, Math.min(formSteps.length - 1, index));
  formSteps.forEach((step, idx) => step.classList.toggle("is-active", idx === currentStep));
  stepLabel.textContent = String(currentStep + 1).padStart(2, "0");
  progressBar.style.width = `${((currentStep + 1) / formSteps.length) * 100}%`;
  prevStepButton.style.visibility = currentStep === 0 ? "hidden" : "visible";
  nextStepButton.textContent = currentStep === formSteps.length - 1 ? "生成预案" : "下一步";
}

function getData() {
  const data = Object.fromEntries(new FormData(form).entries());
  data.goals = [...document.querySelectorAll('input[name="goals"]:checked')].map((item) => item.value);
  data.fileName = fileInput.files[0]?.name || "";
  return data;
}

function validateCurrentStep() {
  const fields = [...formSteps[currentStep].querySelectorAll("input, select, textarea")];
  const invalid = fields.find((field) => !field.checkValidity());
  if (invalid) {
    invalid.reportValidity();
    return false;
  }
  return true;
}

function areaScore(area) {
  return {
    "50㎡以下": 6,
    "50-100㎡": 12,
    "100-200㎡": 18,
    "200㎡以上": 24,
  }[area] || 12;
}

function stageScore(stage) {
  return {
    "刚选址": 8,
    "找设计师": 16,
    "已有平面图": 24,
    "施工图阶段": 34,
    "已开工": 45,
  }[stage] || 18;
}

function budgetScore(budget, area) {
  const tight =
    (budget === "10万以下" && area !== "50㎡以下") ||
    (budget === "10-30万" && area === "200㎡以上");
  return tight ? 24 : budget === "80万以上" ? 8 : 14;
}

function locationProfile(location) {
  const profiles = {
    商场店: {
      customer: "客流来自商场自然流量和同层竞品对比，顾客决策快，容易被橱窗、门头和第一视觉点影响。",
      business: "核心是提高进店率和同层竞争中的识别度，设计要让顾客在 3 秒内看懂品牌调性和主推商品。",
      layout: "入口不宜过深，橱窗和入口主推区要形成强视觉焦点，收银区可以后置，把黄金位置留给新品和高毛利搭配。",
      lighting: "门头、橱窗和入口 3 米内要有更高亮度层次；重点陈列要比环境光更突出，避免在商场公共照明下显得没有存在感。",
      riskAdd: 8,
    },
    社区店: {
      customer: "客群更依赖周边熟客、复购和口碑，顾客逛店节奏慢，对舒适度、亲近感和试衣体验更敏感。",
      business: "核心是复购、客情和高频到店，设计不要过度高冷，要让人愿意常来、愿意试、愿意聊。",
      layout: "入口要亲切，试衣间和搭配区要舒服；可以增加会员沟通、搭配推荐和小型陈列场景。",
      lighting: "整体光感建议柔和、显肤色好；试衣间必须优先做好，避免顾客试穿显黑影响成交和复购。",
      riskAdd: 2,
    },
    商业街店: {
      customer: "客流来自街面路过、目的性到店和夜间消费，远距离识别、门头亮度和橱窗记忆点非常重要。",
      business: "核心是路人截流和夜间吸引，设计要解决‘远处看得到、近处想进来、进来有重点’。",
      layout: "门头、橱窗和入口要强；店内第一视觉点要靠前，避免顾客站在门口看不出卖点就离开。",
      lighting: "门头和橱窗需要独立回路，夜间要有亮度层次；店内不能只追求亮，要让主推款从街面视角就能被看到。",
      riskAdd: 10,
    },
  };
  return profiles[location] || profiles.商场店;
}

function calculateReport(data) {
  const goals = data.goals || [];
  const hasLateStage = ["施工图阶段", "已开工"].includes(data.stage);
  const hasDrawing = data.hasPlan !== "没有图纸";
  const wantsReplication = goals.includes("连锁可复制") || data.projectType === "连锁复制";
  const wantsPhoto = goals.includes("拍照出片") || goals.includes("试衣显瘦");
  const premium = ["800-1500元", "1500元以上"].includes(data.price);
  const location = locationProfile(data.storeLocation);

  let score =
    22 +
    areaScore(data.area) +
    stageScore(data.stage) +
    budgetScore(data.budget, data.area) +
    (hasDrawing ? 8 : 16) +
    (wantsReplication ? 8 : 0) +
    (wantsPhoto ? 7 : 0) +
    (premium ? 6 : 0) +
    location.riskAdd;
  score = Math.min(96, Math.max(38, score));

  const risk = [
    {
      name: "动线风险",
      value: Math.min(94, (data.area === "50㎡以下" ? 48 : data.area === "200㎡以上" ? 76 : 62) + location.riskAdd),
      note: `${data.storeLocation}要先匹配客流来源，再决定入口、主通道和第一视觉点。`,
    },
    {
      name: "陈列风险",
      value: premium ? 74 : 58,
      note: premium ? "高客单价需要重点陈列和层次光承托价值感。" : "基础陈列要避免全店平均照亮。",
    },
    {
      name: "试衣间风险",
      value: wantsPhoto ? 82 : 64,
      note: "试衣间是成交前最后一米，色温、显指和脸部阴影都要控制。",
    },
    {
      name: "灯光预留风险",
      value: hasLateStage ? 88 : data.stage === "已有平面图" ? 74 : 56,
      note: hasLateStage ? "进入施工后再改轨道和回路，成本会明显上升。" : "当前仍适合把灯位放进设计流程。",
    },
    {
      name: "预算浪费风险",
      value: budgetScore(data.budget, data.area) * 3,
      note: "预算紧时更要先确定主次区域，避免把钱花在不产生转化的位置。",
    },
    {
      name: "拍照传播风险",
      value: wantsPhoto ? 80 : 55,
      note: "短视频和小红书时代，门店光感会直接影响顾客是否愿意拍照传播。",
    },
    {
      name: "位置模式风险",
      value: data.storeLocation === "社区店" ? 52 : data.storeLocation === "商场店" ? 72 : 78,
      note: `${data.storeLocation}的客群和商业模式不同，门头、橱窗、试衣间的优先级也不同。`,
    },
  ];

  return {
    ...data,
    score,
    risk,
    level: score >= 78 ? "高风险" : score >= 62 ? "中高风险" : "可控风险",
    headline:
      score >= 78
        ? "你的方案已经接近施工决策点，建议立即复核灯光预留。"
        : score >= 62
          ? "现在介入灯光规划，能少走很多弯路。"
          : "当前阶段很好，适合把灯光标准提前写进设计要求。",
    reason: hasLateStage
      ? "你已经进入施工或临近开工，灯具轨道、开孔、回路如果没定，后期补救会更贵。"
      : "你还处在设计前期，可以把灯光、陈列、动线和预算一起定下来。",
    colorTemp: premium || data.style === "老钱风" ? "3000K-3500K" : data.style === "极简" ? "3500K-4000K" : "3500K",
    cri: premium || wantsPhoto ? "Ra95+" : "Ra90+",
    location,
  };
}

function renderReport(report) {
  latestReport = report;
  document.querySelector("#reportTitle").textContent = `${report.city}${report.category}开店设计预案`;
  document.querySelector("#riskScore").textContent = report.score;
  document.querySelector("#riskLabel").textContent = report.level;
  document.querySelector("#riskHeadline").textContent = report.headline;
  document.querySelector("#riskReason").textContent = report.reason;
  document.querySelector("#scoreArc").style.strokeDashoffset = String(314 - (report.score / 100) * 314);

  document.querySelector("#riskGrid").innerHTML = report.risk
    .map(
      (item) => `
        <div class="risk-item">
          <strong>${item.name}</strong>
          <div class="risk-meter"><i style="width:${Math.min(100, item.value)}%"></i></div>
          <span>${item.note}</span>
        </div>
      `,
    )
    .join("");

  const goals = report.goals.length ? report.goals.join("、") : "显高级、提升成交";
  document.querySelector("#designPlan").innerHTML = `
    <p><b>定位建议：</b>${report.category}在${report.city}开店，建议围绕“${report.style} + ${goals}”建立第一版设计方向，不要只追求效果图好看，要先确认顾客进店后看到什么、走到哪里、试穿时是否愿意成交。</p>
    <p><b>位置模式：</b>${report.storeLocation}的客群逻辑是：${report.location.customer}${report.location.business}</p>
    <p><b>空间分区：</b>门头和橱窗负责吸引路人，入口 3 米内要放主推款或高毛利款；中岛区做新品和搭配；侧墙做系列陈列；试衣间和收银区不能只当功能区，要做成成交和复购的关键节点。</p>
    <p><b>动线建议：</b>${report.area}的店铺建议先定一条主通道，再用重点灯光引导顾客完成“进店、看主推、试穿、成交”的路径。${report.location.layout}</p>
    <p><b>预算建议：</b>${report.budget}预算下，优先把钱放在门头橱窗、试衣间、重点陈列和灯光系统。软装可以迭代，灯位和电路一旦施工后再改，成本更高。</p>
  `;

  document.querySelector("#lightingPlan").innerHTML = `
    <p><b>推荐色温：</b>${report.colorTemp}。${report.style}风格不建议全店单一亮白光，容易让衣服失去质感。</p>
    <p><b>推荐显指：</b>${report.cri}。服装店不是“够亮就行”，显色指数会直接影响面料颜色、肤色和拍照效果。</p>
    <p><b>位置灯光策略：</b>${report.location.lighting}</p>
    <p><b>重点区域：</b>橱窗、入口主推款、中岛、侧墙陈列、试衣间、收银台需要分层布光。试衣间建议单独复核，避免脸部阴影和衣服偏色。</p>
    <p><b>前置预留：</b>平面图阶段确认轨道走向，吊顶图阶段确认开孔尺寸和吊顶深度，水电阶段确认回路控制。不要等软装进场后才补灯。</p>
  `;

  const checklist = [
    `请设计师在平面图上标出主通道、橱窗、试衣间、收银台和主推陈列区。`,
    `${report.storeLocation}要先明确客流来源和成交模式：商场看同层竞争，社区看复购舒适度，商业街看远距离截流。`,
    `确认轨道灯或嵌入式灯具的安装方式，提前核对吊顶高度和开孔尺寸。`,
    `橱窗、重点陈列、试衣间建议单独回路，后期可按场景调节。`,
    `试衣间不要只用顶光，需要关注脸部阴影、肤色和全身镜前显瘦效果。`,
    `灯具显指建议不低于 ${report.cri}，色温优先按品牌风格选择 ${report.colorTemp}。`,
    `如果是连锁店，请把灯具型号、灯距、角度、回路和验收标准写成可复制模板。`,
    `施工前让灯光方复核一次平面图/吊顶图，比开业前补救更省钱。`,
  ];
  document.querySelector("#designerChecklist").innerHTML = checklist.map((item) => `<li>${item}</li>`).join("");
  showScreen("screenReport");
}

function getLeads() {
  try {
    return JSON.parse(localStorage.getItem(leadKey) || "[]");
  } catch {
    return [];
  }
}

function setLeads(leads) {
  localStorage.setItem(leadKey, JSON.stringify(leads));
}

function saveLead() {
  if (!latestReport) return;
  const name = document.querySelector("#leadName").value.trim();
  const contact = document.querySelector("#leadContact").value.trim();
  const message = document.querySelector("#leadMessage");
  if (!name || !contact) {
    message.textContent = "请先填写称呼和微信/手机号。";
    return;
  }
  const leads = getLeads();
  leads.unshift({
    id: Date.now(),
    name,
    contact,
    createdAt: new Date().toLocaleString("zh-CN"),
    city: latestReport.city,
    category: latestReport.category,
    storeLocation: latestReport.storeLocation,
    area: latestReport.area,
    budget: latestReport.budget,
    stage: latestReport.stage,
    score: latestReport.score,
    pain: latestReport.pain || latestReport.notes || "",
    fileName: latestReport.fileName,
  });
  setLeads(leads);
  message.textContent = "已保存。下一步可以把这条线索分配给设计师，做一次灯光预留复核。";
  if (adminUnlocked) renderLeads();
}

function renderLeads() {
  if (!adminUnlocked) return;
  const leads = getLeads();
  const list = document.querySelector("#leadList");
  if (!leads.length) {
    list.innerHTML = `<div class="empty-state">还没有线索。生成报告后填写联系方式，就会出现在这里。</div>`;
    return;
  }
  list.innerHTML = leads
    .map(
      (lead) => `
        <div class="lead-item">
          <h3>${lead.name} · ${lead.score}分</h3>
          <p>${lead.contact}</p>
          <p>${lead.city}｜${lead.category}｜${lead.storeLocation || "未填写位置"}｜${lead.area}｜${lead.stage}</p>
          <p>预算：${lead.budget} ${lead.fileName ? `｜资料：${lead.fileName}` : ""}</p>
          <p>${lead.createdAt}</p>
        </div>
      `,
    )
    .join("");
}

function exportLeads() {
  const leads = getLeads();
  if (!leads.length) return;
  const header = ["时间", "称呼", "联系方式", "城市", "店铺类型", "店铺位置", "面积", "预算", "阶段", "风险分", "痛点", "资料"];
  const rows = leads.map((lead) => [
    lead.createdAt,
    lead.name,
    lead.contact,
    lead.city,
    lead.category,
    lead.storeLocation || "",
    lead.area,
    lead.budget,
    lead.stage,
    lead.score,
    lead.pain,
    lead.fileName,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `服装店设计预案线索_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function backupLeads() {
  const leads = getLeads();
  const blob = new Blob([JSON.stringify(leads, null, 2)], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `服装店设计预案线索备份_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.querySelector("#startButton").addEventListener("click", () => showScreen("screenForm"));
document.querySelector("#backButton").addEventListener("click", () => {
  const active = document.querySelector(".screen.is-active")?.id;
  if (active === "screenForm" && currentStep > 0) setStep(currentStep - 1);
  else showScreen("screenStart");
});
document.querySelector("#closeAdminButton").addEventListener("click", () => showScreen(latestReport ? "screenReport" : "screenStart"));
document.querySelector("#newReportButton").addEventListener("click", () => showScreen("screenForm"));
document.querySelector("#saveLeadButton").addEventListener("click", saveLead);
document.querySelector("#exportLeadsButton").addEventListener("click", exportLeads);
document.querySelector("#backupLeadsButton").addEventListener("click", backupLeads);
document.querySelector("#clearLeadsButton").addEventListener("click", () => {
  if (confirm("确认清空本地线索？")) {
    setLeads([]);
    renderLeads();
  }
});

prevStepButton.addEventListener("click", () => setStep(currentStep - 1));
nextStepButton.addEventListener("click", () => {
  if (!validateCurrentStep()) return;
  if (currentStep < formSteps.length - 1) {
    setStep(currentStep + 1);
  } else {
    renderReport(calculateReport(getData()));
  }
});

fileInput.addEventListener("change", () => {
  fileName.textContent = fileInput.files[0]?.name || "可选，第一版会记录文件名，后续人工复核";
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.target));
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "l") {
    openAdmin();
  }
});

setStep(0);
setAdminVisibility();
if (adminUnlocked) {
  showScreen("screenAdmin");
} else {
  showScreen("screenStart");
}
