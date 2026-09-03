import assert from "node:assert/strict";
import test from "node:test";
import { calculateBoxEdit } from "../src/box-edit.js";
import { getBoxCoverage } from "../src/subject-coverage.js";
import { countActiveRuns, hasUnoccludedLowerLimbFailure } from "../src/structural-rules.js";

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
});

test("a single visible lower limb on a plain background is a hard failure", () => {
  assert.equal(countActiveRuns([false, true, true, true, false, false]), 1);
  assert.equal(hasUnoccludedLowerLimbFailure({ lowerLimbCount: 1, lightBackgroundRatio: 0.71 }), true);
  assert.equal(hasUnoccludedLowerLimbFailure({ lowerLimbCount: 1, lightBackgroundRatio: 0.12 }), false);
});
