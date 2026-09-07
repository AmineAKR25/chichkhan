import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { categories, getCategory } from "@/lib/menu";
import { accentStyle } from "@/components/accents";
import { TopBar } from "@/components/TopBar";
import { PhotoSlot } from "@/components/PhotoSlot";
import { MenuRow } from "@/components/MenuRow";
import { Footnotes } from "@/components/Footnotes";

export function generateStaticParams() {
  return categories.map((category) => ({ categorie: category.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/carte/[categorie]">): Promise<Metadata> {
  const { categorie } = await params;
  const category = getCategory(categorie);
  if (!category) return {};
  return { title: category.name, description: category.intro };
}

/** Écrans 03 – 08 — un chapitre. Le fond ne bouge pas, l'accent si. */
export default async function Chapitre({
  params,
}: PageProps<"/carte/[categorie]">) {
  const { categorie } = await params;
  const category = getCategory(categorie);
  if (!category) notFound();

  const next = categories[category.index % categories.length];

  return (
    <main className="screen pb-32" style={accentStyle(category.accent)}>
      <TopBar
        href="/carte"
        label="La carte"
        counter={`${String(category.index).padStart(2, "0")} / 06`}
      />

      <div className="relative px-6 pb-6 pt-8">
        <PhotoSlot id={category.slug} caption={category.slotCaption} />
        <div className="absolute left-6 top-[60px] w-[200px]">
          <p className="eyebrow-wide" style={{ color: "var(--accent)" }}>
            {category.chapter}
          </p>
          <h1 className="display mt-3 text-[42px]">
            {category.display[0]}
            <br />
            {category.display[1]}
          </h1>
        </div>
      </div>

      <div className="px-6 pb-8">
        <p className="lede mb-5">{category.intro}</p>

        {category.items.map((item) => (
          <MenuRow key={item.slug} item={item} />
        ))}

        {category.footnote && (
          <p className="note mt-6" style={{ color: "var(--accent)" }}>
            {category.footnote}
          </p>
        )}

        <Footnotes items={category.items} />

        <Link
          href={`/carte/${next.slug}`}
          className="mt-12 flex items-baseline justify-between py-4"
          style={{ borderTop: "1px solid var(--rule-strong)" }}
        >
          <span className="eyebrow" style={{ color: "var(--color-or)" }}>
            Chapitre suivant
          </span>
          <span className="display text-[22px]">{next.name}</span>
        </Link>
      </div>
    </main>
  );
}
