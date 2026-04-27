import crypto from "crypto";

const DEFAULT_UNSUBSCRIBE_SECRET = "dev-unsubscribe-secret";

function getUnsubscribeSecret() {
  return (
    process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    DEFAULT_UNSUBSCRIBE_SECRET
  );
}

export function getMissingCheckinSections(sectionFlags = {}) {
  const sectionLabels = {
    has_general: "general",
    has_mental: "mental",
    has_physical: "physical",
  };

  return Object.entries(sectionLabels)
    .filter(([key]) => !sectionFlags[key])
    .map(([, label]) => label);
}

export function createUnsubscribeToken(userId) {
  const normalizedUserId = String(userId);

  return crypto
    .createHmac("sha256", getUnsubscribeSecret())
    .update(normalizedUserId)
    .digest("hex");
}

export function isValidUnsubscribeToken(userId, token) {
  if (!userId || typeof token !== "string" || !token.trim()) {
    return false;
  }

  const expected = createUnsubscribeToken(userId);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(token, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}
