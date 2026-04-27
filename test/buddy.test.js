import test from "node:test";
import assert from "node:assert/strict";
import {
  BUDDY_ACCESSORY_OPTIONS,
  DEFAULT_BUDDY_NAME,
  buildBuddyStatusRedirect,
  normalizeBuddyProfile,
  parseOwnedBuddyTypes,
} from "../utils/buddy.js";

test("parseOwnedBuddyTypes falls back to the default buddy when value is missing", () => {
  assert.deepEqual(parseOwnedBuddyTypes(null), ["penguin"]);
});

test("parseOwnedBuddyTypes filters unknown pets and preserves default ownership", () => {
  const owned = parseOwnedBuddyTypes(JSON.stringify(["cat", "dragon"]));
  assert.deepEqual(owned, ["penguin", "cat"]);
});

test("normalizeBuddyProfile returns safe defaults", () => {
  const profile = normalizeBuddyProfile({});

  assert.equal(profile.buddyType, "penguin");
  assert.equal(profile.buddyName, DEFAULT_BUDDY_NAME);
  assert.equal(profile.buddyHasCollar, false);
  assert.deepEqual(profile.ownedBuddyTypes, ["penguin"]);
  assert.deepEqual(profile.buddyAccessories, {
    collar: { owned: false, equipped: false },
    sunglasses: { owned: false, equipped: false },
    propellerCap: { owned: false, equipped: false },
  });
});

test("normalizeBuddyProfile keeps valid pet data and trims the name", () => {
  const profile = normalizeBuddyProfile({
    buddy_type: "penguin",
    buddy_name: "  Robbie  ",
    buddy_has_collar: 1,
    buddy_collar_equipped: 1,
    buddy_has_sunglasses: 1,
    buddy_sunglasses_equipped: 0,
    owned_buddy_types: JSON.stringify(["cat", "penguin"]),
  });

  assert.equal(profile.buddyType, "penguin");
  assert.equal(profile.buddyName, "Robbie");
  assert.equal(profile.buddyHasCollar, true);
  assert.deepEqual(profile.ownedBuddyTypes, ["cat", "penguin"]);
  assert.deepEqual(profile.buddyAccessories, {
    collar: { owned: true, equipped: true },
    sunglasses: { owned: true, equipped: false },
    propellerCap: { owned: false, equipped: false },
  });
});

test("buildBuddyStatusRedirect encodes status text and optional modal flag", () => {
  const redirect = buildBuddyStatusRedirect("Collar purchased for Buddy.", "success", true);

  assert.equal(
    redirect,
    "/home?buddyStatus=Collar+purchased+for+Buddy.&buddyStatusType=success&openBuddyModal=1"
  );
});

test("accessory options stay aligned with cost configuration", () => {
  assert.equal(BUDDY_ACCESSORY_OPTIONS.collar.cost, 20);
  assert.equal(BUDDY_ACCESSORY_OPTIONS.sunglasses.cost, 15);
  assert.equal(BUDDY_ACCESSORY_OPTIONS.propellerCap.cost, 18);
});
