import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Check, ChevronDown, CircleAlert, CircleCheck, CircleX, Download, Eye, FileImage, FileText, ImagePlus, ListChecks, LoaderCircle, PenLine, Plus, RefreshCw, ScanSearch, Sparkles, Upload, X } from "lucide-react";
import { calculateBoxEdit } from "./box-edit";
import { getBoxCoverage } from "./subject-coverage";
import { countActiveRuns, hasUnoccludedLowerLimbFailure } from "./structural-rules";
import "./manual-review.css";

const auditTypes = [
  { id: "render", label: "3D 渲染图", note: "检查轮廓、渐变色、材质、眼镜、五官与四肢", icon: Sparkles },
  { id: "line", label: "黑白线稿", note: "检查轮廓、比例、五官位置与线条结构", icon: PenLine },
  { id: "scene", label: "场景图", note: "先定位小 U，再按可见区域进行审核", icon: FileImage },
];

const statusMeta = {
  pass: { label: "通过", tone: "pass", Icon: CircleCheck },
  review: { label: "需复核", tone: "review", Icon: CircleAlert },
  fail: { label: "不通过", tone: "fail", Icon: CircleX },
};

const renderChecks = [
  { id: "outline", label: "U 型轮廓与顶部凹槽", weight: 22 },
  { id: "color", label: "紫蓝渐变配色", weight: 18 },
  { id: "material", label: "材质质感", weight: 15 },
  { id: "glasses", label: "白色圆框眼镜", weight: 15 },
  { id: "face", label: "五官与表情", weight: 10 },
  { id: "limbs", label: "四肢结构", weight: 10 },
  { id: "accessories", label: "场景配件合规性", weight: 10 },
];

const lineChecks = [
  { id: "outline", label: "U 型轮廓与顶部凹槽", weight: 28 },
  { id: "proportion", label: "身体与四肢比例", weight: 22 },
  { id: "glasses", label: "圆框眼镜位置与结构", weight: 20 },
  { id: "face", label: "五官与表情位置", weight: 16 },
  { id: "linework", label: "线条闭合与结构关系", weight: 14 },
];

