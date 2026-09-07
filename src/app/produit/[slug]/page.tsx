import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { allItems, composition, findItem, formatPrice } from "@/lib/menu";
import { footnotes } from "@/lib/site";
import { accentStyle } from "@/components/accents";
import { TopBar } from "@/components/TopBar";

export function generateStaticParams() {
  return allItems.map(({ item }) => ({ slug: item.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/produit/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const found = findItem(slug);
  if (!found) return {};
  return {
    title: found.item.name,
    description: found.item.detail ?? found.item.description,
  };
}

/** Découpe le nom sur deux lignes : « Coupe » / « Havana ». */
function splitName(name: string): [string, string?] {
  const parts = name.split(" ");
  if (parts.length === 1) return [name];
  return [parts[0], parts.slice(1).join(" ")];
}

/** Écran 09 — la fiche produit. */
export default async function FicheProduit({
  params,
}: PageProps<"/produit/[slug]">) {
  const { slug } = await params;
  const found = findItem(slug);
  if (!found) notFound();

  const { item, category } = found;
  const [first, rest] = splitName(item.name);
  const parts = composition(item);

  const mentions = [
    item.serving,
    item.maison ? footnotes.maison.label : null,
    item.nuts ? footnotes.nuts.label : null,
  ].filter((m) => m !== null);

  return (
    <main
      className="screen flex min-h-dvh flex-col pb-32"
      style={accentStyle(category.accent)}
    >
      <TopBar href={`/carte/${category.slug}`} label={category.name} />

      <div className="px-6 pt-10">
        <p className="eyebrow-wide" style={{ color: "var(--accent)" }}>
          {item.signature ?? category.chapter}
        </p>

        <h1 className="display mt-4 text-[44px]">
          {first}
          {rest && (
            <>
              <br />
              {rest}
            </>
          )}
        </h1>

        <p
          className="mt-5"
          style={{
            font: "500 20px/1 var(--font-ui)",
            letterSpacing: ".06em",
            color: "var(--accent)",
          }}
        >
          {formatPrice(item.price)}
        </p>

        {item.detail && <p className="lede mt-6">{item.detail}</p>}

        {parts.length > 0 && (
          <section className="mt-10">
            <h2 className="eyebrow" style={{ color: "var(--color-or)" }}>
              Composition
            </h2>
            <ul className="mt-4">
              {parts.map((part) => (
                <li
                  key={part}
                  className="rule-top flex items-baseline gap-3 py-2.5"
                >
                  <span aria-hidden style={{ color: "var(--accent)" }}>
                    —
                  </span>
                  <span
                    style={{
                      font: "400 15px/1.4 var(--font-ui)",
                      color: "var(--color-sable)",
                    }}
                  >
                    {part}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {mentions.length > 0 && (
          <p className="note mt-6">{mentions.join(" · ")}</p>
        )}
      </div>

      <Link
        href="/carte"
        className="mx-6 mt-auto flex items-baseline justify-between pt-12"
      >
        <span className="eyebrow" style={{ color: "var(--color-or)" }}>
          Parcourir la carte
        </span>
        <span
          aria-hidden
          style={{ font: "400 22px/1 var(--font-display)", color: "var(--color-or)" }}
        >
          ↑
        </span>
      </Link>
    </main>
  );
}
