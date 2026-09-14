export function calculateAuditScore(checks, fallbackScore) {
  const scoredChecks = checks.filter((check) => Number.isFinite(check.score) && check.weight > 0);
  if (!scoredChecks.length) return fallbackScore;
  const totalWeight = scoredChecks.reduce((sum, check) => sum + check.weight, 0);
  const weightedScore = scoredChecks.reduce((sum, check) => sum + check.score * check.weight, 0);
  return Math.round(weightedScore / totalWeight);
}