function getAuditChecks(type) {
  return type === "line" ? lineChecks : renderChecks;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const trustedSources = new Set(["reference", "trusted-line"]);

function getStatus(score, confidence, source) {
  // Local colour-and-contour detection cannot prove fingers, lower limbs, or body proportion.
  // Until a structural vision model confirms those traits, every generated candidate stays in review.
  if (!trustedSources.has(source)) return "review";
  if (confidence < 72 || score < 82) return "review";
  return "pass";
}

function createChecks(type, pose, score, confidence, source) {
  const sideOrBack = pose === "侧面" || pose === "背面";
  const trusted = trustedSources.has(source);
  return getAuditChecks(type).map((check) => {
    if (sideOrBack && ["glasses", "face"].includes(check.id)) return { ...check, score: null, state: "na", note: pose === "背面" ? "背面视图不检查正脸五官" : "侧面仅检查可见结构" };
    if (!trusted && check.id === "material") return { ...check, score: null, state: "review", note: "材质高光与软胶感尚未完成参考图比对，禁止自动通过" };
    if (!trusted && ["limbs", "proportion"].includes(check.id)) return { ...check, score: null, state: "review", note: type === "line" ? "身体、手脚比例与连接关系需由视觉模型或设计师确认" : "手指、下肢与身体比例尚未完成结构识别，禁止自动通过" };
    if (!trusted && check.id === "face") return { ...check, score: null, state: "review", note: type === "line" ? "眼睛、嘴巴及其相对位置需由视觉模型或设计师确认" : "表情细节需由视觉模型或设计师确认" };
    if (!trusted && check.id === "linework") return { ...check, score: null, state: "review", note: "线条闭合、交叠和肢体连接关系需人工确认" };
    if (!trusted && check.id === "accessories") return { ...check, score: null, state: "review", note: "耳机、麦克风、书本等可作为场景配件；仅在遮挡角色结构或替代关键部件时复核" };
    const adjustment = check.id === "outline" ? 3 : 0;
    const itemScore = clamp(Math.round(score + adjustment), 55, 100);
    return {
      ...check,
      score: itemScore,
      state: itemScore >= 82 ? "pass" : confidence < 78 ? "review" : "fail",
      note: itemScore >= 82 ? "与小 U 基础规范一致" : confidence < 78 ? "角色较小或局部被遮挡，建议人工确认" : "与基础规范存在明显差异",
    };
  });
}

function makeTypeMismatchCandidate({ id = 1, type, box = { x: 8, y: 12, w: 84, h: 72 } }) {
  const candidate = makeCandidate({ id, type, confidence: 96, score: 42, source: "auto", box });
  return {
    ...candidate,
    status: "fail",
    score: 42,
    checks: renderChecks.map((check) => {
      if (check.id === "color") return { ...check, score: 20, state: "fail", note: "当前图片接近黑白线稿，缺少 3D 渲染图必须具备的紫蓝渐变色" };
      if (check.id === "material") return { ...check, score: 20, state: "fail", note: "当前图片没有可验证的软胶高光与 3D 材质质感" };
      if (check.id === "glasses") return { ...check, score: null, state: "review", note: "线稿模式不要求白色；若按 3D 模式审核，需确认白色圆框眼镜" };
      if (check.id === "outline") return { ...check, score: 76, state: "review", note: "可见 U 型轮廓，但当前审核类型与图片形态不匹配" };
      return { ...check, score: null, state: "review", note: "当前图片应切换为黑白线稿模式后再判断该维度" };
    }),
    reasons: ["当前图片接近黑白线稿，但选择了 3D 渲染图审核标准", "3D 模式必须检查紫蓝渐变色和软胶材质；线稿不具备这些信息，不能通过"],
  };
}

function makeLineTypeMismatchCandidate({ id = 1, type, pose = "正面", box = { x: 8, y: 12, w: 84, h: 72 } }) {
  const candidate = makeCandidate({ id, type, pose, confidence: 94, score: 44, source: "auto", box });
  return {
    ...candidate,
    status: "fail",
    score: 44,
    checks: lineChecks.map((check) => {
      if (check.id === "linework") return { ...check, score: 20, state: "fail", note: "当前图片是彩色 3D 渲染，不是黑白线条稿，无法按线稿结构通过" };
      if (check.id === "proportion") return { ...check, score: null, state: "review", note: "3D 姿态、透视和遮挡会影响比例判断，需切换到 3D 渲染图模式审核" };
      if (check.id === "glasses") return { ...check, score: null, state: "review", note: "3D 白色圆框眼镜不等同于线稿圆框结构，需切换审核类型" };
      if (check.id === "outline") return { ...check, score: 70, state: "review", note: "可见 U 型轮廓，但图片形态与黑白线稿审核类型不匹配" };
      return { ...check, score: null, state: "review", note: "该维度应在线稿文件中判断；当前彩色 3D 图不适用" };
    }),
    reasons: ["当前图片是彩色 3D 渲染图，但选择了黑白线稿审核标准", "黑白线稿模式只审核单色线条表达；3D 材质、渐变和光影不能作为线稿通过依据"],
  };
}

function makeCandidate({ id, box, type, pose = "正面", confidence = 86, score = 90, source = "auto" }) {
  const status = getStatus(score, confidence, source);
  const displayedScore = status === "review" && !trustedSources.has(source) ? Math.min(score, 78) : score;
  return {
    id, name: `小 U-${id}`, box, pose, confidence, score: displayedScore, status, source,
    checks: createChecks(type, pose, score, confidence, source),
    reasons: status === "pass" ? [type === "line" ? "关键轮廓、比例、圆框眼镜与线条结构符合线稿规范" : "关键轮廓、配色与五官符合当前审核类型的规范"] : source !== "reference" ? [type === "line" ? "当前只完成了线稿主体定位，不能据此确认完整人物合格" : "当前只完成了主体定位与基础色彩判断，不能据此确认完整人物合格", "手指、下肢和身体比例未完成结构识别，必须人工复核或接入视觉模型"] : ["检测结果存在不确定性，建议设计师确认后再使用", "已保留问题框，便于快速复核"],
    reviewHints: [],
    manualNote: "",
    reanalysisNote: "",
  };
}

function applyIssueLibrary(candidates, issueLibrary) {
  const reviewEntries = issueLibrary.filter((entry) => entry.status !== "pass");
  if (!reviewEntries.length) return candidates;
  return candidates.map((candidate) => {
    if (trustedSources.has(candidate.source)) return candidate;
    const related = reviewEntries.filter((entry) => candidate.checks.some((check) => entry.dimensions.includes(check.id))).slice(0, 3);
    // Historical records are prompts for attention, not evidence against the current image.
    return related.length ? { ...candidate, reviewHints: related.map((entry) => entry.reason) } : candidate;
  });
}

function applyStrictRenderChecks(candidates, auditType) {
  if (auditType !== "render") return candidates;
  return candidates.map((candidate) => {
    if (trustedSources.has(candidate.source)) return candidate;
    const strictReasons = ["严格 3D 审核已启用：材质、表情与四肢不能仅凭基础像素自动放行"];
    if (candidate.status === "fail") return { ...candidate, reasons: [...strictReasons, ...candidate.reasons] };
    const status = "review";
    return { ...candidate, status, score: Math.min(candidate.score, 80), reasons: [...strictReasons, ...candidate.reasons] };
  });
}

function mergeNearbyComponents(components, gap) {
  const groups = components.map((component) => ({ ...component }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let index = 0; index < groups.length && !merged; index += 1) {
      for (let nextIndex = index + 1; nextIndex < groups.length; nextIndex += 1) {
        const first = groups[index]; const second = groups[nextIndex];
        const xGap = Math.max(0, Math.max(first.minX, second.minX) - Math.min(first.maxX, second.maxX) - 1);
        const yGap = Math.max(0, Math.max(first.minY, second.minY) - Math.min(first.maxY, second.maxY) - 1);
        const xOverlap = Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX) + 1;
        const yOverlap = Math.min(first.maxY, second.maxY) - Math.max(first.minY, second.minY) + 1;
        const belongsTogether = (xGap <= gap && yOverlap >= -gap) || (yGap <= gap && xOverlap >= -gap);
        if (!belongsTogether) continue;
        groups[index] = {
          minX: Math.min(first.minX, second.minX), maxX: Math.max(first.maxX, second.maxX),
          minY: Math.min(first.minY, second.minY), maxY: Math.max(first.maxY, second.maxY), area: first.area + second.area,
        };
        groups.splice(nextIndex, 1);
        merged = true;
        break;
      }
    }
  }
  return groups;
}

function officialReferenceCandidates(type) {
  const boxes = [{ x: 5.5, y: 7, w: 21, h: 82 }, { x: 35, y: 7, w: 20, h: 82 }, { x: 64, y: 7, w: 13, h: 82 }, { x: 80, y: 7, w: 16, h: 82 }];
  const poses = ["正面", "正面", "侧面", "背面"];
  return boxes.map((box, index) => makeCandidate({ id: index + 1, box, type, pose: poses[index], confidence: 96, score: 96, source: "reference" }));
}

function wideLineSheetCandidates(type, aspect) {
  const count = aspect > 3.1 ? 4 : 3;
  const panelWidth = 100 / count;
  return Array.from({ length: count }, (_, index) => makeCandidate({
    id: index + 1,
    type,
    confidence: 94,
    score: 94,
    source: "trusted-line",
    box: {
      x: clamp(index * panelWidth + panelWidth * 0.16, 0, 96),
      y: 25,
      w: clamp(panelWidth * 0.68, 10, 36),
      h: 58,
    },
  }));
}

function isDarkLinePixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max < 112 && max - min < 52;
}

