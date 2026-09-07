import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { categories, getCategory } from "@/lib/menu";
import { accentStyle } from "@/components/accents";
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
  return category ? { title: category.name, description: category.intro } : {};
}
export default async function Chapitre({
  params,
}: PageProps<"/carte/[categorie]">) {
  const { categorie } = await params;
  const category = getCategory(categorie);
  if (!category) notFound();
  const next = categories[category.index % categories.length];
  return (
    <main
      id="menu-content"
      className="menu-category-page"
      tabIndex={-1}
      style={accentStyle(category.accent)}
    >
      <div className="menu-breadcrumb">
        <Link href="/carte">La carte</Link>
        <span aria-hidden="true">/</span>
        <span>{category.name}</span>
      </div>
      <header className="menu-category-hero">
        <div className="menu-category-art" aria-hidden="true">
          <PhotoSlot id={category.slug} />
        </div>
        <div className="menu-category-heading">
          <p className="menu-eyebrow" style={{ color: "var(--accent)" }}>
            {category.chapter}
          </p>
          <h1>
            {category.display[0]}
            <br />
            <em>{category.display[1]}</em>
          </h1>
        </div>
      </header>
      <div className="menu-category-body">
        <div className="menu-category-description">
          <p>{category.intro}</p>
          <span>{category.items.length} articles · DT</span>
        </div>
        <div className="menu-item-grid">
          {category.items.map((item) => (
            <MenuRow key={item.slug} item={item} />
          ))}
        </div>
        {category.footnote && (
          <p className="note mt-6" style={{ color: "var(--accent)" }}>
            {category.footnote}
          </p>
        )}
        <Footnotes items={category.items} />
        <Link href={`/carte/${next.slug}`} className="menu-next-category">
          <span className="menu-eyebrow">Chapitre suivant</span>
          <span>
            {next.name} <i aria-hidden="true">→</i>
          </span>
        </Link>
      </div>
    </main>
  );
}
