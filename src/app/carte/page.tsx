import Link from "next/link";
import type { Metadata } from "next";
import { categories } from "@/lib/menu";
import { accentVar } from "@/components/accents";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "La carte",
  description: "Six chapitres, de la glace au sel de mer.",
};

/** Écran 02 — les six chapitres, chacun sous son accent. */
export default function Carte() {
  return (
    <main className="screen flex min-h-dvh flex-col px-6 pb-32 pt-12">
      <Link href="/" className="eyebrow-wide" style={{ color: "var(--color-or)" }}>
        {site.name}
      </Link>

      <h1 className="display mt-8 text-[46px]">La carte</h1>
      <p className="lede mt-4">
        Six chapitres,
        <br />
        de la glace au sel de mer.
      </p>

      <nav className="mt-10">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/carte/${category.slug}`}
            className="rule-top group flex items-baseline gap-4 py-5"
            style={{ ["--accent" as string]: accentVar[category.accent] }}
          >
            <span className="min-w-0 flex-1">
              <span
                className="display block text-[24px] transition-colors group-hover:text-[var(--accent)]"
                style={{ lineHeight: 1.05 }}
              >
                {category.name}
              </span>
              <span className="item-desc mt-1.5 block">
                {category.tagline} · {category.items.length} articles
              </span>
            </span>
            <span className="eyebrow" style={{ color: "var(--accent)" }}>
              {String(category.index).padStart(2, "0")}
            </span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto pt-12" style={{ borderTop: "1px solid var(--rule)" }}>
        <p className="note mt-5">{site.legal}</p>
        <Link
          href="/infos"
          className="eyebrow mt-3 inline-block"
          style={{ color: "var(--color-or)" }}
        >
          Infos pratiques
        </Link>
      </div>
    </main>
  );
}