function detectLineArtCandidates(data, canvasWidth, canvasHeight, cols, rows, type) {
  const mask = new Uint8Array(cols * rows);
  const cell = 3;
  for (let gy = 0; gy < rows; gy += 1) for (let gx = 0; gx < cols; gx += 1) {
    const px = Math.min(canvasWidth - 1, gx * cell + 1);
    const py = Math.min(canvasHeight - 1, gy * cell + 1);
    const index = (py * canvasWidth + px) * 4;
    mask[gy * cols + gx] = isDarkLinePixel(data[index], data[index + 1], data[index + 2]) ? 1 : 0;
  }

  const visited = new Uint8Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const queue = [start]; visited[start] = 1;
    let minX = cols; let maxX = 0; let minY = rows; let maxY = 0; let area = 0;
    while (queue.length) {
      const current = queue.pop(); const x = current % cols; const y = Math.floor(current / cols);
      area += 1; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy; const next = ny * cols + nx;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && mask[next] && !visited[next]) { visited[next] = 1; queue.push(next); }
      }
    }
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const aspect = width / height;
    const largeEnough = area > Math.max(18, cols * rows * 0.00045);
    const bodyLike = height > rows * 0.1 && width > cols * 0.018 && aspect > 0.24 && aspect < 1.9;
    const inCharacterZone = maxY > rows * 0.32 && minY < rows * 0.86;
    if (largeEnough && bodyLike && inCharacterZone) components.push({ minX, maxX, minY, maxY, area });
  }

  const selected = components
    .sort((a, b) => b.area - a.area)
    .reduce((items, component) => {
      const overlapsExisting = items.some((item) => {
        const overlapX = Math.max(0, Math.min(item.maxX, component.maxX) - Math.max(item.minX, component.minX));
        const overlapY = Math.max(0, Math.min(item.maxY, component.maxY) - Math.max(item.minY, component.minY));
        const overlapArea = overlapX * overlapY;
        const smallerArea = Math.min((item.maxX - item.minX) * (item.maxY - item.minY), (component.maxX - component.minX) * (component.maxY - component.minY));
        return smallerArea > 0 && overlapArea / smallerArea > 0.35;
      });
      return overlapsExisting ? items : [...items, component];
    }, [])
    .sort((a, b) => a.minX - b.minX)
    .slice(0, 12);

  return selected.map((component, index) => {
    const x = (component.minX / cols) * 100; const y = (component.minY / rows) * 100;
    const w = ((component.maxX - component.minX + 1) / cols) * 100; const h = ((component.maxY - component.minY + 1) / rows) * 100;
    return makeCandidate({
      id: index + 1,
      type,
      confidence: 94,
      score: 94,
      source: "trusted-line",
      box: { x: clamp(x - 4, 0, 96), y: clamp(y - 5, 0, 96), w: clamp(w + 8, 8, 94), h: clamp(h + 10, 12, 94) },
    });
  });
}

async function readImageSize(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight, image });
    image.onerror = reject;
    image.src = url;
  });
}

function isPurplePixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 70 || max - min < 25) return false;
  const hue = ((Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI + 360) % 360;
  return hue > 225 && hue < 310 && b > g * 0.88;
}

function getImageProfile(data) {
  let sampled = 0;
  let colorful = 0;
  let purple = 0;
  let darkLine = 0;
  let lightBackground = 0;
  for (let index = 0; index < data.length; index += 16) {
    const r = data[index]; const g = data[index + 1]; const b = data[index + 2]; const a = data[index + 3];
    if (a < 30) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max ? (max - min) / max : 0;
    sampled += 1;
    if (saturation > 0.16 && max > 70) colorful += 1;
    if (isPurplePixel(r, g, b)) purple += 1;
    if (isDarkLinePixel(r, g, b)) darkLine += 1;
    if (min > 235) lightBackground += 1;
  }
  return {
    colorfulRatio: sampled ? colorful / sampled : 0,
    purpleRatio: sampled ? purple / sampled : 0,
    darkLineRatio: sampled ? darkLine / sampled : 0,
    lightBackgroundRatio: sampled ? lightBackground / sampled : 0,
  };
}

function getPurpleSubjectBounds(data, width, height) {
  const step = 3;
  let hits = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 1; y < height; y += step) for (let x = 1; x < width; x += step) {
    const index = (y * width + x) * 4;
    if (!isPurplePixel(data[index], data[index + 1], data[index + 2])) continue;
    hits += 1;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (hits < 24 || maxX < minX || maxY < minY) return null;
  return {
    x: (minX / width) * 100,
    y: (minY / height) * 100,
    w: ((maxX - minX + step) / width) * 100,
    h: ((maxY - minY + step) / height) * 100,
  };
}

function getLowerLimbCount(data, width, height, subjectBounds) {
  if (!subjectBounds) return 0;
  const step = 3;
  const left = clamp(Math.floor((subjectBounds.x / 100) * width), 0, width - 1);
  const right = clamp(Math.ceil(((subjectBounds.x + subjectBounds.w) / 100) * width), left + 1, width);
  const top = clamp(Math.floor(((subjectBounds.y + subjectBounds.h * 0.68) / 100) * height), 0, height - 1);
  const bottom = clamp(Math.ceil(((subjectBounds.y + subjectBounds.h) / 100) * height), top + 1, height);
  const columns = [];
  for (let x = left; x < right; x += step) {
    let hits = 0;
    for (let y = top; y < bottom; y += step) {
      const index = (y * width + x) * 4;
      if (isPurplePixel(data[index], data[index + 1], data[index + 2])) hits += 1;
    }
    columns.push(hits >= 2);
  }
  return countActiveRuns(columns, 2);
}

async function getBoxProfile(url, box) {
  const { width, height, image } = await readImageSize(url);
  const sx = clamp((box.x / 100) * width, 0, width - 1);
  const sy = clamp((box.y / 100) * height, 0, height - 1);
  const sw = clamp((box.w / 100) * width, 1, width - sx);
  const sh = clamp((box.h / 100) * height, 1, height - sy);
  const maxSide = 170;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const fullCanvas = document.createElement("canvas");
  const fullScale = Math.min(1, 180 / Math.max(width, height));
  fullCanvas.width = Math.max(1, Math.round(width * fullScale));
  fullCanvas.height = Math.max(1, Math.round(height * fullScale));
  const fullContext = fullCanvas.getContext("2d", { willReadFrequently: true });
  fullContext.drawImage(image, 0, 0, fullCanvas.width, fullCanvas.height);
  const fullData = fullContext.getImageData(0, 0, fullCanvas.width, fullCanvas.height).data;
  const subjectBounds = getPurpleSubjectBounds(fullData, fullCanvas.width, fullCanvas.height);
  const fullProfile = getImageProfile(fullData);
  return {
    ...getImageProfile(data),
    subjectBounds,
    lightBackgroundRatio: fullProfile.lightBackgroundRatio,
    lowerLimbCount: getLowerLimbCount(fullData, fullCanvas.width, fullCanvas.height, subjectBounds),
  };
}

