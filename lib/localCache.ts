const SIGNED_IN_STALE_KEYS = [
  "persona:uploads",
  "persona:feed_cache",
  "persona:saved",
  "persona:likes",
];

export function clearSignedInPersonaCache() {
  if (typeof window === "undefined") return;
  for (const key of SIGNED_IN_STALE_KEYS) {
    localStorage.removeItem(key);
  }
}

export function clearAllPersonaCache() {
  if (typeof window === "undefined") return;
  localStorage.clear();
}
