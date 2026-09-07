import Link from "next/link";
import type { Metadata } from "next";
import { categories } from "@/lib/menu";
import { accentStyle } from "@/components/accents";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "La carte",
  description: "Six chapitres, de la glace au sel de mer.",
};

export default function Carte() {
  return (
    <main id="menu-content" className="menu-overview" tabIndex={-1}>
      <header className="menu-page-intro">
        <p className="menu-eyebrow">Havana · La carte</p>
        <h1>
          À chaque envie,
          <br />
          <em>son chapitre.</em>
        </h1>
        <p>Six chapitres, de la glace au sel de mer.</p>
      </header>
      <nav className="menu-category-grid" aria-label="Choisir une catégorie">
        {categories.map((category) => (
          <Link
            href={`/carte/${category.slug}`}
            key={category.slug}
            className="menu-category-card"
            style={accentStyle(category.accent)}
          >
            <div className="menu-card-top">
              <span>{category.chapter}</span>
              <span>{category.items.length} articles</span>
            </div>
            <h2>
              {category.display[0]}
              <br />
              <em>{category.display[1]}</em>
            </h2>
            <div className="menu-card-bottom">
              <p>{category.tagline}</p>
              <span aria-hidden="true">↗</span>
            </div>
          </Link>
        ))}
      </nav>
      <footer className="menu-page-footer">
        <p>{site.legal}</p>
        <Link href="/infos">
          Infos pratiques <span aria-hidden="true">↗</span>
        </Link>
      </footer>
    </main>
  );
}