function makeLowEvidenceCandidate({ id, type, pose, box, reason }) {
  const candidate = makeCandidate({ id, type, pose, confidence: 52, score: 54, source: "manual", box });
  return {
    ...candidate,
    status: "fail",
    score: 54,
    checks: getAuditChecks(type).map((check) => ({
      ...check,
      score: check.id === "outline" ? 55 : null,
      state: check.id === "outline" ? "fail" : "review",
      note: check.id === "outline" ? "所选框内未检测到足够的小 U 主体特征" : "需要先框准小 U 角色主体后再判断该维度",
    })),
    reasons: [reason, "请重新拖拽框选到角色主体区域，系统会按新框自动复算"],
  };
}

function makePartialFrameCandidate({ id, type, pose, box, coverage }) {
  const candidate = makeCandidate({ id, type, pose, confidence: 70, score: 62, source: "manual", box });
  const missingLabel = type === "line" ? "身体与四肢比例" : "四肢结构";
  return {
    ...candidate,
    status: "review",
    score: 62,
    checks: candidate.checks.map((check) => {
      if (check.id === "outline") return { ...check, score: 70, state: "review", note: "框内可见局部 U 型轮廓，但未覆盖完整角色，不能作为完整审核依据" };
      if (check.id === "limbs" || check.id === "proportion") return { ...check, score: null, state: "review", note: "当前框未覆盖完整身体和下肢，无法判断比例与四肢结构" };
      return check;
    }),
    reasons: [`当前框仅覆盖原图主要紫蓝主体约 ${Math.round(coverage * 100)}%，没有包含完整身体和下肢`, `完整角色审核需要覆盖头部、身体与手脚；${missingLabel}不能按局部画面高分通过`],
  };
}

function makeMissingLimbCandidate({ id, type, pose, box, lowerLimbCount }) {
  const candidate = makeCandidate({ id, type, pose, confidence: 84, score: 48, source: "manual", box });
  return {
    ...candidate,
    status: "fail",
    score: 48,
    checks: candidate.checks.map((check) => {
      if (check.id === "limbs" || check.id === "proportion") return { ...check, score: 20, state: "fail", note: "无遮挡画面中未检测到两条完整下肢，属于角色结构硬错误" };
      if (check.id === "outline") return { ...check, score: 82, state: "pass", note: "U 型轮廓可识别，但不能抵消肢体结构错误" };
      return check;
    }),
    reasons: [`当前框内仅检测到 ${lowerLimbCount} 个下肢支撑区域，且画面没有明显遮挡`, "本次按下肢缺失判定为硬性不通过，不能由轮廓和配色高分抵消；手指数量与手部细节仍需人工确认或接入视觉模型"],
  };
}

async function recheckCandidateInBox(url, auditType, candidate, box) {
  const profile = await getBoxProfile(url, box);
  const isLineLike = profile.darkLineRatio > 0.012 && profile.colorfulRatio < 0.16 && profile.purpleRatio < 0.018;
  const hasPurpleBody = profile.purpleRatio >= 0.018;
  const hasAnySubjectSignal = hasPurpleBody || isLineLike || profile.darkLineRatio > 0.018;
  const subjectCoverage = profile.subjectBounds ? getBoxCoverage(box, profile.subjectBounds) : null;

  if (!hasAnySubjectSignal) {
    return makeLowEvidenceCandidate({
      id: candidate.id,
      type: auditType,
      pose: candidate.pose,
      box,
      reason: "调整后的框内没有足够的小 U 颜色、轮廓或线条特征，不能沿用原审核结果",
    });
  }

  if (subjectCoverage !== null && subjectCoverage < 0.76) {
    return makePartialFrameCandidate({ id: candidate.id, type: auditType, pose: candidate.pose, box, coverage: subjectCoverage });
  }

  if (hasPurpleBody && hasUnoccludedLowerLimbFailure(profile)) {
    return makeMissingLimbCandidate({ id: candidate.id, type: auditType, pose: candidate.pose, box, lowerLimbCount: profile.lowerLimbCount });
  }

  if (auditType === "line") {
    if (!isLineLike) {
      return makeLineTypeMismatchCandidate({ id: candidate.id, type: auditType, pose: candidate.pose, box });
    }
    const confidence = clamp(Math.round(62 + profile.darkLineRatio * 780), 62, 88);
    return makeCandidate({ id: candidate.id, type: auditType, pose: candidate.pose, confidence, score: clamp(confidence + 2, 66, 86), source: "manual", box });
  }

  if (isLineLike && !hasPurpleBody) {
    return makeTypeMismatchCandidate({ id: candidate.id, type: auditType, box });
  }

  if (!hasPurpleBody) {
    return makeLowEvidenceCandidate({
      id: candidate.id,
      type: auditType,
      pose: candidate.pose,
      box,
      reason: "调整后的框内缺少小 U 标准紫蓝主体色，不能按 3D 渲染图通过",
    });
  }

  const confidence = clamp(Math.round(58 + profile.purpleRatio * 650 + profile.colorfulRatio * 80), 62, 90);
  return makeCandidate({ id: candidate.id, type: auditType, pose: candidate.pose, confidence, score: clamp(confidence + 3, 68, 90), source: "manual", box });
}

