export const DEFAULT_BUDDY_NAME = "Buddy";
export const DEFAULT_BUDDY_TYPE = "penguin";
export const BUDDY_COSTS = {
  pet: 30,
  collar: 20,
  sunglasses: 15,
  propellerCap: 18,
  rename: 10,
};
export const BUDDY_OPTIONS = {
  dog: { label: "Dog" },
  cat: { label: "Cat" },
  penguin: { label: "Penguin" },
};
export const BUDDY_ACCESSORY_OPTIONS = {
  collar: {
    label: "Collar",
    cost: BUDDY_COSTS.collar,
    ownedKey: "buddy_has_collar",
    equippedKey: "buddy_collar_equipped",
  },
  sunglasses: {
    label: "Sunglasses",
    cost: BUDDY_COSTS.sunglasses,
    ownedKey: "buddy_has_sunglasses",
    equippedKey: "buddy_sunglasses_equipped",
  },
  propellerCap: {
    label: "Propeller Cap",
    cost: BUDDY_COSTS.propellerCap,
    ownedKey: "buddy_has_propeller_cap",
    equippedKey: "buddy_propeller_cap_equipped",
  },
};

export function parseOwnedBuddyTypes(value) {
  if (!value) return [DEFAULT_BUDDY_TYPE];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const cleaned = parsed.filter((type) => BUDDY_OPTIONS[type]);
      if (cleaned.includes(DEFAULT_BUDDY_TYPE)) {
        return cleaned;
      }
      return [DEFAULT_BUDDY_TYPE, ...cleaned];
    }
  } catch (err) {
    console.warn("Could not parse owned buddy types:", err.message);
  }

  return [DEFAULT_BUDDY_TYPE];
}

export function normalizeBuddyProfile(userRow = {}) {
  const ownedBuddyTypes = parseOwnedBuddyTypes(userRow.owned_buddy_types);
  let buddyType = DEFAULT_BUDDY_TYPE;
  if (BUDDY_OPTIONS[userRow.buddy_type]) {
    buddyType = userRow.buddy_type;
  }

  if (!ownedBuddyTypes.includes(buddyType)) {
    ownedBuddyTypes.push(buddyType);
  }

  let buddyName = DEFAULT_BUDDY_NAME;
  if (userRow.buddy_name && userRow.buddy_name.trim()) {
    buddyName = userRow.buddy_name.trim();
  }

  const accessories = Object.fromEntries(
    Object.entries(BUDDY_ACCESSORY_OPTIONS).map(([key, option]) => {
      const owned = Boolean(userRow[option.ownedKey]);
      const equipped = owned && Boolean(userRow[option.equippedKey]);

      return [key, { owned, equipped }];
    })
  );

  return {
    buddyType,
    buddyName,
    buddyHasCollar: accessories.collar.owned,
    buddyAccessories: accessories,
    ownedBuddyTypes,
  };
}

export function buildBuddyStatusRedirect(message, status = "success", openModal = false) {
  const params = new URLSearchParams({
    buddyStatus: message,
    buddyStatusType: status,
  });

  if (openModal) {
    params.set("openBuddyModal", "1");
  }

  return `/home?${params.toString()}`;
}
