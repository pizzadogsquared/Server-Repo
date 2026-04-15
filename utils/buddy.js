export const DEFAULT_BUDDY_NAME = "Buddy";
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
  if (!value) return ["dog"];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const cleaned = parsed.filter((type) => BUDDY_OPTIONS[type]);
      if (cleaned.includes("dog")) {
        return cleaned;
      }
      return ["dog", ...cleaned];
    }
  } catch (err) {
    console.warn("Could not parse owned buddy types:", err.message);
  }

  return ["dog"];
}

export function normalizeBuddyProfile(userRow = {}) {
  const ownedBuddyTypes = parseOwnedBuddyTypes(userRow.owned_buddy_types);
  let buddyType = "dog";
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
