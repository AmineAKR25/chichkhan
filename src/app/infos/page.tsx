import Link from "next/link";
import type { Metadata } from "next";
import { site } from "@/lib/site";
import { TopBar } from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Infos pratiques",
  description: `${site.name} · ${site.place} — horaires, adresse, Wi-Fi.`,
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="eyebrow" style={{ color: "var(--color-or)" }}>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Écran 11 — horaires, adresse, Wi-Fi, réseaux. */
export default function Infos() {
  return (
    <main className="screen flex min-h-dvh flex-col pb-32">
      <TopBar href="/carte" label="La carte" />

      <div className="px-6 pt-10">
        <p className="eyebrow-wide" style={{ color: "var(--color-or)" }}>
          {site.name} · {site.place}
        </p>
        <h1 className="display mt-4 text-[44px]">Infos pratiques</h1>

        <Section title="Horaires">
          {site.hours.map((slot) => (
            <div
              key={slot.days}
              className="rule-top flex items-baseline gap-3 py-3"
            >
              <span className="item-desc flex-1">{slot.days}</span>
              <span className="price">{slot.time}</span>
            </div>
          ))}
          <p className="note mt-4">{site.hoursNote}</p>
        </Section>

        <Section title="Adresse">
          <address className="not-italic">
            {site.address.map((line) => (
              <span
                key={line}
                className="block"
                style={{
                  font: "400 15px/1.6 var(--font-ui)",
                  color: "var(--color-sable)",
                }}
              >
                {line}
              </span>
            ))}
          </address>
          <div className="mt-5 flex gap-2.5">
            <a
              href={site.maps}
              target="_blank"
              rel="noreferrer"
              className="eyebrow flex-1 px-5 py-4 transition-colors hover:bg-white/5"
              style={{
                border: "1px solid rgba(195,155,74,.45)",
                color: "var(--color-or)",
              }}
            >
              Itinéraire
            </a>
            <a
              href={`tel:${site.phone.replace(/\s/g, "")}`}
              className="eyebrow px-5 py-4 transition-colors hover:bg-white/5"
              style={{
                border: "1px solid rgba(195,155,74,.45)",
                color: "var(--color-or)",
                letterSpacing: ".06em",
              }}
            >
              {site.phone}
            </a>
          </div>
        </Section>

        <Section title="Wi-Fi">
          <div className="rule-top flex items-baseline gap-3 py-3">
            <span className="item-desc flex-1">Réseau</span>
            <span className="price">{site.wifi.network}</span>
          </div>
          <div className="rule-top flex items-baseline gap-3 py-3">
            <span className="item-desc flex-1">Mot de passe</span>
            <span className="price">{site.wifi.password}</span>
          </div>
        </Section>

        <Section title="Nous suivre">
          {site.social.map((account) => (
            <a
              key={account.label}
              href={account.href}
              target="_blank"
              rel="noreferrer"
              className="rule-top flex items-baseline gap-3 py-3 transition-colors hover:text-[var(--color-creme)]"
            >
              <span className="item-desc flex-1">{account.label}</span>
              <span className="item-name text-[17px]">{account.handle}</span>
            </a>
          ))}
        </Section>

        <div
          className="mt-12 pt-6"
          style={{ borderTop: "1px solid var(--rule-strong)" }}
        >
          <Link
            href="/"
            className="display text-[32px]"
            style={{ color: "var(--color-terracotta)" }}
          >
            {site.name}
          </Link>
          <p className="note mt-4">
            {site.legal} {site.updated}
          </p>
        </div>
      </div>
    </main>
  );
}
