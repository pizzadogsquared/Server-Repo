import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BUDDY_NAME,
  buildBuddyStatusRedirect,
  normalizeBuddyProfile,
  parseOwnedBuddyTypes,
} from "../utils/buddy.js";

test("parseOwnedBuddyTypes falls back to dog when value is missing", () => {
  assert.deepEqual(parseOwnedBuddyTypes(null), ["dog"]);
});

test("parseOwnedBuddyTypes filters unknown pets and preserves dog ownership", () => {
  const owned = parseOwnedBuddyTypes(JSON.stringify(["cat", "dragon"]));
  assert.deepEqual(owned, ["dog", "cat"]);
});

test("normalizeBuddyProfile returns safe defaults", () => {
  const profile = normalizeBuddyProfile({});

  assert.equal(profile.buddyType, "dog");
  assert.equal(profile.buddyName, DEFAULT_BUDDY_NAME);
  assert.equal(profile.buddyHasCollar, false);
  assert.deepEqual(profile.ownedBuddyTypes, ["dog"]);
});

test("normalizeBuddyProfile keeps valid pet data and trims the name", () => {
  const profile = normalizeBuddyProfile({
    buddy_type: "penguin",
    buddy_name: "  Robbie  ",
    buddy_has_collar: 1,
    owned_buddy_types: JSON.stringify(["dog", "penguin"]),
  });

  assert.equal(profile.buddyType, "penguin");
  assert.equal(profile.buddyName, "Robbie");
  assert.equal(profile.buddyHasCollar, true);
  assert.deepEqual(profile.ownedBuddyTypes, ["dog", "penguin"]);
});

test("buildBuddyStatusRedirect encodes status text and optional modal flag", () => {
  const redirect = buildBuddyStatusRedirect("Collar purchased for Buddy.", "success", true);

  assert.equal(
    redirect,
    "/home?buddyStatus=Collar+purchased+for+Buddy.&buddyStatusType=success&openBuddyModal=1"
  );
});
