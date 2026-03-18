import { auth, clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getSupabaseAdmin() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin credentials are not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function DELETE() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: userPosts, error: userPostsError } = await supabaseAdmin
      .from("posts")
      .select("id")
      .eq("creator_id", userId);

    if (userPostsError) {
      throw userPostsError;
    }

    const postIds = Array.isArray(userPosts)
      ? userPosts.map((post) => String((post as { id?: string }).id || "").trim()).filter(Boolean)
      : [];

    if (postIds.length) {
      const [
        likesOnPostsResult,
        collectionsOnPostsResult,
        commentsOnPostsResult,
      ] = await Promise.all([
        supabaseAdmin.from("likes").delete().in("post_id", postIds),
        supabaseAdmin.from("collections").delete().in("post_id", postIds),
        supabaseAdmin.from("comments").delete().in("post_id", postIds),
      ]);

      if (likesOnPostsResult.error) throw likesOnPostsResult.error;
      if (collectionsOnPostsResult.error) throw collectionsOnPostsResult.error;
      if (commentsOnPostsResult.error) throw commentsOnPostsResult.error;
    }

    const [
      likesResult,
      collectionsResult,
      commentsResult,
      followedTagsResult,
      postsResult,
    ] = await Promise.all([
      supabaseAdmin.from("likes").delete().eq("user_id", userId),
      supabaseAdmin.from("collections").delete().eq("user_id", userId),
      supabaseAdmin.from("comments").delete().eq("author_id", userId),
      supabaseAdmin.from("followed_tags").delete().eq("user_id", userId),
      supabaseAdmin.from("posts").delete().eq("creator_id", userId),
    ]);

    if (likesResult.error) throw likesResult.error;
    if (collectionsResult.error) throw collectionsResult.error;
    if (commentsResult.error) throw commentsResult.error;
    if (followedTagsResult.error) throw followedTagsResult.error;
    if (postsResult.error) throw postsResult.error;

    const client = await clerkClient();
    await client.users.deleteUser(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account deletion failed", error);
    return NextResponse.json(
      { error: "Could not delete account." },
      { status: 500 },
    );
  }
}
