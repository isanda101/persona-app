"use client";

import { UserProfile } from "@clerk/nextjs";

export default function UserProfilePage() {
  return (
    <div className="min-h-screen bg-white px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <UserProfile />
      </div>
    </div>
  );
}
