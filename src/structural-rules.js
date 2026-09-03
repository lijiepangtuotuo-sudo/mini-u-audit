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
