export function countActiveRuns(values, minimumLength = 2) {
  let count = 0;
  let length = 0;
  for (const active of [...values, false]) {
    if (active) {
      length += 1;
    } else {
      if (length >= minimumLength) count += 1;
      length = 0;
    }
  }
  return count;
}

export function hasUnoccludedLowerLimbFailure({ lowerLimbCount, lightBackgroundRatio }) {
  return lowerLimbCount < 2 && lightBackgroundRatio >= 0.35;
}

export function getVisibleLimbVerdict({ lowerLimbCount, subjectAspect, lightBackgroundRatio }) {
  if (lowerLimbCount >= 2) {
    return {
      state: "pass",
      score: 92,
      note: "当前框内检测到两条独立下肢支撑区域，且与身体连续，可见肢体结构通过",
    };
  }

  // Side views can legitimately expose only one leg. A narrow purple subject is the reliable
  // signal available to this local detector; a frontal or back-facing figure is normally wider.
  if (lowerLimbCount === 1 && subjectAspect !== null && subjectAspect <= 0.78) {
    return {
      state: "pass",
      score: 86,
      note: "当前框呈窄侧向轮廓，检测到一条连续下肢；按侧面可见结构通过",
    };
  }

  if (lowerLimbCount <= 1 && subjectAspect !== null && subjectAspect > 0.78 && lightBackgroundRatio >= 0.35) {
    return {
      state: "fail",
      score: 20,
      note: "无遮挡画面中未检测到前后视应有的两条下肢，属于角色结构硬错误",
    };
  }

  return {
    state: "review",
    score: null,
    note: "下肢被云、道具、画面边缘遮挡，或当前轮廓无法确认视角，需人工复核",
  };
}
