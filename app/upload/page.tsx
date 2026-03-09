"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [note, setNote] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const hasReadyForm = Boolean(imageFile) && selectedTags.length > 0 && !isSubmitting;

  const allTags = useMemo(
    () => Array.from(new Set(OPTIONS.flatMap((section) => section.items))),
    []
  );

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const onImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);

    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedTags.length === 0 || isSubmitting) return;
    if (!imageFile) {
      setError("Please choose an image first.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const blob = await upload(imageFile.name, imageFile, {
        access: "public",
        handleUploadUrl: "/api/upload-image",
      });
      const blobUrl = blob?.url || "";
      if (!blobUrl) {
        throw new Error("No image URL returned from upload");
      }

      const cardRes = await fetch("/api/generate-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload: {
            note,
            tags: selectedTags,
            image_url: blobUrl,
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

      const newCard = cardData.cards[0];
      const existingRaw = localStorage.getItem("persona:uploads") || "[]";
      const parsedExisting = JSON.parse(existingRaw);
      const existing = Array.isArray(parsedExisting) ? parsedExisting : [];
      localStorage.setItem("persona:uploads", JSON.stringify([newCard, ...existing]));

      setError("");

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create editorial card. Try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black px-5 py-8">
      <div className="max-w-md mx-auto">
        <div className="text-sm text-gray-500">Persona</div>
        <h1 className="text-2xl font-semibold mt-2">Upload</h1>
        <p className="text-gray-600 mt-2">Create an editorial card from an image and your selected taste tags.</p>
        {error ? <p className="text-sm text-red-600 mt-3">{error}</p> : null}

        <form onSubmit={submit} className="mt-6 space-y-6">
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
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
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

          <div>
            <label htmlFor="upload-note" className="text-sm font-medium text-gray-500 block mb-2">
              Title / Note (optional)
            </label>
            <textarea
              id="upload-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a short title or note"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              rows={3}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-500">Tags</div>
              <div className="text-xs text-gray-400">{selectedTags.length} selected</div>
            </div>

            <div className="space-y-5">
              {OPTIONS.map((section) => (
                <div key={section.group}>
                  <div className="text-sm font-medium text-gray-500 mb-3">{section.group}</div>
                  <div className="flex flex-wrap gap-2">
                    {section.items.map((tag) => {
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
              ))}

              {allTags.length === 0 ? <div className="text-sm text-gray-400">No tags available.</div> : null}
            </div>
          </div>

          <button
            type="submit"
            disabled={!hasReadyForm}
            className={`w-full py-3 rounded-xl text-sm font-medium ${
              hasReadyForm ? "bg-black text-white" : "bg-gray-200 text-gray-500"
            }`}
          >
            {isSubmitting ? "Creating..." : "Create editorial card"}
          </button>
        </form>
      </div>
    </div>
  );
}
