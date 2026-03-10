"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type PersonaHeaderProps = {
  showBack?: boolean;
  showSearch?: boolean;
  className?: string;
};

export default function PersonaHeader({
  showBack = false,
  showSearch = false,
  className = "",
}: PersonaHeaderProps) {
  const router = useRouter();

  return (
    <div className={`flex items-center justify-between ${className}`.trim()}>
      <div className="flex items-center gap-3">
        {showBack ? (
          <button
            type="button"
            onClick={() => router.back()}
            className="h-8 w-8 rounded-full border border-gray-300 text-sm text-gray-700 hover:text-black"
            aria-label="Go back"
          >
            ←
          </button>
        ) : null}
        <Link href="/" className="bg-black text-white px-3 py-1 rounded-full text-sm">
          Persona
        </Link>
      </div>
      {showSearch ? (
        <Link href="/search" className="text-sm text-gray-700 underline">
          Search
        </Link>
      ) : null}
    </div>
  );
}
