"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";

export default function NotificationsBell() {
  const { isSignedIn, user } = useUser();
  const userId = String(user?.id || "").trim();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadUnreadCount() {
      if (!isSignedIn || !userId) {
        setUnreadCount(0);
        return;
      }

      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (cancelled) return;

      if (error) {
        console.error("Could not load unread notifications", error);
        setUnreadCount(0);
        return;
      }

      setUnreadCount(count ?? 0);
    }

    loadUnreadCount().catch((error) => {
      if (cancelled) return;
      console.error("Could not load unread notifications", error);
      setUnreadCount(0);
    });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId]);

  if (!isSignedIn) return null;

  return (
    <Link
      href="/notifications"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-gray-700 hover:text-black"
      aria-label="Notifications"
    >
      <Bell size={16} strokeWidth={2} />
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-black px-1.5 py-0.5 text-[10px] font-medium text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
