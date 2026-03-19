import { supabase } from "@/lib/supabase";

export type NotificationType = "like" | "comment" | "collection";

type CreateNotificationInput = {
  userId: string;
  actorId: string;
  actorHandle: string;
  actorAvatar?: string;
  type: NotificationType;
  postId?: string;
  message: string;
};

export async function createNotification(input: CreateNotificationInput) {
  const userId = String(input.userId || "").trim();
  const actorId = String(input.actorId || "").trim();
  const actorHandle = String(input.actorHandle || "").trim();

  if (!userId || !actorId || !actorHandle) return;
  if (userId === actorId) return;

  const { error } = await supabase
    .from("notifications")
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      actor_id: actorId,
      actor_handle: actorHandle,
      actor_avatar: String(input.actorAvatar || "").trim(),
      type: input.type,
      post_id: String(input.postId || "").trim() || null,
      message: input.message,
      is_read: false,
    });

  if (error) {
    console.error("Could not create notification", error);
  }
}
