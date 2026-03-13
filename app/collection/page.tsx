import { redirect } from "next/navigation";

export default function CollectionPage() {
  redirect("/u/you?tab=collected");
}
