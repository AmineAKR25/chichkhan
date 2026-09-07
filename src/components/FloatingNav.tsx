"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { categories } from "@/lib/menu";
import { accentVar } from "@/components/accents";

/** Navigation flottante — écran 10. Fermée, c'est un jeton d'or en bas d'écran. */
export function FloatingNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // These routes provide their own persistent navigation.
  if (pathname === "/" || pathname === "/carte" || pathname.startsWith("/carte/")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="eyebrow fixed bottom-6 left-1/2 z-40 -translate-x-1/2 px-6 py-3.5 transition-colors"
        style={{
          color: "var(--color-nuit)",
          background: "var(--color-or)",
          boxShadow: "0 12px 32px -12px rgba(0,0,0,.8)",
        }}
      >
        Aller à
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          style={{
            background: "var(--color-nuit)",
            backgroundImage: "var(--grain)",
          }}
        >
          <div className="screen px-6 pb-24 pt-12">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow-wide" style={{ color: "var(--color-or)" }}>
                Aller à
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer la navigation"
                className="text-[22px] leading-none"
                style={{ color: "var(--color-or)" }}
              >
                ✕
              </button>
            </div>

            <nav className="mt-10">
              {categories.map((category) => {
                const href = `/carte/${category.slug}`;
                const here = pathname === href;
                return (
                  <Link
                    key={category.slug}
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={here ? "page" : undefined}
                    className="rule-top flex items-baseline gap-4 py-4"
                    style={{ ["--accent" as string]: accentVar[category.accent] }}
                  >
                    <span
                      className="eyebrow w-6 shrink-0"
                      style={{ color: "var(--accent)" }}
                    >
                      {String(category.index).padStart(2, "0")}
                    </span>
                    <span
                      className="display flex-1 text-[26px]"
                      style={{ lineHeight: 1.05 }}
                    >
                      {category.name}
                    </span>
                    {here && (
                      <span className="eyebrow" style={{ color: "var(--accent)" }}>
                        Ici
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <Link
              href="/infos"
              onClick={() => setOpen(false)}
              className="rule-top mt-10 flex items-baseline justify-between py-4"
            >
              <span className="display text-[26px]" style={{ lineHeight: 1.05 }}>
                Infos pratiques
              </span>
              <span className="eyebrow" style={{ color: "var(--color-or)" }}>
                Wi-Fi & horaires
              </span>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
