export function getBoxCoverage(box, subject) {
  const left = Math.max(box.x, subject.x);
  const top = Math.max(box.y, subject.y);
  const right = Math.min(box.x + box.w, subject.x + subject.w);
  const bottom = Math.min(box.y + box.h, subject.y + subject.h);
  const overlapWidth = Math.max(0, right - left);
  const overlapHeight = Math.max(0, bottom - top);
  const subjectArea = subject.w * subject.h;
  return subjectArea ? (overlapWidth * overlapHeight) / subjectArea : 0;
}

export function isHeadOnlyFrame(coverage, visibleLowerLimbCount) {
  // A small but complete mascot can occupy only part of a source image. Treat a box as partial
  // only when its own crop has no visible lower body, not merely because the full-image bounds are larger.
  return coverage < 0.76 && visibleLowerLimbCount === 0;
}
