import type { Item } from "@/lib/menu";
import { footnotes } from "@/lib/site";

/** Appels de note « * » et « † », en exposant après le nom. */
export function Marks({ item }: { item: Item }) {
  const marks = [
    item.nuts ? footnotes.nuts : null,
    item.maison ? footnotes.maison : null,
  ].filter((m) => m !== null);

  if (marks.length === 0) return null;

  return (
    <>
      {marks.map((mark) => (
        <sup
          key={mark.mark}
          className="ml-1 text-[11px]"
          style={{ color: "var(--accent)" }}
          title={mark.label}
        >
          {mark.mark}
          <span className="sr-only"> {mark.label}</span>
        </sup>
      ))}
    </>
  );
}