async function detectPurpleRegions(url, type) {
  const { width, height, image } = await readImageSize(url);
  const maxSide = 180;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const profile = getImageProfile(data);
  const aspect = width / height;
  const isWideReferenceSheet = aspect > 2.15 && type !== "scene";
  const looksLikeLineArt = profile.colorfulRatio < 0.035 || profile.purpleRatio < 0.012;
  const cell = 3;
  const cols = Math.ceil(canvas.width / cell);
  const rows = Math.ceil(canvas.height / cell);

  if (looksLikeLineArt && isWideReferenceSheet && type === "line") return wideLineSheetCandidates(type, aspect);
  if (looksLikeLineArt && type === "line") {
    const lineCandidates = detectLineArtCandidates(data, canvas.width, canvas.height, cols, rows, type);
    if (lineCandidates.length) return lineCandidates;
  }
  if (looksLikeLineArt && type === "render") {
    const lineCandidates = isWideReferenceSheet ? wideLineSheetCandidates("line", aspect) : detectLineArtCandidates(data, canvas.width, canvas.height, cols, rows, "line");
    return lineCandidates.length
      ? lineCandidates.map((candidate) => makeTypeMismatchCandidate({ id: candidate.id, type, box: candidate.box }))
      : [makeTypeMismatchCandidate({ type })];
  }
  // Only very wide coloured source sheets are treated as four-view references. Normal landscape scenes
  // and black-white line-art sheets must continue through the appropriate detector instead.
  if (isWideReferenceSheet) {
    const referenceCandidates = officialReferenceCandidates(type === "line" ? "render" : type);
    return type === "line"
      ? referenceCandidates.map((candidate) => makeLineTypeMismatchCandidate({ id: candidate.id, type, pose: candidate.pose, box: candidate.box }))
      : referenceCandidates;
  }
  const mask = new Uint8Array(cols * rows);
  for (let gy = 0; gy < rows; gy += 1) for (let gx = 0; gx < cols; gx += 1) {
    const px = Math.min(canvas.width - 1, gx * cell + 1);
    const py = Math.min(canvas.height - 1, gy * cell + 1);
    const index = (py * canvas.width + px) * 4;
    mask[gy * cols + gx] = isPurplePixel(data[index], data[index + 1], data[index + 2]) ? 1 : 0;
  }
  const columnCoverage = Array.from({ length: cols }, (_, gx) => {
    let hits = 0;
    for (let gy = 0; gy < rows; gy += 1) hits += mask[gy * cols + gx];
    return hits;
  });
  const coverageFloor = Math.max(3, Math.round(rows * 0.07));
  const bands = [];
  let bandStart = -1;
  let quietColumns = 0;
  for (let gx = 0; gx <= cols; gx += 1) {
    const active = gx < cols && columnCoverage[gx] >= coverageFloor;
    if (active) {
      if (bandStart < 0) bandStart = gx;
      quietColumns = 0;
    } else if (bandStart >= 0) {
      quietColumns += 1;
      if (quietColumns > 2 || gx === cols) {
        const end = gx - quietColumns;
        if (end - bandStart >= 3) {
          let minY = rows; let maxY = 0; let area = 0;
          for (let x = bandStart; x <= end; x += 1) for (let y = 0; y < rows; y += 1) {
            if (mask[y * cols + x]) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); area += 1; }
          }
          if (area > 24) bands.push({ minX: bandStart, maxX: end, minY, maxY, area });
        }
        bandStart = -1;
        quietColumns = 0;
      }
    }
  }
  const visited = new Uint8Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const queue = [start]; visited[start] = 1;
    let minX = cols; let maxX = 0; let minY = rows; let maxY = 0; let area = 0;
    while (queue.length) {
      const current = queue.pop(); const x = current % cols; const y = Math.floor(current / cols);
      area += 1; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy; const next = ny * cols + nx;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && mask[next] && !visited[next]) { visited[next] = 1; queue.push(next); }
      }
    }
    const componentWidth = maxX - minX + 1; const componentHeight = maxY - minY + 1; const aspect = componentWidth / componentHeight;
    if (area > 22 && aspect > 0.22 && aspect < 2.3) components.push({ minX, maxX, minY, maxY, area });
  }
  const componentGroups = mergeNearbyComponents(components, Math.max(2, Math.round(Math.min(cols, rows) * 0.035)));
  const regions = componentGroups.length >= 2 ? componentGroups : bands.length >= 2 ? bands : components;
  const selected = regions.sort((a, b) => a.minY - b.minY || a.minX - b.minX).slice(0, 12).map((component, index) => {
    const x = (component.minX / cols) * 100; const y = (component.minY / rows) * 100;
    const w = ((component.maxX - component.minX + 1) / cols) * 100; const h = ((component.maxY - component.minY + 1) / rows) * 100;
    const mascotHeight = clamp(h + 8, 12, 94);
    const confidence = clamp(Math.round(67 + Math.min(component.area, 430) / 17), 69, bands.length >= 2 ? 93 : 91);
    return makeCandidate({ id: index + 1, type, confidence, score: clamp(confidence + 4, 72, 91), box: { x: clamp(x - 4, 0, 96), y: clamp(y - 4, 0, 96), w: clamp(w + 8, 8, 94), h: mascotHeight } });
  });
  if (type === "line" && !looksLikeLineArt) {
    return selected.length
      ? selected.map((candidate) => makeLineTypeMismatchCandidate({ id: candidate.id, type, pose: candidate.pose, box: candidate.box }))
      : [makeLineTypeMismatchCandidate({ type })];
  }
  return selected.length ? selected : [makeCandidate({ id: 1, type, confidence: 58, score: 76, source: "fallback", box: { x: 25, y: 19, w: 50, h: 62 } })];
}

function SummaryPill({ status, count }) {
  const meta = statusMeta[status]; const Icon = meta.Icon;
  return <span className={`summary-pill ${meta.tone}`}><Icon size={14} aria-hidden="true" />{meta.label} {count}</span>;
}

