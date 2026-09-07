import type { Accent } from "@/lib/menu";

/** Chaque chapitre porte un accent ; le fond, lui, ne change jamais. */
export const accentVar: Record<Accent, string> = {
  or: "var(--color-or)",
  abricot: "var(--color-abricot)",
  terracotta: "var(--color-terracotta)",
  sauge: "var(--color-sauge)",
  cobalt: "var(--color-cobalt)",
  lagune: "var(--color-lagune)",
};

/** Style à poser sur la racine d'un écran pour teinter tout son chapitre. */
export function accentStyle(accent: Accent): React.CSSProperties {
  return { ["--accent" as string]: accentVar[accent] };
}
