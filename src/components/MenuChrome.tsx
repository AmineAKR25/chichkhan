"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { searchMenu, type SearchItem } from "@/lib/menu-search";

type Chapter = { slug: string; name: string; count: number; accent: string };

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </svg>
  );
}

export function MenuChrome({
  children,
  chapters,
  items,
}: {
  children: React.ReactNode;
  chapters: Chapter[];
  items: SearchItem[];
}) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const rail = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const matches = searchMenu(items, query);

  function openSearch() {
    setQuery("");
    dialog.current?.showModal();
    input.current?.focus();
  }

  function cycleSearchFocus(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "button, input, a[href]",
      ),
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        dialog.current?.showModal();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const current = rail.current?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    if (!current || !rail.current) return;
    rail.current.scrollTo({
      left: current.offsetLeft - rail.current.offsetLeft - 20,
      behavior: "instant",
    });
  }, [pathname]);

  const categoryLinks = chapters.map((chapter) => (
    <Link
      key={chapter.slug}
      href={`/carte/${chapter.slug}`}
      aria-current={pathname === `/carte/${chapter.slug}` ? "page" : undefined}
      style={{ "--chapter-accent": chapter.accent } as React.CSSProperties}
    >
      <span className="menu-chapter-dot" aria-hidden="true" />
      <span>{chapter.name}</span>
      <small>{chapter.count}</small>
    </Link>
  ));

  return (
    <div className="havana-menu">
      <a className="menu-skip" href="#menu-content">
        Aller au contenu
      </a>
      <header className="menu-header">
        <Link href="/" className="menu-brand" aria-label="Havana — accueil">
          Havana<span>Café · Glacier</span>
        </Link>
        <span className="menu-header-place">Marina de Djerba</span>
        <div className="menu-header-actions">
          <Link href="/infos" className="menu-info-link">
            Infos pratiques
          </Link>
          <button
            type="button"
            className="menu-search-trigger"
            onClick={openSearch}
            aria-label="Rechercher dans la carte"
          >
            <SearchIcon />
            <span>Rechercher</span>
            <kbd>⌘ / Ctrl K</kbd>
          </button>
        </div>
      </header>
      <nav
        className="menu-mobile-rail"
        aria-label="Catégories de la carte"
        ref={rail}
      >
        <Link
          href="/carte"
          aria-current={pathname === "/carte" ? "page" : undefined}
        >
          La carte
        </Link>
        {categoryLinks}
      </nav>
      <div className="menu-layout">
        <aside className="menu-sidebar">
          <div className="menu-sidebar-inner">
            <span className="menu-eyebrow">À votre goût</span>
            <Link
              href="/carte"
              className="menu-sidebar-title"
              aria-current={pathname === "/carte" ? "page" : undefined}
            >
              La carte <span aria-hidden="true">↗</span>
            </Link>
            <nav aria-label="Catégories de la carte">{categoryLinks}</nav>
            <p className="menu-sidebar-note">
              Un café, une douceur,
              <br />
              le temps de choisir.
            </p>
            <span className="menu-sidebar-currency">
              Prix en dinars tunisiens
            </span>
          </div>
        </aside>
        <div className="menu-workspace">{children}</div>
      </div>
      <dialog
        ref={dialog}
        className="menu-search-dialog"
        aria-labelledby="menu-search-title"
        onKeyDown={cycleSearchFocus}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="menu-search-sheet">
          <div className="menu-search-top">
            <h2 id="menu-search-title">Une envie précise ?</h2>
            <button
              type="button"
              className="menu-close"
              aria-label="Fermer la recherche"
              onClick={() => dialog.current?.close()}
            >
              ×
            </button>
          </div>
          <label className="menu-search-label" htmlFor="menu-search-input">
            Rechercher dans toute la carte
          </label>
          <div className="menu-search-field">
            <SearchIcon />
            <input
              ref={input}
              id="menu-search-input"
              type="search"
              autoComplete="off"
              placeholder="Un café, des dattes, une glace…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => {
                  setQuery("");
                  input.current?.focus();
                }}
              >
                ×
              </button>
            )}
          </div>
          <p className="menu-search-status" role="status">
            {query.trim()
              ? `${matches.length} résultat${matches.length === 1 ? "" : "s"}`
              : "Explorer par catégorie"}
          </p>
          <div className="menu-search-results">
            {!query.trim()
              ? chapters.map((chapter) => (
                  <Link
                    key={chapter.slug}
                    href={`/carte/${chapter.slug}`}
                    onClick={() => dialog.current?.close()}
                  >
                    <span>
                      <small>{chapter.count} articles</small>
                      <strong>{chapter.name}</strong>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                ))
              : matches.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/produit/${item.slug}`}
                    onClick={() => dialog.current?.close()}
                  >
                    <span>
                      <small>{item.category}</small>
                      <strong>{item.name}</strong>
                      {item.description && <em>{item.description}</em>}
                    </span>
                    <span className="menu-result-price">
                      {item.price} DT <span aria-hidden="true">↗</span>
                    </span>
                  </Link>
                ))}
            {query.trim() && !matches.length && (
              <div className="menu-search-empty">
                <h3>Aucun article trouvé.</h3>
                <p>
                  Essayez le nom d’une boisson, d’un dessert ou d’un ingrédient.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    input.current?.focus();
                  }}
                >
                  Voir les catégories <span aria-hidden="true">→</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}
