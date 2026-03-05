"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PersonaFeed from "../components/PersonaFeed";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const raw = localStorage.getItem("persona:taste");
    if (!raw) router.push("/taste");
  }, [router]);

  return <PersonaFeed />;
}
