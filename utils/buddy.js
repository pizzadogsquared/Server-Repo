export const DEFAULT_BUDDY_NAME = "Buddy";
export const DEFAULT_BUDDY_TYPE = "penguin";
export const BUDDY_COSTS = {
  pet: 30,
  collar: 20,
  rename: 10,
};
export const BUDDY_OPTIONS = {
  dog: { label: "Dog" },
  cat: { label: "Cat" },
  penguin: { label: "Penguin" },
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

  return {
    buddyType,
    buddyName,
    buddyHasCollar: Boolean(userRow.buddy_has_collar),
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
