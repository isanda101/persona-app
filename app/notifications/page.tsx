"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInButton, useUser } from "@clerk/nextjs";
import EmptyState from "@/components/EmptyState";
import PersonaHeader from "@/components/PersonaHeader";
import { supabase } from "@/lib/supabase";

type NotificationItem = {
  id: string;
  actor_handle?: string;
  actor_avatar?: string;
  message: string;
  post_id?: string;
  is_read: boolean;
  created_at?: string;
};

function fallbackLetter(handle?: string) {
  const source = String(handle || "").trim().replace(/^@+/, "");
  return source ? source.charAt(0).toUpperCase() : "U";
}

function formatTimestamp(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const { isSignedIn, user } = useUser();
  const userId = String(user?.id || "").trim();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      if (!isSignedIn || !userId) {
        setNotifications([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("Could not load notifications", error);
        setNotifications([]);
        setIsLoading(false);
        return;
      }

      const nextNotifications = Array.isArray(data)
        ? data.map((item) => ({
          id: String((item as { id?: string }).id || "").trim(),
          actor_handle: String((item as { actor_handle?: string }).actor_handle || "").trim() || undefined,
          actor_avatar: String((item as { actor_avatar?: string }).actor_avatar || "").trim() || undefined,
          message: String((item as { message?: string }).message || "").trim(),
          post_id: String((item as { post_id?: string }).post_id || "").trim() || undefined,
          is_read: Boolean((item as { is_read?: boolean }).is_read),
          created_at: String((item as { created_at?: string }).created_at || "").trim() || undefined,
        })).filter((item) => item.id && item.message)
        : [];

      setNotifications(nextNotifications);
      setIsLoading(false);

      const unreadIds = nextNotifications
        .filter((item) => !item.is_read)
        .map((item) => item.id);

      if (!unreadIds.length) return;

      const { error: updateError } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", unreadIds);

      if (cancelled || updateError) {
        if (updateError) {
          console.error("Could not mark notifications as read", updateError);
        }
        return;
      }

      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    }

    loadNotifications().catch((error) => {
      if (cancelled) return;
      console.error("Could not load notifications", error);
      setNotifications([]);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId]);

  return (
    <div className="min-h-screen bg-white text-black px-5 py-8">
      <div className="mx-auto max-w-2xl">
        <PersonaHeader showBack />
        <h1 className="mt-2 text-2xl font-semibold">Notifications</h1>

        {!isSignedIn ? (
          <div className="mt-6 rounded-2xl border border-gray-200 p-5">
            <div className="text-base font-medium">Sign in to view notifications</div>
            <div className="mt-2 text-sm text-gray-600">
              See likes, comments, and collections on your posts.
            </div>
            <div className="mt-4">
              <SignInButton mode="redirect" forceRedirectUrl="/notifications">
                <button type="button" className="rounded-full bg-black px-4 py-2 text-sm text-white">
                  Sign in
                </button>
              </SignInButton>
            </div>
          </div>
        ) : isLoading ? (
          <div className="mt-6 text-sm text-gray-500">Loading notifications...</div>
        ) : notifications.length ? (
          <div className="mt-6 space-y-3">
            {notifications.map((notification) => {
              const href = notification.post_id
                ? `/post/${encodeURIComponent(notification.post_id)}`
                : "/notifications";

              return (
                <Link
                  key={notification.id}
                  href={href}
                  className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-4"
                >
                  {notification.actor_avatar ? (
                    <img
                      src={notification.actor_avatar}
                      alt={notification.actor_handle || "Actor avatar"}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-700">
                      {fallbackLetter(notification.actor_handle)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-black">{notification.message}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {formatTimestamp(notification.created_at)}
                        </div>
                      </div>
                      {!notification.is_read ? (
                        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-black shrink-0" />
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              title="No notifications yet."
              body="Likes, comments, and collections on your posts will appear here."
            />
          </div>
        )}
      </div>
    </div>
  );
}
