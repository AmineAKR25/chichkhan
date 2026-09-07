import Link from "next/link";

export default function NotFound() {
  return (
    <main className="screen flex min-h-dvh flex-col items-start justify-center px-6">
      <p className="eyebrow-wide" style={{ color: "var(--color-or)" }}>
        Page introuvable
      </p>
      <h1 className="display mt-4 text-[44px]">
        Rien
        <br />
        à cette table
      </h1>
      <Link
        href="/carte"
        className="eyebrow mt-8 px-6 py-4"
        style={{ background: "var(--color-or)", color: "var(--color-nuit)" }}
      >
        Voir la carte
      </Link>
    </main>
  );
}
