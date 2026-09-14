import assert from "node:assert/strict";
import test from "node:test";
import { calculateAuditScore } from "../src/audit-score.js";
import { calculateBoxEdit } from "../src/box-edit.js";
import { getFaceFeatureVerdict, hasSeparateEyebrowEvidence } from "../src/face-rules.js";
import { getBoxCoverage, isHeadOnlyFrame } from "../src/subject-coverage.js";
import { countActiveRuns, getVisibleLimbVerdict, hasUnoccludedLowerLimbFailure } from "../src/structural-rules.js";

const rect = { width: 200, height: 100 };

test("moving a role box keeps its size and records the new location", () => {
  const box = calculateBoxEdit(
    { mode: "move", startX: 20, startY: 20, box: { x: 10, y: 15, w: 30, h: 40 } },
    { clientX: 60, clientY: 40 },
    rect,
  );
  assert.deepEqual(box, { x: 30, y: 35, w: 30, h: 40 });
});

test("resizing from the north-west keeps the opposite corner fixed", () => {
  const box = calculateBoxEdit(
    { mode: "nw", startX: 100, startY: 50, box: { x: 20, y: 20, w: 30, h: 40 } },
    { clientX: 60, clientY: 30 },
    rect,
  );
  assert.deepEqual(box, { x: 0, y: 0, w: 50, h: 60 });
});

test("a head-only frame cannot claim to cover a full character", () => {
  const coverage = getBoxCoverage(
    { x: 20, y: 16, w: 60, h: 42 },
    { x: 20, y: 12, w: 60, h: 78 },
  );
  assert.equal(coverage, 42 / 78);
  assert.ok(coverage < 0.76);
  assert.equal(isHeadOnlyFrame(coverage, 0), true);
});

test("a complete small mascot is not downgraded merely because the full-image bounds are larger", () => {
  assert.equal(isHeadOnlyFrame(0.58, 2), false);
});

test("a single visible lower limb on a plain background is a hard failure", () => {
  assert.equal(countActiveRuns([false, true, true, true, false, false]), 1);
  assert.equal(hasUnoccludedLowerLimbFailure({ lowerLimbCount: 1, lightBackgroundRatio: 0.71 }), true);
  assert.equal(hasUnoccludedLowerLimbFailure({ lowerLimbCount: 1, lightBackgroundRatio: 0.12 }), false);
});

test("two visible lower limbs pass the structural check", () => {
  const verdict = getVisibleLimbVerdict({ lowerLimbCount: 2, subjectAspect: 0.95, lightBackgroundRatio: 0.72 });
  assert.equal(verdict.state, "pass");
  assert.equal(verdict.score, 92);
});

test("a narrow side view with one continuous lower limb passes", () => {
  const verdict = getVisibleLimbVerdict({ lowerLimbCount: 1, subjectAspect: 0.61, lightBackgroundRatio: 0.68 });
  assert.equal(verdict.state, "pass");
  assert.equal(verdict.score, 86);
});

test("a broad unoccluded figure missing a lower limb fails", () => {
  const verdict = getVisibleLimbVerdict({ lowerLimbCount: 1, subjectAspect: 0.94, lightBackgroundRatio: 0.68 });
  assert.equal(verdict.state, "fail");
  assert.equal(verdict.score, 20);
});

test("occluded limbs remain in review instead of being guessed", () => {
  const verdict = getVisibleLimbVerdict({ lowerLimbCount: 0, subjectAspect: 0.9, lightBackgroundRatio: 0.13 });
  assert.equal(verdict.state, "review");
  assert.equal(verdict.score, null);
});

test("visible limb results change the displayed audit score instead of being hidden by a source cap", () => {
  const score = calculateAuditScore([
    { id: "outline", score: 93, weight: 22 },
    { id: "color", score: 90, weight: 18 },
    { id: "glasses", score: 90, weight: 15 },
    { id: "limbs", score: 92, weight: 10 },
    { id: "material", score: null, weight: 15 },
  ], 78);
  assert.equal(score, 91);
});

test("front-facing mascot passes only when eyebrow, eye pair, and mouth are all visible", () => {
  const verdict = getFaceFeatureVerdict({
    pose: "正面",
    evidenceEnough: true,
    eyebrowPresent: true,
    eyePairPresent: true,
    mouthPresent: true,
  });
  assert.equal(verdict.state, "pass");
  assert.equal(verdict.score, 94);
});

test("a slanted eye cannot be reused as eyebrow evidence", () => {
  assert.equal(hasSeparateEyebrowEvidence({ browToppedEyeCount: 1 }), false);
  assert.equal(hasSeparateEyebrowEvidence({ browToppedEyeCount: 2 }), true);
  const verdict = getFaceFeatureVerdict({
    pose: "正面",
    evidenceEnough: true,
    eyebrowPresent: false,
    eyePairPresent: true,
    mouthPresent: true,
  });
  assert.equal(verdict.state, "fail");
  assert.match(verdict.note, /眉毛/);
});

test("a missing mouth fails the front-face standard instead of receiving a generic high score", () => {
  const verdict = getFaceFeatureVerdict({
    pose: "正面",
    evidenceEnough: true,
    eyebrowPresent: true,
    eyePairPresent: true,
    mouthPresent: false,
  });
  assert.equal(verdict.state, "fail");
  assert.match(verdict.note, /嘴巴/);
});

test("a small or obscured face remains review rather than being guessed as absent", () => {
  const verdict = getFaceFeatureVerdict({
    pose: "正面",
    evidenceEnough: false,
    eyebrowPresent: false,
    eyePairPresent: false,
    mouthPresent: false,
  });
  assert.equal(verdict.state, "review");
});

test("side and back views do not lose points against a front-face requirement", () => {
  for (const pose of ["侧面", "背面"]) {
    const verdict = getFaceFeatureVerdict({ pose, evidenceEnough: true });
    assert.equal(verdict.state, "na");
    assert.equal(verdict.score, null);
  }
});