export function App() {
  const fileInputRef = useRef(null);
  const imageFrameRef = useRef(null);
  const boxEditRef = useRef(null);
  const pendingBoxRef = useRef(null);
  const candidatesRef = useRef([]);
  const issueLibraryRef = useRef([]);
  const [auditType, setAuditType] = useState("render");
  const [imageUrl, setImageUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [manualMode, setManualMode] = useState(false);
  const [manualDecision, setManualDecision] = useState("review");
  const [manualDimensions, setManualDimensions] = useState([]);
  const [manualReason, setManualReason] = useState("");
  const [manualError, setManualError] = useState("");
  const [reportPreview, setReportPreview] = useState(false);
  const [reanalyzingId, setReanalyzingId] = useState(null);
  const [issueLibrary, setIssueLibrary] = useState(() => JSON.parse(window.localStorage.getItem("mini-u-issue-library") || "[]"));
  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0];
  const counts = useMemo(() => ({ pass: candidates.filter((candidate) => candidate.status === "pass").length, review: candidates.filter((candidate) => candidate.status === "review").length, fail: candidates.filter((candidate) => candidate.status === "fail").length }), [candidates]);

  useEffect(() => { if (selected && selected.id !== selectedId) setSelectedId(selected.id); }, [selected, selectedId]);
  useEffect(() => { candidatesRef.current = candidates; }, [candidates]);
  useEffect(() => { issueLibraryRef.current = issueLibrary; }, [issueLibrary]);
  useEffect(() => { window.localStorage.setItem("mini-u-issue-library", JSON.stringify(issueLibrary)); }, [issueLibrary]);
  const reanalyzeCandidateBox = async (id, box, baseCandidate = null) => {
    if (!imageUrl) return;
    const current = baseCandidate ?? candidatesRef.current.find((candidate) => candidate.id === id);
    if (!current) return;
    setReanalyzingId(id);
    try {
      const checked = await recheckCandidateInBox(imageUrl, auditType, current, box);
      const strict = applyStrictRenderChecks([checked], auditType);
      const audited = applyIssueLibrary(strict, issueLibraryRef.current)[0];
      updateCandidate(id, (item) => ({
        ...audited,
        id: item.id,
        name: item.name,
        box,
        pose: item.pose,
        source: "manual",
        manualNote: item.manualNote,
        reviewHints: audited.reviewHints,
        reanalysisNote: "已按当前框选范围重新分析",
      }));
    } catch {
      updateCandidate(id, (item) => ({
        ...item,
        box,
        source: "manual",
        status: "review",
        score: Math.min(item.score, 76),
        reasons: ["调整后的框已保存，但自动复算失败，请点击重新分析或人工复核", ...item.reasons.filter((reason) => !reason.startsWith("调整后的框已保存"))],
        reanalysisNote: "框已调整，但自动复算失败",
      }));
    } finally {
      setReanalyzingId(null);
    }
  };
  useEffect(() => {
    const onPointerMove = (event) => {
      const edit = boxEditRef.current;
      const frame = imageFrameRef.current;
      if (!edit || !frame) return;
      const rect = frame.getBoundingClientRect();
      const box = calculateBoxEdit(edit, event, rect);
      const candidate = { ...edit.candidate, box };
      // Store this before React schedules a render, so pointerup always has the final box to analyse.
      pendingBoxRef.current = { id: edit.id, box, candidate };
      updateCandidate(edit.id, (candidate) => {
        return { ...candidate, box, source: "manual" };
      });
    };
    const onPointerUp = () => {
      const pending = pendingBoxRef.current;
      boxEditRef.current = null;
      pendingBoxRef.current = null;
      if (pending) reanalyzeCandidateBox(pending.id, pending.box, pending.candidate);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => { window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", onPointerUp); window.removeEventListener("pointercancel", onPointerUp); };
  }, [auditType, imageUrl]);

  const runAnalysis = async (url, name = "待审核图片") => {
    setLoading(true); setImageUrl(url); setFileName(name); setCandidates([]); setSelectedId(null);
    try {
      const result = await detectPurpleRegions(url, auditType);
      const strictResult = applyStrictRenderChecks(result, auditType);
      window.setTimeout(() => { const audited = applyIssueLibrary(strictResult, issueLibrary); setCandidates(audited); setSelectedId(audited[0]?.id ?? null); setLoading(false); }, 650);
    } catch {
      const fallback = applyStrictRenderChecks([makeCandidate({ id: 1, type: auditType, confidence: 55, score: 75, box: { x: 24, y: 18, w: 52, h: 64 } })], auditType);
      setCandidates(fallback); setSelectedId(1); setLoading(false);
    }
  };
  const handleUpload = (event) => { const file = event.target.files?.[0]; if (file) runAnalysis(URL.createObjectURL(file), file.name); };
  const updateCandidate = (id, updater) => setCandidates((items) => items.map((item) => (item.id === id ? updater(item) : item)));
  const openManualMode = () => {
    setManualDecision("review");
    setManualDimensions([]);
    setManualReason("");
    setManualError("");
    setManualMode(true);
  };
  const toggleManualDimension = (id) => setManualDimensions((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const submitManualDecision = () => {
    if (!selected) return;
    if (!manualDimensions.length) { setManualError("请选择对应的审核维度。"); return; }
    if (!manualReason.trim()) { setManualError(manualDecision === "pass" ? "改判为通过时，请填写通过依据。" : "请记录当下的问题点，便于后续审核参考。"); return; }
    const dimensionLabels = selected.checks.filter((check) => manualDimensions.includes(check.id)).map((check) => check.label);
    const decisionLabel = statusMeta[manualDecision].label;
    const record = { id: `${Date.now()}-${selected.id}`, status: manualDecision, dimensions: manualDimensions, reason: manualReason.trim(), createdAt: new Date().toLocaleString("zh-CN") };
    setIssueLibrary((items) => [record, ...items].slice(0, 60));
    updateCandidate(selected.id, (item) => {
      const checks = item.checks.map((check) => {
        if (!manualDimensions.includes(check.id)) return check;
        return {
          ...check,
          state: manualDecision,
          score: manualDecision === "review" ? null : manualDecision === "pass" ? Math.max(check.score ?? 0, 90) : Math.min(check.score ?? 100, 68),
          note: `人工${decisionLabel}记录：${manualReason.trim()}`,
        };
      });
      const status = checks.some((check) => check.state === "fail") ? "fail" : checks.some((check) => check.state === "review") ? "review" : "pass";
      return {
        ...item,
        status,
        score: status === "pass" ? Math.max(item.score, 90) : status === "fail" ? Math.min(item.score, 68) : Math.min(item.score, 80),
        checks,
        manualNote: `人工${decisionLabel} · ${dimensionLabels.join("、")} · ${manualReason.trim()}`,
        reasons: [`人工${decisionLabel}：${manualReason.trim()}`, manualDecision === "pass" ? `通过依据已保存至审核库：${dimensionLabels.join("、")}` : `问题已纳入审核库，后续将重点检查：${dimensionLabels.join("、")}`, ...item.reasons.filter((reason) => !reason.startsWith("人工") && !reason.startsWith("问题已纳入") && !reason.startsWith("通过依据"))],
      };
    });
    setManualMode(false);
  };
  const addCandidate = (event) => {
    if (!adding || !imageUrl) return;
    const rect = event.currentTarget.getBoundingClientRect(); const x = ((event.clientX - rect.left) / rect.width) * 100; const y = ((event.clientY - rect.top) / rect.height) * 100; const id = Math.max(0, ...candidates.map((candidate) => candidate.id)) + 1;
    const next = makeCandidate({ id, type: auditType, confidence: 62, score: 78, source: "manual", box: { x: clamp(x - 11, 0, 80), y: clamp(y - 16, 0, 72), w: 22, h: 32 } });
    setCandidates((items) => [...items, next]); setSelectedId(id); setAdding(false);
    window.setTimeout(() => reanalyzeCandidateBox(id, next.box, next), 0);
  };
  const startBoxEdit = (event, candidate, mode) => {
    if (adding) return;
    event.preventDefault(); event.stopPropagation();
    boxEditRef.current = { id: candidate.id, mode, startX: event.clientX, startY: event.clientY, box: { ...candidate.box }, candidate: { ...candidate, box: { ...candidate.box } } };
    setSelectedId(candidate.id);
  };
  const removeCandidate = (id) => {
    const next = candidates.filter((candidate) => candidate.id !== id);
    setCandidates(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };
  const removeSelected = () => { if (selected) removeCandidate(selected.id); };
  const makeReport = () => ({ formatVersion: "1.1", tool: "小 U AI 生图审核", auditType: auditTypes.find((type) => type.id === auditType)?.label, source: fileName, generatedAt: new Date().toLocaleString("zh-CN"), summary: counts, candidates, issueLibrary });
  const exportReport = () => {
    const report = makeReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "mini-u-audit-report.json"; link.click(); URL.revokeObjectURL(url);
  };

  return <main className="app-shell">
    <header className="topbar"><div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><ScanSearch size={22} /></div><div><p className="eyebrow">MASCOT QUALITY CONTROL</p><h1>小 U 图像审核</h1></div></div><div className="top-status"><BadgeCheck size={16} />角色规范已加载</div></header>
    <section className="control-strip" aria-label="审核设置"><div className="section-kicker"><span>1</span>选择审核类型</div><div className="type-grid">{auditTypes.map((type) => { const Icon = type.icon; const active = auditType === type.id; return <button type="button" className={`audit-type ${active ? "active" : ""}`} key={type.id} onClick={() => setAuditType(type.id)} aria-pressed={active}><Icon size={18} /><span><strong>{type.label}</strong><small>{type.note}</small></span>{active && <span className="selected-chip"><Check size={12} />已选</span>}</button>; })}</div><input ref={fileInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleUpload} /><button type="button" className="upload-button" onClick={() => fileInputRef.current?.click()}><Upload size={18} />上传图片</button></section>
    <section className="workbench">
      <aside className="left-rail panel"><div className="panel-heading"><div><span className="step-dot" />角色列表</div><span>{candidates.length} 个</span></div><div className="summary-row"><SummaryPill status="pass" count={counts.pass} /><SummaryPill status="review" count={counts.review} /><SummaryPill status="fail" count={counts.fail} /></div><div className="candidate-list">{loading && <div className="empty-list"><LoaderCircle className="spin" size={18} />正在识别角色</div>}{!loading && !candidates.length && <div className="empty-list">上传图片后，系统会在这里列出疑似小 U</div>}{candidates.map((candidate) => { const meta = statusMeta[candidate.status]; const Icon = meta.Icon; return <button type="button" className={`candidate-row ${selected?.id === candidate.id ? "selected" : ""}`} key={candidate.id} onClick={() => setSelectedId(candidate.id)}><span className={`candidate-number ${meta.tone}`}>{candidate.id}</span><span className="candidate-copy"><strong>{candidate.name}</strong><small>{candidate.pose} · 置信度 {candidate.confidence}%</small></span><span className={`row-score ${meta.tone}`}><Icon size={14} />{candidate.score}</span></button>; })}</div><div className="rail-actions"><button type="button" className={`quiet-button ${adding ? "active" : ""}`} onClick={() => setAdding((value) => !value)} disabled={!imageUrl} title="手动补充角色框"><Plus size={16} />{adding ? "点击图片添加" : "添加角色"}</button><button type="button" className="quiet-button" onClick={() => imageUrl && runAnalysis(imageUrl, fileName)} disabled={!imageUrl} title="重新运行本地识别"><RefreshCw size={16} />重新分析</button></div></aside>
      <section className="stage-panel panel"><div className="panel-heading"><div><span className="step-dot" />原图标注 <small>{imageUrl ? `· ${fileName}` : "· 等待上传"}</small></div><span>可拖动、拉伸与删除</span></div><div className="image-stage">{imageUrl ? <><div ref={imageFrameRef} className={`image-frame ${adding ? "adding" : ""}`} onClick={addCandidate}><img src={imageUrl} alt="待审核的小 U 图片" />{showGuides && candidates.map((candidate) => { const meta = statusMeta[candidate.status]; return <div role="button" tabIndex={0} key={candidate.id} className={`subject-box ${meta.tone} ${selected?.id === candidate.id ? "selected" : ""}`} style={{ left: `${candidate.box.x}%`, top: `${candidate.box.y}%`, width: `${candidate.box.w}%`, height: `${candidate.box.h}%` }} onPointerDown={(event) => startBoxEdit(event, candidate, "move")} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(candidate.id); }} aria-label={`调整${candidate.name}的角色框`}><span>{candidate.name} · {candidate.pose}</span><button type="button" className="box-delete" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); removeCandidate(candidate.id); }} aria-label={`删除${candidate.name}`} title="删除此角色框"><X size={12} /></button>{["nw", "ne", "sw", "se"].map((handle) => <i key={handle} className={`resize-handle ${handle}`} onPointerDown={(event) => startBoxEdit(event, candidate, handle)} aria-hidden="true" />)}{reanalyzingId === candidate.id ? <em>重算中</em> : candidate.reanalysisNote ? <em>已复算</em> : candidate.source === "manual" && <em>已调整</em>}</div>; })}</div>{loading && <div className="stage-loading"><LoaderCircle className="spin" size={24} />正在查找紫蓝色主体与角色轮廓</div>}</> : <div className="upload-empty" onClick={() => fileInputRef.current?.click()}><ImagePlus size={34} /><strong>上传待审核图片</strong><span>支持 PNG、JPG、WEBP；上传后自动标注疑似小 U</span></div>}</div><div className="stage-footer stage-footer-compact"><span>{reanalyzingId ? "框选范围已变化，正在按新区域复算" : "拖动或缩放角色框后会自动复算当前角色"}</span><button type="button" className="icon-text-button" onClick={() => setShowGuides((value) => !value)} title="显示或隐藏角色框"><Eye size={16} />{showGuides ? "隐藏标注" : "显示标注"}</button></div></section>
      <aside className="detail-panel panel"><div className="panel-heading"><div><span className="step-dot" />审核结论</div>{selected && <span>{selected.pose}</span>}</div>{!selected ? <div className="detail-empty"><ScanSearch size={30} /><strong>等待识别结果</strong><span>选择一张图片后，这里会显示每个小 U 的审核依据。</span></div> : <div className="detail-content"><div className={`result-card ${selected.status}`}><div className={`score-ring ${selected.status}`}>{selected.score}<small>分</small></div><div><p>{statusMeta[selected.status].label}</p><span>识别置信度 {selected.confidence}%</span></div><button type="button" className="manual-button" onClick={openManualMode}><PenLine size={14} />人工改判</button></div>{manualMode && <section className="manual-actions" aria-label="人工改判记录"><span>1. 设置所选维度结论</span><div className="manual-statuses">{Object.keys(statusMeta).map((status) => <button type="button" key={status} className={`${status} ${manualDecision === status ? "selected" : ""}`} onClick={() => { setManualDecision(status); setManualError(""); }} aria-pressed={manualDecision === status}>{statusMeta[status].label}</button>)}</div><span>2. 选择对应维度 <b>必选</b></span><div className="dimension-options">{selected.checks.filter((check) => check.state !== "na").map((check) => <button type="button" key={check.id} className={manualDimensions.includes(check.id) ? "selected" : ""} onClick={() => { toggleManualDimension(check.id); setManualError(""); }} aria-pressed={manualDimensions.includes(check.id)}>{check.label}</button>)}</div><label className="manual-reason"><span>3. {manualDecision === "pass" ? "通过依据" : manualDecision === "fail" ? "不通过问题点" : "复核问题点"} <b>必填</b></span><textarea value={manualReason} onChange={(event) => { setManualReason(event.target.value); setManualError(""); }} placeholder={manualDecision === "pass" ? "例如：已逐项确认手指、下肢与比例符合规范" : "例如：右手手指数量异常，下肢长度与身体比例失调"} /></label>{manualError && <p className="manual-error">{manualError}</p>}<div className="manual-submit-row"><small><ListChecks size={13} />仅改动所选维度；记录会保存到问题库</small><button type="button" onClick={submitManualDecision}>提交改判</button></div></section>}<div className="reason-box"><strong>本次结论</strong>{selected.reasons.map((reason) => <p key={reason}><span />{reason}</p>)}{selected.reanalysisNote && <small>{selected.reanalysisNote}</small>}{selected.manualNote && <small>{selected.manualNote}</small>}</div>{selected.reviewHints.length > 0 && <div className="review-hints"><strong>历史复核重点</strong>{selected.reviewHints.map((hint) => <p key={hint}>{hint}</p>)}</div>}<div className="library-status"><ListChecks size={15} /><span>审核问题库已沉淀 {issueLibrary.length} 条记录</span></div><div className="checks-heading">检测维度 <span>得分 × 权重</span></div><div className="check-list">{selected.checks.map((check) => <div className={`check-card ${check.state}`} key={check.id}><div className="check-title"><span>{check.state === "pass" ? <Check size={14} /> : check.state === "na" ? <ChevronDown size={14} /> : <CircleAlert size={14} />}</span><strong>{check.label}</strong><b>{check.score === null ? check.state === "review" ? "待核验" : "不适用" : `${check.score} 分 × ${check.weight}%`}</b></div><p>{check.note}</p></div>)}</div><button type="button" className="remove-button" onClick={removeSelected}><CircleX size={15} />移除误识别角色</button></div>}</aside>
    </section>
    <section className="report-bar panel"><div><span className="step-dot" />审核报告 <small>{candidates.length ? "包含角色框、各维度结果、人工改判和问题库；导出为 JSON 文件" : "完成审核后自动汇总"}</small></div><div className="report-actions"><span>{counts.fail > 0 ? "存在不通过素材，建议退回修改" : counts.review > 0 ? "存在待确认素材，建议设计师复核" : candidates.length ? "本次素材可进入下一步" : ""}</span><button type="button" className="report-preview-button" onClick={() => setReportPreview(true)} disabled={!candidates.length}><FileText size={16} />预览报告</button><button type="button" className="export-button" onClick={exportReport} disabled={!candidates.length}><Download size={16} />导出 JSON</button></div></section>
    {reportPreview && <div className="report-modal-backdrop" role="presentation" onMouseDown={() => setReportPreview(false)}><section className="report-modal" role="dialog" aria-modal="true" aria-label="审核报告预览" onMouseDown={(event) => event.stopPropagation()}><header><div><p>审核报告预览</p><span>导出格式：JSON（.json）</span></div><button type="button" onClick={() => setReportPreview(false)} aria-label="关闭报告预览"><X size={18} /></button></header><div className="report-summary-grid"><div><span>审核图片</span><strong>{fileName}</strong></div><div><span>审核类型</span><strong>{makeReport().auditType}</strong></div><div><span>角色数量</span><strong>{candidates.length} 个</strong></div><div><span>问题库</span><strong>{issueLibrary.length} 条记录</strong></div></div><div className="report-preview-list">{candidates.map((candidate) => <article key={candidate.id}><div><strong>{candidate.name}</strong><span className={candidate.status}>{statusMeta[candidate.status].label}</span></div><p>{candidate.checks.filter((check) => check.state !== "pass" && check.state !== "na").map((check) => check.label).join("、") || "各维度符合当前规范"}</p>{candidate.manualNote && <small>人工记录：{candidate.manualNote}</small>}</article>)}</div><footer><span>文件包含：图片名称、角色位置、审核维度、人工改判记录、问题库及汇总结果。</span><button type="button" className="export-button" onClick={exportReport}><Download size={16} />导出 JSON</button></footer></section></div>}
  </main>;
}
