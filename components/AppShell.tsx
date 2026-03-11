"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import BottomNav from "@/components/BottomNav";
import { isValidUsername, normalizeUsername, readProfile, writeProfile } from "@/lib/profile";

type AppShellProps = {
  children: React.ReactNode;
};

function shouldShowBottomNav(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/search") return true;
  if (pathname === "/upload") return true;
  if (pathname === "/collection" || pathname === "/saved") return true;
  if (pathname.startsWith("/post/")) return true;
  if (pathname.startsWith("/u/")) return true;
  return false;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const showBottomNav = shouldShowBottomNav(pathname);
  const showHomeHeader = pathname === "/";
  const [usernameInput, setUsernameInput] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [profileError, setProfileError] = useState("");
  const profile = isSignedIn ? readProfile() : null;
  const fallbackName = String(user?.fullName || user?.firstName || user?.username || "").trim();

  const isAuthRoute = pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");

  function submitProfile() {
    const username = normalizeUsername(usernameInput);
    if (!isValidUsername(username)) {
      setProfileError("Username must be 3–20 chars, letters/numbers/underscore only.");
      return;
    }
    const displayName = String(displayNameInput || "").trim() || fallbackName || username;
    const nextProfile = { username, display_name: displayName };
    writeProfile(nextProfile);
    setProfileError("");
  }

  if (isSignedIn && !profile && !isAuthRoute) {
    return (
      <main className="min-h-screen bg-white text-black px-5 py-8">
        <div className="max-w-md mx-auto">
          <div className="h-12 flex items-center">
            <span className="px-3 py-1 rounded-full bg-black text-white text-sm font-medium">
              Persona
            </span>
          </div>
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
            <div className="text-lg font-semibold">Create your public handle</div>
            <div className="text-sm text-gray-600 mt-2">
              Pick a public username for Persona. This appears as your @handle.
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500">Username</label>
                <div className="mt-1 flex items-center rounded-lg border border-gray-300 px-3 py-2">
                  <span className="text-sm text-gray-500 mr-1">@</span>
                  <input
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(normalizeUsername(e.target.value))}
                    placeholder="username"
                    className="w-full text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Display name</label>
                <input
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  placeholder={fallbackName || "Your name"}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
                />
              </div>
              {profileError ? <div className="text-xs text-red-600">{profileError}</div> : null}
              <button
                type="button"
                onClick={submitProfile}
                className="w-full px-4 py-2 rounded-lg bg-black text-white text-sm"
              >
                Save profile
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      {showHomeHeader ? (
        <header className="sticky top-0 z-40 h-12 bg-white border-b border-gray-200">
          <div className="h-full flex items-center px-4">
            <Link href="/" className="px-3 py-1 rounded-full bg-black text-white text-sm font-medium">
              Persona
            </Link>
          </div>
        </header>
      ) : null}
      <main
        className={
          showBottomNav
            ? "pb-24"
            : ""
        }
      >
        {children}
      </main>
      {showBottomNav ? <BottomNav /> : null}
    </>
  );
}
