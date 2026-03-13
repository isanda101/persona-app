"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Home, PlusSquare, Search, User } from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  Icon: typeof Home;
  isActive: (pathname: string) => boolean;
};

const ITEMS: NavItem[] = [
  {
    label: "Home",
    href: "/",
    Icon: Home,
    isActive: (pathname) => pathname === "/",
  },
  {
    label: "Search",
    href: "/search",
    Icon: Search,
    isActive: (pathname) => pathname === "/search",
  },
  {
    label: "Post",
    href: "/upload",
    Icon: PlusSquare,
    isActive: (pathname) => pathname === "/upload",
  },
  {
    label: "Profile",
    href: "/u/you",
    Icon: User,
    isActive: (pathname) => pathname.startsWith("/u/"),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const username = String(user?.username || "").trim().replace(/^@+/, "");
  const items = ITEMS.map((item) =>
    item.label === "Profile"
      ? { ...item, href: username ? `/u/${username}` : "/u/you" }
      : item,
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around px-2">
        {items.map(({ label, href, Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={label}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 px-2 ${
                active ? "text-black" : "text-gray-500"
              }`}
              aria-label={label}
            >
              <Icon size={21} strokeWidth={2} />
              <span className="text-xs">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
