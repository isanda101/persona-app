"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import PersonaFeed from "../components/PersonaFeed";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const [isCheckingTaste, setIsCheckingTaste] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;

    let cancelled = false;

    async function checkTaste() {
      const localTaste = JSON.parse(localStorage.getItem("persona:taste") || "[]") as unknown;
      const localTags = Array.isArray(localTaste)
        ? localTaste.map((item) => String(item || "").trim()).filter(Boolean)
        : [];

      if (!isSignedIn || !user?.id) {
        if (!localTags.length) {
          router.push("/taste");
          return;
        }
        if (!cancelled) setIsCheckingTaste(false);
        return;
      }

      const { data, error } = await supabase
        .from("followed_tags")
        .select("*")
        .eq("user_id", user.id);

      if (cancelled) return;

      const followedTags = error || !Array.isArray(data)
        ? []
        : data.map((item) => String((item as { tag?: string }).tag || "").trim()).filter(Boolean);

      if (!localTags.length && !followedTags.length) {
        router.push("/taste");
        return;
      }

      setIsCheckingTaste(false);
    }

    checkTaste().catch(() => {
      if (cancelled) return;
      router.push("/taste");
    });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, router, user?.id]);

  if (isCheckingTaste) {
    return (
      <div className="min-h-screen bg-white px-4 py-8">
        <div className="mx-auto max-w-md text-sm text-gray-500">Loading Persona…</div>
      </div>
    );
  }

  return <PersonaFeed />;
}
