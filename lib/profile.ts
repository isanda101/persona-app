export type PersonaProfile = {
  username: string;
  display_name: string;
};

const PROFILE_KEY = "persona:profile";
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(normalizeUsername(value));
}

export function readProfile(): PersonaProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersonaProfile>;
    const username = normalizeUsername(String(parsed?.username || ""));
    const display_name = String(parsed?.display_name || "").trim();
    if (!isValidUsername(username)) return null;
    return {
      username,
      display_name: display_name || username,
    };
  } catch {
    return null;
  }
}

export function writeProfile(profile: PersonaProfile) {
  if (typeof window === "undefined") return;
  const username = normalizeUsername(profile.username);
  const display_name = String(profile.display_name || "").trim() || username;
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({
      username,
      display_name,
    }),
  );
}
