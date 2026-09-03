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
