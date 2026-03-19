"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/nextjs";
import BottomNav from "@/components/BottomNav";
import NotificationsBell from "@/components/NotificationsBell";

type AppShellProps = {
  children: React.ReactNode;
};

function shouldShowBottomNav(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/search") return true;
  if (pathname === "/upload") return true;
  if (pathname === "/collection" || pathname === "/saved") return true;
  if (pathname.startsWith("/post/")) return true;
  if (pathname.startsWith("/t/")) return true;
  if (pathname.startsWith("/u/")) return true;
  return false;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const showBottomNav = shouldShowBottomNav(pathname);
  const showTopHeader =
    pathname === "/" ||
    pathname === "/search" ||
    pathname === "/collection" ||
    pathname === "/saved";
  const showAuthPill = showTopHeader && !isSignedIn;

  return (
    <>
      {showTopHeader ? (
        <header className="sticky top-0 z-40 h-12 bg-white border-b border-gray-200">
          <div className="h-full flex items-center justify-between px-4">
            <Link href="/" className="px-3 py-1 rounded-full bg-black text-white text-sm font-medium">
              Persona
            </Link>
            <div className="flex items-center gap-2">
              {isSignedIn ? <NotificationsBell /> : null}
              {showAuthPill ? (
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="px-3 py-1 rounded-full bg-black text-white text-sm font-medium"
                  >
                    Sign in
                  </button>
                </SignInButton>
              ) : null}
            </div>
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
