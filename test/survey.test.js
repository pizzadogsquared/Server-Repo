import test from "node:test";
import assert from "node:assert/strict";
import { getLowestScoringQuestion } from "../utils/survey.js";

test("getLowestScoringQuestion marks a standout low score", () => {
  const lowest = getLowestScoringQuestion({
    q1: 8,
    q2: 9,
    q3: 3,
    q4: 8,
  });

  assert.deepEqual(lowest, {
    key: "q3",
    value: 3,
    reason: "standout",
  });
});

test("getLowestScoringQuestion falls back to the minimum score", () => {
  const lowest = getLowestScoringQuestion({
    q1: 6,
    q2: 5,
    q3: 7,
    q4: 6,
  });

  assert.deepEqual(lowest, {
    key: "q2",
    value: 5,
    reason: "low",
  });
});
