"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type PersonaHeaderProps = {
  showBack?: boolean;
  className?: string;
};

export default function PersonaHeader({
  showBack = false,
  className = "",
}: PersonaHeaderProps) {
  const router = useRouter();
  const alignmentClass = showBack ? "justify-start" : "justify-center";

  return (
    <div className={`flex items-center ${alignmentClass} ${className}`.trim()}>
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
        <Link href="/" className="bg-black text-white px-2.5 py-0.5 rounded-full text-xs sm:px-3 sm:py-1 sm:text-sm">
          Persona
        </Link>
      </div>
    </div>
  );
}
