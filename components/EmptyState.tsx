"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type EmptyStateAction = {
  href?: string;
  label: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
};

type EmptyStateProps = {
  title: string;
  body: string;
  hint?: ReactNode;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
};

function ActionButton({ action }: { action: EmptyStateAction }) {
  const className = action.variant === "primary"
    ? "rounded-full bg-black px-4 py-2 text-sm text-white"
    : "rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700";

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
}

export default function EmptyState({
  title,
  body,
  hint,
  primaryAction,
  secondaryAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`rounded-3xl border border-gray-200 bg-white px-6 py-7 text-center ${className}`.trim()}>
      <div className="text-lg font-semibold text-black">{title}</div>
      <div className="mt-2 text-sm leading-6 text-gray-600">{body}</div>
      {hint ? <div className="mt-2 text-xs leading-5 text-gray-500">{hint}</div> : null}
      {primaryAction || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {secondaryAction ? <ActionButton action={secondaryAction} /> : null}
          {primaryAction ? <ActionButton action={primaryAction} /> : null}
        </div>
      ) : null}
    </div>
  );
}
