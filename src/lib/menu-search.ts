export type SearchItem = {
  slug: string;
  name: string;
  description?: string;
  category: string;
  price: number;
};

export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
}

/** Match every query word against names, ingredients and categories. */
export function searchMenu(items: SearchItem[], query: string) {
  const words = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return items.filter((item) => {
    const text = normalizeSearch(
      `${item.name} ${item.description ?? ""} ${item.category}`,
    );
    return words.every((word) => text.includes(word));
  });
}
