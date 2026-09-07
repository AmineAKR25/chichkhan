import type { Item } from "@/lib/menu";
import { footnotes } from "@/lib/site";

/** Légende des marqueurs — n'affiche que ceux réellement employés. */
export function Footnotes({ items }: { items: Item[] }) {
  const used = [
    items.some((i) => i.maison) ? footnotes.maison : null,
    items.some((i) => i.nuts) ? footnotes.nuts : null,
  ].filter((m) => m !== null);

  if (used.length === 0) return null;

  return (
    <p
      className="note mt-6 flex flex-wrap gap-x-5 gap-y-1"
      style={{ color: "color-mix(in oklab, var(--color-sable) 72%, transparent)" }}
    >
      {used.map((mark) => (
        <span key={mark.mark}>
          <span style={{ color: "var(--accent)" }}>{mark.mark}</span>{" "}
          {mark.label}
        </span>
      ))}
    </p>
  );
}
