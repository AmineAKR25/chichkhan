import Link from "next/link";
import { formatPrice, type Item } from "@/lib/menu";
import { Marks } from "@/components/Marks";

/**
 * Une ligne de carte.
 *
 * Règle héritée de l'écran 05 : la ligne de points ne sert qu'aux articles
 * nus (« Express … 3 DT »). Dès qu'il y a une composition, on passe en deux
 * colonnes alignées sur la ligne de base et le pointillé disparaît.
 */
export function MenuRow({ item }: { item: Item }) {
  const href = `/produit/${item.slug}`;

  if (!item.description) {
    return (
      <Link
        href={href}
        className="rule-top group flex items-baseline gap-2.5 py-3"
      >
        <span className="item-name transition-colors group-hover:text-[var(--color-creme)]">
          {item.name}
          <Marks item={item} />
        </span>
        <span aria-hidden className="leader" />
        <span className="price ml-auto">{formatPrice(item.price)}</span>
      </Link>
    );
  }

  return (
    <Link href={href} className="rule-top group flex items-baseline gap-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="item-name block transition-colors group-hover:text-[var(--color-creme)]">
          {item.name}
          <Marks item={item} />
        </span>
        <span className="item-desc mt-1 block">{item.description}</span>
      </span>
      <span className="price">{formatPrice(item.price)}</span>
    </Link>
  );
}
