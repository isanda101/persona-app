"use client";

import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";

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
  const showBottomNav = shouldShowBottomNav(pathname);

  return (
    <>
      <div className={showBottomNav ? "pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)]" : ""}>
        {children}
      </div>
      {showBottomNav ? <BottomNav /> : null}
    </>
  );
}
