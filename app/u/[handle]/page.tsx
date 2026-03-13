"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SignInButton, SignOutButton, SignUpButton, useUser } from "@clerk/nextjs";
import PersonaHeader from "@/components/PersonaHeader";

type CardItem = {
  id: string;
  image_url: string;
  caption_short?: string;
  topic?: string;
  creator_handle?: string;
};

function safeParseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeCard(value: unknown): CardItem | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const id = String(obj.id || "").trim();
  if (!id) return null;

  const imageUrl = String(obj.image_url || "").trim();
  if (!imageUrl) return null;

  return {
    id,
    image_url: imageUrl,
    caption_short: String(obj.caption_short || "").trim() || undefined,
    topic: String(obj.topic || "").trim() || undefined,
    creator_handle: String(obj.creator_handle || "").trim() || undefined,
  };
}

function readCardArray(key: string): CardItem[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParseJSON<unknown[]>(localStorage.getItem(key), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => normalizeCard(item))
    .filter((item): item is CardItem => Boolean(item));
}

export default function UserHandlePage() {
  const router = useRouter();
  const { isSignedIn, user } = useUser();
  const params = useParams<{ handle: string }>();
  const handle = String(params?.handle || "").trim().replace(/^@+/, "");
  const ownUsername = String(user?.username || "").trim().replace(/^@+/, "");
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
  const isOwnProfile =
    handle.toLowerCase() === "you" ||
    (isSignedIn && ownUsername && handle.toLowerCase() === ownUsername.toLowerCase());
  const resolvedHandle = isOwnProfile
    ? ownUsername || handle || "user"
    : handle || "user";
  const normalizedHandle = `@${resolvedHandle}`;
  const profileName = String(user?.firstName || user?.username || "Persona User").trim();
  const profileIdentity = ownUsername ? `@${ownUsername}` : normalizedHandle;

  async function saveUsername() {
    const next = String(usernameInput || "").trim().toLowerCase();
    if (!USERNAME_RE.test(next)) {
      setUsernameError("Username must be 3–20 chars, lowercase letters/numbers/underscore.");
      return;
    }
    if (!user) return;
    try {
      setIsSavingUsername(true);
      setUsernameError("");
      await user.update({ username: next });
      await user.reload();
      router.replace(`/u/${next}`);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save username.";
      setUsernameError(message);
    } finally {
      setIsSavingUsername(false);
    }
  }

  const posts = useMemo(() => {
    if (typeof window === "undefined") return [] as CardItem[];

    const uploads = readCardArray("persona:uploads");
    const feedCache = readCardArray("persona:feed_cache");
    const pool = [...uploads, ...feedCache];
    const seen = new Set<string>();
    const out: CardItem[] = [];

    for (const card of pool) {
      if (!card.id || seen.has(card.id)) continue;
      const cardHandle = String(card.creator_handle || "").trim().replace(/^@+/, "").toLowerCase();
      if (cardHandle !== resolvedHandle.toLowerCase()) continue;
      seen.add(card.id);
      out.push(card);
    }

    return out;
  }, [resolvedHandle]);

  return (
    <div className="min-h-screen bg-white text-black px-5 py-8">
      <div className="max-w-3xl mx-auto">
        <PersonaHeader showBack />

        {isOwnProfile && !isSignedIn ? (
          <div>
            <h1 className="text-2xl font-semibold mt-2">Profile</h1>
            <div className="mt-6 rounded-xl border border-gray-200 p-4">
              <div className="text-base font-medium">Sign in to Persona</div>
              <div className="mt-2 text-sm text-gray-600">
                Create a profile to:
              </div>
              <div className="mt-2 text-sm text-gray-700 leading-7">
                <div>• like posts</div>
                <div>• collect inspiration</div>
                <div>• post to the community</div>
                <div>• comment on posts</div>
              </div>
              <div className="mt-4 flex gap-2">
                <SignInButton mode="redirect" forceRedirectUrl="/u/you">
                  <button type="button" className="px-3 py-2 rounded-lg bg-black text-white text-sm">
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton mode="redirect" forceRedirectUrl="/u/you">
                  <button type="button" className="px-3 py-2 rounded-lg border border-gray-300 text-sm">
                    Create account
                  </button>
                </SignUpButton>
              </div>
            </div>
          </div>
        ) : isOwnProfile ? (
          <div>
            <h1 className="text-2xl font-semibold mt-2">Profile</h1>
            {ownUsername ? (
              <>
                <div className="mt-4 rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center gap-3">
                    {user?.imageUrl ? (
                      <img src={user.imageUrl} alt={profileName} className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-gray-200" />
                    )}
                    <div>
                      <div className="text-lg font-semibold">{profileIdentity}</div>
                      <div className="text-sm text-gray-600 mt-1">{profileName}</div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 border-t border-gray-200 pt-4">
                  <div className="text-sm font-medium text-gray-500 mb-2">Preferences</div>
                  <Link
                    href="/taste"
                    className="flex items-center justify-between px-3 py-3 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
                  >
                    <span>Refine tastes</span>
                    <span className="text-gray-400">→</span>
                  </Link>
                </div>
                <div className="mt-4 space-y-2">
                  <Link
                    href="/collection"
                    className="flex items-center justify-between px-3 py-3 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
                  >
                    <span>My collections</span>
                    <span className="text-gray-400">→</span>
                  </Link>
                  <Link
                    href={`/u/${encodeURIComponent(resolvedHandle)}`}
                    className="flex items-center justify-between px-3 py-3 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
                  >
                    <span>My posts</span>
                    <span className="text-gray-400">→</span>
                  </Link>
                </div>
                <div className="mt-6">
                  <SignOutButton redirectUrl="/">
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Log out
                    </button>
                  </SignOutButton>
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-xl border border-gray-200 p-4">
                <div className="text-base font-medium">Create your Persona handle</div>
                <div className="text-sm text-gray-600 mt-2">
                  Choose a public username. This will appear as your @handle.
                </div>
                <div className="mt-3">
                  <div className="flex items-center rounded-lg border border-gray-300 px-3 py-2">
                    <span className="text-sm text-gray-500 mr-1">@</span>
                    <input
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(String(e.target.value || "").toLowerCase())}
                      placeholder="username"
                      className="w-full text-sm outline-none"
                    />
                  </div>
                  {usernameError ? <div className="mt-2 text-xs text-red-600">{usernameError}</div> : null}
                </div>
                <button
                  type="button"
                  onClick={saveUsername}
                  disabled={isSavingUsername}
                  className={`mt-4 px-3 py-2 rounded-lg text-sm ${
                    isSavingUsername ? "bg-gray-200 text-gray-500" : "bg-black text-white"
                  }`}
                >
                  {isSavingUsername ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold mt-2">{normalizedHandle}</h1>
            <p className="text-sm text-gray-500 mt-1">{posts.length} posts</p>
          </>
        )}

        {posts.length ? (
          <div className="grid grid-cols-2 gap-3 mt-5">
            {posts.map((card) => (
              <Link
                key={card.id}
                href={`/post/${encodeURIComponent(card.id)}`}
                className="border border-gray-200 rounded-xl overflow-hidden bg-white"
              >
                <img
                  src={card.image_url}
                  alt={card.caption_short || card.topic || "Post"}
                  className="w-full aspect-[3/4] object-cover"
                />
                <div className="p-2 text-sm truncate">{card.caption_short || card.topic || "Untitled"}</div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500 mt-5">No posts yet.</div>
        )}
      </div>
    </div>
  );
}
