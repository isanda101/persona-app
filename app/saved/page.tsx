"use client";

import { useEffect, useState } from "react";

export default function SavedPage() {
  const [cards, setCards] = useState<any[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem("persona:saved");
    const saved = raw ? JSON.parse(raw) : [];
    setCards(saved);
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">

      <h1 className="text-2xl font-semibold mb-6">Saved</h1>

      <div className="grid grid-cols-2 gap-4">

        {cards.map((card, i) => (

          <div key={i} className="border rounded-lg overflow-hidden">

            <img src={card.image_url} className="w-full h-40 object-cover"/>

            <div className="p-3 text-sm">
              {card.caption_short}
            </div>

          </div>

        ))}

      </div>

      {cards.length === 0 && (
        <div className="text-gray-500">
          No saved cards yet
        </div>
      )}

    </div>
  );
}
