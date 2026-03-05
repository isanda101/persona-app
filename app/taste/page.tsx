"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const OPTIONS = [
  { group: "Luxury", items: ["Gucci", "Louis Vuitton", "Prada", "Tommy Hilfiger", "Ralph Lauren"] },
  { group: "Streetwear", items: ["Supreme", "BAPE", "Stüssy", "Off-White", "Nike"] },
  { group: "Art", items: ["Basquiat", "KAWS", "Murakami"] },
  { group: "Watches", items: ["Rolex", "Omega", "Cartier"] },
  { group: "Aesthetics", items: ["Vintage", "Quiet Luxury", "Japanese Denim", "American Heritage"] },
];
const INITIAL_TASTES = Array.from(new Set(OPTIONS.flatMap((section) => section.items)));

const SUGGESTIONS: Record<string, string[]> = {
  Rolex: ["Patek Philippe", "Audemars Piguet", "Omega", "Vintage Watches", "Quiet Luxury"],
  "Ralph Lauren": ["American Heritage", "Preppy", "Workwear", "Japanese Denim", "Vintage"],
  Nike: ["Sneakers", "Streetwear", "Techwear", "Aime Leon Dore", "Minimal"],
  Basquiat: ["Art & Culture", "KAWS", "Warhol", "Design Objects", "Photography"],
  "Quiet Luxury": ["The Row", "Loro Piana", "Brunello Cucinelli", "Minimal Tailoring", "Neutral Palette"],
  "Japanese Denim": ["Selvedge", "Americana", "Workwear", "Vintage Levi’s", "Indigo", "Archive Workwear"],
  "American Heritage": ["Ivy Style", "Varsity", "Workwear", "Rugged Classics", "Denim", "Vintage"],
  Vintage: [
    "Archive Fashion",
    "90s Minimal",
    "Heritage Brands",
    "Selvedge Denim",
    "Vintage Watches",
    "Workwear",
  ],
};

export default function TastePage() {
  const router = useRouter();
  const [tastes, setTastes] = useState<string[]>(INITIAL_TASTES);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("persona:taste");
    if (raw) setSelected(JSON.parse(raw));
  }, []);

  const toggle = (item: string) => {
    setSelected((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  const save = () => {
    localStorage.setItem("persona:taste", JSON.stringify(selected));
    router.push("/");
  };

  const suggestionCounts = selected.reduce((acc, item) => {
    const list = Array.isArray(SUGGESTIONS[item]) ? SUGGESTIONS[item] : [];
    list.forEach((suggestion) => {
      acc.set(suggestion, (acc.get(suggestion) ?? 0) + 1);
    });
    return acc;
  }, new Map<string, number>());

  const suggested = Array.from(suggestionCounts.entries())
    .filter(([item]) => !selected.includes(item))
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 12)
    .map(([item]) => item);

  const addSuggested = () => {
    if (!suggested.length) return;
    setSelected((prev) => Array.from(new Set([...prev, ...suggested])));
  };

  const normalizedQuery = query.trim().toLowerCase();
  const selectedSet = new Set(selected.map((item) => item.toLowerCase()));
  const tasteSet = new Set(tastes.map((item) => item.toLowerCase()));
  const showAddCustom =
    normalizedQuery.length >= 2 &&
    !selectedSet.has(normalizedQuery) &&
    !tasteSet.has(normalizedQuery);

  const addCustomTaste = () => {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    setTastes((prev) =>
      prev.some((item) => item.toLowerCase() === normalized.toLowerCase())
        ? prev
        : [normalized, ...prev]
    );
    setSelected((prev) =>
      prev.some((item) => item.toLowerCase() === normalized.toLowerCase())
        ? prev
        : [...prev, normalized]
    );
    setQuery("");
  };

  return (
    <div className="min-h-screen bg-white text-black px-5 py-8">
      <div className="max-w-md mx-auto">
        <div className="text-sm text-gray-500">Persona</div>
        <h1 className="text-2xl font-semibold mt-2">Pick your taste</h1>
        <p className="text-gray-600 mt-2">
          Choose a few brands/artists. Your feed will be curated around these.
        </p>

        <div className="sticky top-0 z-10 bg-white pt-4 pb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brands, aesthetics, categories…"
            className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
          />
          {showAddCustom ? (
            <button
              onClick={addCustomTaste}
              className="mt-2 px-3 py-2 rounded-full text-sm border bg-white text-black border-gray-300"
            >
              + Add &quot;{query.trim()}&quot;
            </button>
          ) : null}
        </div>

        <div className="mt-6 space-y-6">
          {OPTIONS.map((section) => {
            const filteredItems = normalizedQuery
              ? section.items
                  .filter((item) => tastes.includes(item))
                  .filter((item) => item.toLowerCase().includes(normalizedQuery))
              : section.items.filter((item) => tastes.includes(item));

            if (!filteredItems.length) return null;

            return (
              <div key={section.group}>
                <div className="text-sm font-medium text-gray-500 mb-3">
                  {section.group}
                </div>
                <div className="flex flex-wrap gap-2">
                  {filteredItems.map((item) => {
                    const on = selected.includes(item);
                    return (
                      <button
                        key={item}
                        onClick={() => toggle(item)}
                        className={`px-3 py-2 rounded-full text-sm border ${
                          on
                            ? "bg-black text-white border-black"
                            : "bg-white text-black border-gray-300"
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {(() => {
            const baseSet = new Set(OPTIONS.flatMap((section) => section.items));
            const customItems = tastes.filter((item) => !baseSet.has(item));
            const filteredCustom = normalizedQuery
              ? customItems.filter((item) => item.toLowerCase().includes(normalizedQuery))
              : customItems;

            if (!filteredCustom.length) return null;

            return (
              <div>
                <div className="text-sm font-medium text-gray-500 mb-3">Custom</div>
                <div className="flex flex-wrap gap-2">
                  {filteredCustom.map((item) => {
                    const on = selected.includes(item);
                    return (
                      <button
                        key={item}
                        onClick={() => toggle(item)}
                        className={`px-3 py-2 rounded-full text-sm border ${
                          on
                            ? "bg-black text-white border-black"
                            : "bg-white text-black border-gray-300"
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-gray-500">Suggested for you</div>
            <button
              onClick={addSuggested}
              disabled={!suggested.length}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                suggested.length
                  ? "bg-black text-white border-black"
                  : "bg-gray-100 text-gray-400 border-gray-200"
              }`}
            >
              Add suggested
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggested.length ? (
              suggested.map((item) => (
                <button
                  key={item}
                  onClick={() => toggle(item)}
                  className="px-3 py-2 rounded-full text-sm border bg-white text-black border-gray-300"
                >
                  {item}
                </button>
              ))
            ) : (
              <div className="text-sm text-gray-400">
                Pick a few tastes above and we&apos;ll suggest adjacent styles.
              </div>
            )}
          </div>
        </div>

        <button
          onClick={save}
          disabled={selected.length < 3}
          className={`mt-8 w-full py-3 rounded-xl text-sm font-medium ${
            selected.length < 3
              ? "bg-gray-200 text-gray-500"
              : "bg-black text-white"
          }`}
        >
          Continue ({selected.length}/3+)
        </button>
      </div>
    </div>
  );
}
