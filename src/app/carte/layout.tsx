import { MenuChrome } from "@/components/MenuChrome";
import { categories, allItems } from "@/lib/menu";
import { accentVar } from "@/components/accents";
import "./menu.css";

export default function MenuLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MenuChrome
      chapters={categories.map((category) => ({
        slug: category.slug,
        name: category.name,
        count: category.items.length,
        accent: accentVar[category.accent],
      }))}
      items={allItems.map(({ item, category }) => ({
        slug: item.slug,
        name: item.name,
        description: item.description,
        category: category.name,
        price: item.price,
      }))}
    >
      {children}
    </MenuChrome>
  );
}
