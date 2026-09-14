import assert from "node:assert/strict";
import test from "node:test";
import { getSupportedImageFile, isOutsideStage } from "../src/image-transfer.js";

test("accepts a supported image from a dropped file list", () => {
  const file = getSupportedImageFile([{ name: "draft.txt", type: "text/plain" }, { name: "mini-u.webp", type: "image/webp" }]);
  assert.equal(file?.name, "mini-u.webp");
});

test("does not accept unsupported dropped files", () => {
  assert.equal(getSupportedImageFile([{ name: "brief.pdf", type: "application/pdf" }]), null);
});

test("clears only when the source image finishes outside the stage", () => {
  const rect = { left: 100, top: 80, right: 500, bottom: 480 };
  assert.equal(isOutsideStage({ clientX: 200, clientY: 300 }, rect), false);
  assert.equal(isOutsideStage({ clientX: 520, clientY: 300 }, rect), true);
  assert.equal(isOutsideStage({ clientX: undefined, clientY: undefined }, rect), false);
});
