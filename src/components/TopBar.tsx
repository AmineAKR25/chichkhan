import Link from "next/link";

type Props = {
  /** Destination de la flèche retour */
  href: string;
  label: string;
  /** « 03 / 06 » — aligné à droite */
  counter?: string;
};

/** Barre de 56 px, filet d'or en pied. Reprise de l'écran 05. */
export function TopBar({ href, label, counter }: Props) {
  return (
    <header
      className="flex h-14 items-center gap-3 px-5"
      style={{ borderBottom: "1px solid var(--rule-strong)" }}
    >
      <Link
        href={href}
        className="flex items-center gap-3 transition-colors hover:text-[var(--color-creme)]"
        style={{ color: "var(--accent)" }}
      >
        <span
          aria-hidden
          className="text-[22px] leading-none"
          style={{ fontFamily: "var(--font-display)" }}
        >
          ←
        </span>
        <span className="eyebrow">{label}</span>
      </Link>
      {counter && (
        <span className="eyebrow ml-auto" style={{ color: "var(--accent)" }}>
          {counter}
        </span>
      )}
    </header>
  );
}
