import Link from "next/link";
import { site } from "@/lib/site";

/** Écran 01 — l'ouverture. L'arche, le mot Havana, deux portes. */
export default function Ouverture() {
  return (
    <main className="screen relative flex min-h-dvh flex-col overflow-hidden px-8 pb-10 pt-11">
      {/* Lueur de coucher de soleil sur le port — décor, jamais du texte */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 70% at 50% 4%, rgba(192,90,52,.62) 0%, rgba(192,90,52,.14) 46%, transparent 72%), radial-gradient(90% 50% at 80% 100%, rgba(38,112,127,.34), transparent 70%)",
        }}
      />

      <div className="relative flex flex-1 flex-col">
        <div
          className="flex items-center justify-between"
          style={{
            font: "500 11px/1 var(--font-ui)",
            letterSpacing: ".24em",
            textTransform: "uppercase",
            color: "var(--color-or)",
          }}
        >
          <span>{site.place}</span>
          <span>{site.established}</span>
        </div>

        <div
          className="relative mt-14 h-[322px]"
          style={{
            border: "1px solid rgba(195,155,74,.55)",
            borderRadius: "150px 150px 4px 4px",
            background:
              "linear-gradient(178deg, rgba(192,90,52,.30), rgba(20,24,26,0) 62%)",
          }}
        >
          <div
            aria-hidden
            className="absolute"
            style={{
              inset: 9,
              border: "1px solid rgba(195,155,74,.28)",
              borderRadius: "142px 142px 2px 2px",
            }}
          />
          <div className="absolute inset-x-0 top-[74px] text-center">
            <div
              style={{
                font: "500 12px/1 var(--font-ui)",
                letterSpacing: ".42em",
                textTransform: "uppercase",
                color: "var(--color-or)",
              }}
            >
              {site.tagline}
            </div>
            <h1
              className="mt-[22px]"
              style={{
                font: "600 76px/.82 var(--font-display)",
                letterSpacing: ".02em",
                color: "var(--color-creme)",
              }}
            >
              {site.name}
            </h1>
            <div
              aria-hidden
              className="mx-auto mt-5 h-px w-[54px]"
              style={{ background: "var(--color-or)" }}
            />
            <p
              className="mt-5"
              style={{
                font: "italic 400 20px/1.4 var(--font-display)",
                color: "var(--color-sable)",
              }}
            >
              Salon &amp; terrasse
              <br />
              au bord de l&rsquo;eau
            </p>
          </div>
        </div>

        <div className="mt-auto pt-12">
          <p
            className="mb-[26px]"
            style={{ font: "400 15px/1.65 var(--font-ui)", color: "var(--color-sable)" }}
          >
            {site.intro}
          </p>

          <div className="flex flex-col gap-2.5">
            <Link
              href="/carte"
              className="flex items-center justify-between px-6 py-[19px] transition-opacity hover:opacity-90"
              style={{ background: "var(--color-chaux)" }}
            >
              <span
                style={{
                  font: "600 17px/1 var(--font-ui)",
                  letterSpacing: ".02em",
                  color: "var(--color-nuit)",
                }}
              >
                Voir la carte
              </span>
              <span
                aria-hidden
                style={{
                  font: "400 22px/1 var(--font-display)",
                  color: "var(--color-terracotta-profond)",
                }}
              >
                →
              </span>
            </Link>

            <div className="flex gap-2.5">
              <Link
                href="/infos"
                className="flex-1 px-5 py-4 transition-colors hover:bg-white/5"
                style={{
                  border: "1px solid rgba(195,155,74,.45)",
                  font: "500 13px/1 var(--font-ui)",
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: "var(--color-or)",
                }}
              >
                Infos pratiques
              </Link>
              <div
                className="flex w-14 items-center justify-center"
                style={{
                  border: "1px solid rgba(195,155,74,.45)",
                  font: "500 13px/1 var(--font-ui)",
                  letterSpacing: ".06em",
                  color: "var(--color-or)",
                }}
              >
                FR
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
