"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { useAuth, useUser } from "@clerk/nextjs";
import PersonaHeader from "@/components/PersonaHeader";
import { prependCardToStorage } from "@/lib/feedCache";
import { supabase } from "@/lib/supabase";
import { buildIdentityFirstTags, sanitizeContentTags } from "@/lib/tags";

const OPTIONS = [
  { group: "Luxury", items: ["Gucci", "Louis Vuitton", "Prada", "Tommy Hilfiger", "Ralph Lauren"] },
  { group: "Streetwear", items: ["Supreme", "BAPE", "Stüssy", "Off-White", "Nike"] },
  { group: "Art", items: ["Basquiat", "KAWS", "Murakami"] },
  { group: "Watches", items: ["Rolex", "Omega", "Cartier"] },
  { group: "Cars", items: ["Porsche", "Ferrari", "BMW", "Mercedes", "American Muscle"] },
  {
    group: "Furniture & Interiors",
    items: [
      "Eames Chairs",
      "IKEA",
      "Japanese Interiors",
      "Industrial Design",
      "Ligne Roset Togo",
      "Mid-Century Modern",
    ],
  },
  { group: "Aesthetics", items: ["Vintage", "Quiet Luxury", "Japanese Denim", "American Heritage"] },
] as const;

export default function UploadPage() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [note, setNote] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>(
    Array.from(new Set(OPTIONS.flatMap((section) => section.items)))
  );
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [detectedObjectType, setDetectedObjectType] = useState("");
  const [detectedBrand, setDetectedBrand] = useState("");
  const [detectedModel, setDetectedModel] = useState("");
  const [detectedStyle, setDetectedStyle] = useState("");
  const [detectedEra, setDetectedEra] = useState("");
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isModeratingImage, setIsModeratingImage] = useState(false);
  const [moderationBlocked, setModerationBlocked] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [aiTaggingError, setAiTaggingError] = useState("");
  const [hasVisionResult, setHasVisionResult] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editorialText, setEditorialText] = useState("");
  const [isGeneratingEditorial, setIsGeneratingEditorial] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(OPTIONS.map((section) => [section.group, false])) as Record<string, boolean>
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const username = String(user?.username || "").trim().replace(/^@+/, "");

  const hasTagCandidate = selectedTags.length > 0 || suggestedTags.length > 0;
  const hasReadyForm =
    Boolean(uploadedImageUrl) &&
    hasTagCandidate &&
    !isSubmitting &&
    !isUploadingImage &&
    !isModeratingImage &&
    !moderationBlocked;

  const allTags = useMemo(
    () => Array.from(new Set(availableTags)),
    [availableTags]
  );

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const normalizeForMatch = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const mergeCaseInsensitive = (base: string[], incoming: string[]) => {
    const out: string[] = [...base];
    const seen = new Set(base.map((item) => normalizeForMatch(item)));
    for (const raw of incoming) {
      const item = String(raw || "").trim();
      if (!item) continue;
      const norm = normalizeForMatch(item);
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push(item);
    }
    return out;
  };

  const toTitleWords = (value: string) =>
    String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

  const buildTitleFromVision = ({
    brand,
    model,
    objectType,
    tags,
  }: {
    brand: string;
    model: string;
    objectType: string;
    tags: string[];
  }) => {
    const safeBrand = String(brand || "").trim();
    const safeModel = String(model || "").trim();
    const safeObjectType = String(objectType || "").trim();
    const safeTags = Array.isArray(tags)
      ? tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [];

    if (safeBrand && safeModel) return `${toTitleWords(safeBrand)} ${toTitleWords(safeModel)}`.trim();
    if (safeBrand && safeObjectType) return `${toTitleWords(safeBrand)} ${toTitleWords(safeObjectType)}`.trim();
    if (safeTags.length >= 2) return `${toTitleWords(safeTags[0])} ${toTitleWords(safeTags[1])}`.trim();
    if (safeTags.length === 1) return toTitleWords(safeTags[0]);
    return "Community Post";
  };

  const analyzeImageTags = async (imageUrl: string): Promise<string[]> => {
    setIsAnalyzingImage(true);
    setAiTaggingError("");
    try {
      const visionRes = await fetch("/api/vision-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      const visionData = await visionRes.json();
      console.log("visionData", visionData);
      setHasVisionResult(true);

      if (!visionRes.ok) {
        setAiTaggingError("AI tagging failed");
        return [];
      }

      const visionTags = Array.isArray(visionData?.tags)
        ? visionData.tags.map((tag: unknown) => String(tag || "").trim()).filter(Boolean)
        : [];

      setSuggestedTags(visionTags);
      setDetectedObjectType(String(visionData?.object_type || ""));
      setDetectedBrand(String(visionData?.brand || ""));
      setDetectedModel(String(visionData?.model || ""));
      setDetectedStyle(String(visionData?.style || ""));
      setDetectedEra(String(visionData?.era || ""));

      setSelectedTags((prev) => mergeCaseInsensitive(prev, visionTags));
      setAvailableTags((prev) => mergeCaseInsensitive(prev, visionTags));
      return visionTags;
    } catch {
      setAiTaggingError("AI tagging failed");
      setHasVisionResult(true);
      return [];
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const onImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);

    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setUploadedImageUrl("");
    setModerationBlocked(false);
    setAiTaggingError("");
    setHasVisionResult(false);
    setSuggestedTags([]);
    setDetectedObjectType("");
    setDetectedBrand("");
    setDetectedModel("");
    setDetectedStyle("");
    setDetectedEra("");
    setError("");

    try {
      setIsUploadingImage(true);
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload-image",
      });
      const blobUrl = blob?.url || "";
      if (!blobUrl) {
        throw new Error("No image URL returned from upload");
      }
      setUploadedImageUrl(blobUrl);
      setIsModeratingImage(true);
      const moderationRes = await fetch("/api/moderate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: blobUrl }),
      });
      const moderationData = await moderationRes.json().catch(() => ({}));
      const blocked = Boolean(moderationData?.flagged) || moderationData?.ok === false || !moderationRes.ok;
      if (blocked) {
        setModerationBlocked(true);
        setError(String(moderationData?.reason || "This image can't be posted on Persona."));
        setAiTaggingError("");
        setHasVisionResult(false);
        setSuggestedTags([]);
        setDetectedObjectType("");
        setDetectedBrand("");
        setDetectedModel("");
        setDetectedStyle("");
        setDetectedEra("");
        return;
      }
      await analyzeImageTags(blobUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Image upload failed";
      setError(message);
    } finally {
      setIsModeratingImage(false);
      setIsUploadingImage(false);
    }
  };

  const generateWithAI = async () => {
    if (moderationBlocked) {
      setError("This image can't be posted on Persona.");
      return;
    }
    if (!uploadedImageUrl) {
      setError("Please wait for image upload to finish.");
      return;
    }

    setIsGeneratingEditorial(true);
    setError("");
    try {
      let tagsForEditorial = selectedTags;
      if (!hasVisionResult) {
        const visionTags = await analyzeImageTags(uploadedImageUrl);
        tagsForEditorial = mergeCaseInsensitive(selectedTags, visionTags);
      } else if (!tagsForEditorial.length && suggestedTags.length) {
        tagsForEditorial = mergeCaseInsensitive(tagsForEditorial, suggestedTags);
      }
      const normalizedEditorialTags = buildIdentityFirstTags({
        brand: detectedBrand,
        model: detectedModel,
        objectType: detectedObjectType,
        style: detectedStyle,
        tags: sanitizeContentTags(tagsForEditorial, 24),
        max: 6,
      });

      const res = await fetch("/api/generate-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload: {
            note,
            tags: normalizedEditorialTags,
            image_url: uploadedImageUrl,
            brand: detectedBrand,
            model: detectedModel,
            object_type: detectedObjectType,
            style: detectedStyle,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Editorial generation failed");
      }

      const data = await res.json();
      const nextEditorial = String(data?.cards?.[0]?.caption_long || "").trim();
      if (nextEditorial) {
        setEditorialText(nextEditorial);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate editorial text.");
    } finally {
      setIsGeneratingEditorial(false);
    }
  };

  const normalizedQueryRaw = tagQuery.trim();
  const normalizedQuery = normalizeForMatch(normalizedQueryRaw);
  const selectedSet = new Set(selectedTags.map((item) => normalizeForMatch(item)));
  const availableSet = new Set(allTags.map((item) => normalizeForMatch(item)));
  const hasDetectedMetadata = Boolean(
    detectedBrand || detectedObjectType || detectedModel || detectedStyle || detectedEra
  );
  const showAiSuggestedSection = isAnalyzingImage || Boolean(aiTaggingError) || hasDetectedMetadata || suggestedTags.length > 0;
  const showAddCustom =
    normalizedQueryRaw.length >= 2 &&
    !selectedSet.has(normalizedQuery) &&
    !availableSet.has(normalizedQuery);

  const addCustomTag = () => {
    if (!showAddCustom) return;
    const customTag = normalizedQueryRaw;
    setAvailableTags((prev) =>
      prev.some((item) => normalizeForMatch(item) === normalizeForMatch(customTag))
        ? prev
        : [customTag, ...prev]
    );
    setSelectedTags((prev) =>
      prev.some((item) => normalizeForMatch(item) === normalizeForMatch(customTag))
        ? prev
        : [...prev, customTag]
    );
    setTagQuery("");
  };

  const toggleGroup = (group: string) => {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (moderationBlocked) {
      setError("This image can't be posted on Persona.");
      return;
    }
    if (!imageFile) {
      setError("Please choose an image first.");
      return;
    }
    if (!uploadedImageUrl) {
      setError("Please wait for image upload to finish.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const creatorName = String(
        user?.firstName ||
        user?.username ||
        "Persona User"
      ).trim();
      const creatorHandle = `@${username}`;
      const creatorAvatar = String(user?.imageUrl || "").trim();
      const creatorId = String(user?.id || "").trim();

      if (!username) {
        throw new Error("Create your Persona handle before posting.");
      }

      const finalTagsRaw = selectedTags.length
        ? selectedTags
        : suggestedTags.length
          ? suggestedTags
          : [];
      const finalTags = buildIdentityFirstTags({
        brand: detectedBrand,
        model: detectedModel,
        objectType: detectedObjectType,
        style: detectedStyle,
        tags: sanitizeContentTags(finalTagsRaw, 24),
        max: 6,
      });

      if (!finalTags.length) {
        throw new Error("Add at least one tag to post on Persona.");
      }

      const finalTitle = note.trim() || buildTitleFromVision({
        brand: detectedBrand,
        model: detectedModel,
        objectType: detectedObjectType,
        tags: finalTags,
      });
      const finalEditorial = editorialText.trim();

      const cardRes = await fetch("/api/generate-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload: {
            note: finalTitle,
            tags: finalTags,
            image_url: uploadedImageUrl,
            editorial: finalEditorial,
            brand: detectedBrand,
            model: detectedModel,
            object_type: detectedObjectType,
            style: detectedStyle,
            creator_name: creatorName,
            creator_handle: creatorHandle,
            creator_avatar: creatorAvatar,
            creator_id: creatorId,
          },
        }),
      });

      if (!cardRes.ok) {
        const errText = await cardRes.text();
        throw new Error(errText || "Card generation failed");
      }

      const cardData = await cardRes.json();

      if (!cardData.cards || !Array.isArray(cardData.cards) || cardData.cards.length === 0) {
        throw new Error("No card returned from API");
      }

      const newCard = {
        ...cardData.cards[0],
        creator_name: String(cardData.cards[0]?.creator_name || creatorName),
        creator_handle: String(cardData.cards[0]?.creator_handle || creatorHandle),
        creator_avatar: String(cardData.cards[0]?.creator_avatar || creatorAvatar || ""),
        creator_id: String(cardData.cards[0]?.creator_id || creatorId || ""),
      };
      const blobUrl = uploadedImageUrl;
      const noteToUse = finalTitle;
      const mergedTags = finalTags;
      const newPost = {
        id: crypto.randomUUID(),
        creator_id: user?.id || "",
        creator_handle: user?.username || user?.primaryEmailAddress?.emailAddress || "user",
        creator_name: user?.fullName || "",
        creator_avatar: user?.imageUrl || "",
        image_url: blobUrl,
        caption_short: noteToUse || "Untitled",
        caption_long: noteToUse || "",
        tags: mergedTags,
        source: "community" as const,
      };

      const { error } = await supabase
        .from("posts")
        .insert(newPost);

      if (error) {
        console.error("Supabase insert error:", error);
      }

      prependCardToStorage("persona:uploads", newCard);
      prependCardToStorage("persona:feed_cache", newCard);

      setError("");

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create editorial card. Try again.");
      setIsSubmitting(false);
    }
  };

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-white text-black px-5 py-8">
        <div className="max-w-md mx-auto">
          <PersonaHeader showBack />
          <h1 className="text-2xl font-semibold mt-2">Create Editorial Card</h1>
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
            <div className="text-base font-medium">Sign in to post on Persona.</div>
            <div className="text-sm text-gray-600 mt-2">
              You can browse the feed as a guest. Sign in to upload and publish posts.
            </div>
            <div className="mt-4 flex gap-2">
              <Link
                href="/sign-in"
                className="px-4 py-2 rounded-lg bg-black text-white text-sm"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!username) {
    return (
      <div className="min-h-screen bg-white text-black px-5 py-8">
        <div className="max-w-md mx-auto">
          <PersonaHeader showBack />
          <h1 className="text-2xl font-semibold mt-2">Create Editorial Card</h1>
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
            <div className="text-base font-medium">Create your Persona handle before posting.</div>
            <div className="text-sm text-gray-600 mt-2">
              Set your public @username in Profile, then come back to post.
            </div>
            <div className="mt-4">
              <Link
                href="/u/you"
                className="inline-flex px-4 py-2 rounded-lg bg-black text-white text-sm"
              >
                Go to Profile
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black px-5 py-8">
      <div className="max-w-md mx-auto">
        <PersonaHeader showBack />
        <h1 className="text-2xl font-semibold mt-2">Create Editorial Card</h1>
        <p className="text-gray-600 mt-2">Create an editorial card from an image and your selected taste tags.</p>
        {error ? <p className="text-sm text-red-600 mt-3">{error}</p> : null}

        <form onSubmit={submit} className="mt-6 space-y-6">
          {/* A. Image upload / preview */}
          <div>
            <label htmlFor="upload-image" className="text-sm font-medium text-gray-500 block mb-2">
              Image
            </label>
            <input
              id="upload-image"
              type="file"
              accept="image/*"
              onChange={onImageChange}
              className="w-full text-sm file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border file:border-gray-300 file:bg-white file:text-black"
            />
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 mt-3">
              {imagePreviewUrl ? (
                <img
                  src={imagePreviewUrl}
                  alt="Selected upload preview"
                  className="w-full h-64 object-cover rounded-xl"
                />
              ) : (
                <div className="w-full h-64 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-sm text-gray-400 bg-white">
                  Image preview
                </div>
              )}
            </div>
            {isModeratingImage ? (
              <div className="text-xs text-gray-500 mt-2">Checking image safety...</div>
            ) : null}
            {moderationBlocked ? (
              <div className="text-xs text-red-600 mt-2">This image can&apos;t be posted on Persona.</div>
            ) : null}
            {isUploadingImage ? <div className="text-xs text-gray-500 mt-2">Uploading image...</div> : null}
          </div>

          {/* B. Title */}
          <div>
            <label htmlFor="upload-note" className="text-sm font-medium text-gray-500 block mb-2">
              Title
            </label>
            <textarea
              id="upload-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a title (optional)"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              rows={3}
            />
          </div>

          {/* C. Editorial */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="upload-editorial" className="text-sm font-medium text-gray-500">
                Editorial
              </label>
              <button
                type="button"
                onClick={generateWithAI}
                disabled={isGeneratingEditorial || !uploadedImageUrl || isModeratingImage || moderationBlocked}
                className={`text-sm px-3 py-1.5 rounded-lg border ${
                  !isGeneratingEditorial && uploadedImageUrl && !isModeratingImage && !moderationBlocked
                    ? "bg-gray-100 text-gray-700 border-gray-300"
                    : "bg-gray-100 text-gray-400 border-gray-200"
                }`}
              >
                {isGeneratingEditorial ? "Generating..." : "Generate with AI"}
              </button>
            </div>
            <textarea
              id="upload-editorial"
              value={editorialText}
              onChange={(e) => setEditorialText(e.target.value)}
              placeholder="Write an editorial... (optional)"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              rows={6}
            />
            <div className="text-xs text-gray-500 mt-2">
              Use AI to generate an editorial description from the image and tags.
            </div>
          </div>

          {/* E. AI Suggested Tags */}
          {showAiSuggestedSection ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-3">
              <div className="text-sm font-medium text-gray-500 mb-2">AI Suggested Tags</div>
              {isAnalyzingImage ? <div className="text-xs text-gray-500 mb-2">Analyzing image...</div> : null}
              {aiTaggingError ? <div className="text-xs text-red-600 mb-2">AI tagging failed</div> : null}

              {hasDetectedMetadata ? (
                <div className="space-y-1">
                  {detectedBrand ? <div className="text-xs text-gray-500">Brand: {detectedBrand}</div> : null}
                  {detectedObjectType ? <div className="text-xs text-gray-500">Object Type: {detectedObjectType}</div> : null}
                  {detectedModel ? <div className="text-xs text-gray-500">Model: {detectedModel}</div> : null}
                  {detectedStyle ? <div className="text-xs text-gray-500">Style: {detectedStyle}</div> : null}
                  {detectedEra ? <div className="text-xs text-gray-500">Era: {detectedEra}</div> : null}
                </div>
              ) : null}

              {suggestedTags.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {suggestedTags.map((tag) => {
                      const on = selectedTags.includes(tag);
                      return (
                        <button
                          key={`ai-${tag}`}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`px-3 py-1.5 rounded-full text-sm border ${
                            on
                              ? "bg-black text-white border-black"
                              : "bg-white text-black border-gray-300"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {/* F. Tags */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-500">Tags</div>
              <div className="text-xs text-gray-400">{selectedTags.length} selected</div>
            </div>

            <input
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder="Search tags, brands, styles..."
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
            />
            {showAddCustom ? (
              <button
                type="button"
                onClick={addCustomTag}
                className="mt-2 px-3 py-2 rounded-full text-sm border bg-white text-black border-gray-300"
              >
                + Add &quot;{normalizedQueryRaw}&quot;
              </button>
            ) : null}

            {selectedTags.length ? (
              <div className="mt-4">
                <div className="text-sm text-gray-500 mb-2">Selected Tags</div>
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className="px-3 py-1 rounded-full bg-black text-white text-sm"
                    >
                      {tag} ✕
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-3 mt-4">
              {OPTIONS.map((section) => {
                const sectionItems = section.items.filter((tag) =>
                  allTags.some((item) => normalizeForMatch(item) === normalizeForMatch(tag)),
                );
                const filteredItems = normalizedQuery
                  ? sectionItems.filter((tag) => normalizeForMatch(tag).includes(normalizedQuery))
                  : sectionItems;

                if (!filteredItems.length) return null;

                const isOpen = Boolean(openGroups[section.group]);

                return (
                  <div key={section.group} className="border border-gray-200 rounded-xl bg-white">
                    <button
                      type="button"
                      onClick={() => toggleGroup(section.group)}
                      className="w-full px-3 py-2 flex items-center justify-between text-sm text-gray-700"
                    >
                      <span className="font-medium">{section.group}</span>
                      <span className="text-xs text-gray-500">{isOpen ? "▲" : "▼"}</span>
                    </button>
                    {isOpen ? (
                      <div className="px-3 pb-3 flex flex-wrap gap-2">
                        {filteredItems.map((tag) => {
                          const on = selectedTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(tag)}
                              className={`px-3 py-2 rounded-full text-sm border ${
                                on
                                  ? "bg-black text-white border-black"
                                  : "bg-white text-black border-gray-300"
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {(() => {
                const baseItems = OPTIONS.flatMap((section) => [...section.items]);
                const baseSet: Set<string> = new Set(baseItems);
                const customItems = allTags.filter((tag) => !baseSet.has(tag));
                const filteredCustom = normalizedQuery
                  ? customItems.filter((tag) => normalizeForMatch(tag).includes(normalizedQuery))
                  : customItems;
                if (!filteredCustom.length) return null;
                return (
                  <div className="border border-gray-200 rounded-xl bg-white p-3">
                    <div className="text-sm font-medium text-gray-500 mb-2">Custom</div>
                    <div className="flex flex-wrap gap-2">
                      {filteredCustom.map((tag) => {
                        const on = selectedTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTag(tag)}
                            className={`px-3 py-2 rounded-full text-sm border ${
                              on
                                ? "bg-black text-white border-black"
                                : "bg-white text-black border-gray-300"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {allTags.length === 0 ? <div className="text-sm text-gray-400">No tags available.</div> : null}
            </div>
          </div>

          {/* G. Post */}
          <button
            type="submit"
            disabled={!hasReadyForm}
            className={`w-full py-3 rounded-xl text-sm font-medium ${
              hasReadyForm ? "bg-black text-white" : "bg-gray-200 text-gray-500"
            }`}
          >
            {isSubmitting ? "Posting..." : "Post"}
          </button>
        </form>
      </div>
    </div>
  );
}
