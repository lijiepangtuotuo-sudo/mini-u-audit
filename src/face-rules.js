const sideOrBackPoses = new Set(["侧面", "背面"]);

export function hasSeparateEyebrowEvidence({ browToppedEyeCount }) {
  // 小 U 的眉毛与瞳孔可连成 T 形笔画；正面与三分之四视角必须左右各有一处。
  return browToppedEyeCount >= 2;
}

export function getFaceFeatureVerdict({ pose = "正面", eyebrowPresent, eyePairPresent, mouthPresent, evidenceEnough }) {
  if (sideOrBackPoses.has(pose)) {
    return {
      state: "na",
      score: null,
      note: pose === "背面" ? "背面视图不检查眉毛、眼睛和嘴巴" : "侧面仅检查可见轮廓，不以正脸五官标准扣分",
      missing: [],
    };
  }

  if (!evidenceEnough) {
    return {
      state: "review",
      score: null,
      note: "角色面部区域过小、模糊或被遮挡，无法可靠确认眉毛、双眼和嘴巴",
      missing: [],
    };
  }

  const missing = [
    !eyebrowPresent && "眉毛",
    !eyePairPresent && "双眼",
    !mouthPresent && "嘴巴",
  ].filter(Boolean);

  if (!missing.length) {
    return {
      state: "pass",
      score: 94,
      note: "已检测到眉毛、双眼和嘴巴，符合小 U 正脸五官标准",
      missing,
    };
  }

  return {
    state: "fail",
    score: missing.length === 1 ? 42 : 18,
    note: `正脸五官缺少${missing.join("、")}，不符合“眉毛、双眼、嘴巴齐全”的标准`,
    missing,
  };
}
