import test from "node:test";
import assert from "node:assert/strict";
import {
  createUnsubscribeToken,
  getMissingCheckinSections,
  isValidUnsubscribeToken,
} from "../utils/reminders.js";

test("getMissingCheckinSections returns all incomplete sections", () => {
  assert.deepEqual(
    getMissingCheckinSections({
      has_general: 0,
      has_mental: false,
      has_physical: null,
    }),
    ["general", "mental", "physical"]
  );
});

test("getMissingCheckinSections returns only sections that are still missing", () => {
  assert.deepEqual(
    getMissingCheckinSections({
      has_general: 1,
      has_mental: 0,
      has_physical: true,
    }),
    ["mental"]
  );
});

test("unsubscribe tokens validate only for the matching user", () => {
  const token = createUnsubscribeToken(42);

  assert.equal(isValidUnsubscribeToken(42, token), true);
  assert.equal(isValidUnsubscribeToken(99, token), false);
  assert.equal(isValidUnsubscribeToken(42, "not-a-real-token"), false);
});
