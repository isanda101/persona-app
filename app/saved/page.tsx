"use client";

import { useEffect, useState } from "react";

type SavedCard = {
  id?: string;
  image_url?: string;
  caption_short?: string;
};

export default function SavedPage() {
  const [cards, setCards] = useState<SavedCard[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem("persona:saved");
    const saved = raw ? JSON.parse(raw) : [];
    setCards(saved);
  }, []);

  const removeItem = (index: number) => {
    setCards((prev) => {
      const next = prev.filter((_, i) => i !== index);
      localStorage.setItem("persona:saved", JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">

      <h1 className="text-2xl font-semibold mb-6">Collection</h1>

      <div className="grid grid-cols-2 gap-4">

        {cards.map((card, i) => (

          <div key={i} className="border rounded-lg overflow-hidden">

            <img src={card.image_url} className="w-full h-40 object-cover" alt="" />

            <div className="p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>{card.caption_short}</div>
                <button
                  onClick={() => removeItem(i)}
                  className="text-gray-500 hover:text-black text-sm leading-none"
                  aria-label="Remove from collection"
                >
                  ✕
                </button>
              </div>
            </div>

          </div>

        ))}

      </div>

      {cards.length === 0 && (
        <div className="text-gray-500">
          <div>No items in your Collection yet.</div>
          <a href="/" className="underline mt-2 inline-block">
            Back to feed
          </a>
        </div>
      )}

    </div>
  );
}
