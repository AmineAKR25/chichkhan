/**
 * Carte Havana — 38 articles, six chapitres.
 * Prix en dinars tunisiens (DT), taxes et service compris.
 *
 * Marqueurs : « * » contient des fruits à coque · « † » préparé maison
 */

export type Accent = "or" | "abricot" | "terracotta" | "sauge" | "cobalt" | "lagune";

export type Item = {
  slug: string;
  name: string;
  /** Composition courte, affichée sous le nom. Absente ⇒ ligne de points. */
  description?: string;
  /** Dinars tunisiens */
  price: number;
  /** Contient des fruits à coque (*) */
  nuts?: boolean;
  /** Préparé maison (†) */
  maison?: boolean;
  /** Surtitre de la fiche produit */
  signature?: string;
  /** Texte long de la fiche produit */
  detail?: string;
  /** Mention de service, bas de fiche */
  serving?: string;
};

export type Category = {
  slug: string;
  /** Nom court, pour la navigation et le fil d'ariane */
  name: string;
  /** Titre d'affichage sur deux lignes */
  display: [string, string];
  /** « Chapitre trois » */
  chapter: string;
  /** 1 – 6 */
  index: number;
  /** Sous-titre de la navigation */
  tagline: string;
  /** Chapô en Cormorant italique */
  intro: string;
  accent: Accent;
  /** Légende de l'emplacement photo circulaire */
  slotCaption?: string;
  /** Mention de bas de chapitre */
  footnote?: string;
  items: Item[];
};

export const categories: Category[] = [
  {
    slug: "glaces-et-coupes",
    name: "Glaces & Coupes",
    display: ["Glaces", "& Coupes"],
    chapter: "Chapitre un",
    index: 1,
    tagline: "Six coupes, sept parfums",
    intro:
      "Turbinées sur place chaque matin, à la datte de Djerba et au lait frais.",
    accent: "abricot",
    slotCaption: "Le bac à glaces",
    items: [
      {
        slug: "coupe-havana",
        name: "Coupe Havana",
        description:
          "glace vanille bourbon, dattes de Djerba caramélisées, éclats de noix de pécan, crème fouettée",
        price: 16,
        nuts: true,
        signature: "La signature",
        detail:
          "La coupe qui a donné son nom à la maison : vanille turbinée le matin, dattes caramélisées à la poêle.",
        serving: "Trois boules · sert une personne",
      },
      {
        slug: "coupe-barbaros",
        name: "Coupe Barbaros",
        description:
          "trois boules chocolat noir, sauce chocolat chaud, brownie tiède, chantilly",
        price: 18,
      },
      {
        slug: "coupe-marina",
        name: "Coupe Marina",
        description:
          "sorbet citron, sorbet fraise, coulis de fruits rouges, menthe fraîche",
        price: 14,
      },
      {
        slug: "coupe-bougainvillee",
        name: "Coupe Bougainvillée",
        description:
          "glace pistache, glace vanille, miel de thym, pistaches concassées",
        price: 17,
        nuts: true,
      },
      {
        slug: "cafe-liegeois",
        name: "Café Liégeois",
        description: "deux boules café, expresso, chantilly, copeaux de chocolat",
        price: 13,
      },
      {
        slug: "boule-au-choix",
        name: "Boule au choix",
        description: "vanille, chocolat, pistache, citron, fraise, café, datte",
        price: 4,
        maison: true,
      },
    ],
  },
  {
    slug: "crepes-et-gaufres",
    name: "Crêpes & Gaufres",
    display: ["Crêpes", "& Gaufres"],
    chapter: "Chapitre deux",
    index: 2,
    tagline: "Pâte fraîche, dattes et miel",
    intro:
      "Pâte préparée le matin, cuite à la commande. Comptez dix minutes aux heures de pointe.",
    accent: "terracotta",
    slotCaption: "La plancha à crêpes",
    items: [
      {
        slug: "crepe-nutella",
        name: "Crêpe Nutella",
        description: "pâte à tartiner aux noisettes, sucre glace",
        price: 10,
        nuts: true,
      },
      {
        slug: "crepe-havana",
        name: "Crêpe Havana",
        description: "dattes, miel, amandes grillées, crème fraîche",
        price: 14,
        nuts: true,
      },
      {
        slug: "crepe-citron-sucre",
        name: "Crêpe Citron & Sucre",
        description: "citron pressé, sucre de canne",
        price: 8,
      },
      {
        slug: "gaufre-gourmande",
        name: "Gaufre Gourmande",
        description: "chocolat fondu, banane, chantilly, éclats de noisette",
        price: 15,
        nuts: true,
      },
      {
        slug: "gaufre-fruits-rouges",
        name: "Gaufre Fruits Rouges",
        description: "coulis maison, fraises fraîches, glace vanille",
        price: 16,
        maison: true,
      },
      {
        slug: "pancakes-sirop-derable",
        name: "Pancakes Sirop d'Érable",
        description: "trois pancakes, beurre demi-sel, sirop d'érable",
        price: 12,
      },
    ],
  },
  {
    slug: "boissons-chaudes",
    name: "Boissons Chaudes",
    display: ["Boissons", "Chaudes"],
    chapter: "Chapitre trois",
    index: 3,
    tagline: "Cafés, thés à la menthe",
    intro: "Le café se prend lentement, le thé encore plus.",
    accent: "or",
    slotCaption: "Le comptoir",
    items: [
      { slug: "express", name: "Express", price: 3 },
      { slug: "capucin", name: "Capucin", price: 4 },
      {
        slug: "cafe-turc",
        name: "Café Turc",
        description: "cardamome, servi à la turque",
        price: 5,
      },
      { slug: "cappuccino", name: "Cappuccino", price: 6 },
      { slug: "latte-macchiato", name: "Latte Macchiato", price: 7 },
      {
        slug: "the-a-la-menthe",
        name: "Thé à la Menthe",
        description: "thé vert, menthe fraîche, pignons de pin",
        price: 5,
        nuts: true,
      },
      {
        slug: "the-aux-amandes",
        name: "Thé aux Amandes",
        description: "amandes grillées, servi au verre",
        price: 6,
        nuts: true,
      },
      {
        slug: "infusion-verveine-citron",
        name: "Infusion Verveine-Citron",
        price: 5,
      },
      {
        slug: "chocolat-chaud-havana",
        name: "Chocolat Chaud Havana",
        description: "chocolat noir fondu, chantilly",
        price: 9,
      },
    ],
  },
  {
    slug: "jus-et-smoothies",
    name: "Jus & Smoothies",
    display: ["Jus &", "Smoothies"],
    chapter: "Chapitre quatre",
    index: 4,
    tagline: "Pressés minute, fruits de saison",
    intro: "Sans sucre ajouté, sauf demande. Fruits du marché de Houmt Souk.",
    accent: "sauge",
    slotCaption: "L'étal du matin",
    items: [
      { slug: "jus-dorange-presse", name: "Jus d'Orange Pressé", price: 8 },
      {
        slug: "citronnade-a-la-menthe",
        name: "Citronnade à la Menthe",
        description: "citron pressé, menthe, eau gazeuse",
        price: 9,
      },
      {
        slug: "jus-de-grenade",
        name: "Jus de Grenade",
        description: "de saison, pressé minute",
        price: 12,
      },
      {
        slug: "smoothie-datte-banane",
        name: "Smoothie Datte & Banane",
        description: "dattes de Djerba, banane, lait, cannelle",
        price: 13,
      },
      {
        slug: "smoothie-mangue-passion",
        name: "Smoothie Mangue-Passion",
        description: "mangue, fruit de la passion, glace pilée",
        price: 13,
      },
      {
        slug: "milkshake",
        name: "Milkshake",
        description: "vanille, chocolat ou fraise, à la glace artisanale",
        price: 12,
        maison: true,
      },
    ],
  },
  {
    slug: "cocktails-sans-alcool",
    name: "Cocktails sans alcool",
    display: ["Cocktails", "sans alcool"],
    chapter: "Chapitre cinq",
    index: 5,
    tagline: "Au shaker, face au port",
    intro:
      "Servis en verre haut, glace pilée, au coucher du soleil sur le port.",
    accent: "cobalt",
    slotCaption: "Le shaker",
    footnote: "Aucun alcool n'est servi à Havana.",
    items: [
      {
        slug: "havana-sunset",
        name: "Havana Sunset",
        description: "fruit de la passion, orange, grenadine, citron vert",
        price: 15,
      },
      {
        slug: "mojito-cubain",
        name: "Mojito Cubain",
        description: "citron vert, menthe fraîche, sucre de canne, eau gazeuse",
        price: 14,
      },
      {
        slug: "virgin-colada",
        name: "Virgin Colada",
        description: "ananas, lait de coco, glace pilée",
        price: 15,
      },
      {
        slug: "blue-marina",
        name: "Blue Marina",
        description: "sirop curaçao, citron, tonic, menthe",
        price: 14,
      },
      {
        slug: "detox-verte",
        name: "Détox Verte",
        description: "concombre, pomme verte, citron, gingembre, menthe",
        price: 13,
      },
    ],
  },
  {
    slug: "salees-et-snacks",
    name: "Salées & Snacks",
    display: ["Salées", "& Snacks"],
    chapter: "Chapitre six",
    index: 6,
    tagline: "Paninis, salades, club",
    intro: "Service continu de 11 h à minuit. Pain et sauces faits maison.",
    accent: "lagune",
    slotCaption: "La cuisine",
    items: [
      {
        slug: "frites-maison",
        name: "Frites Maison",
        description: "sel de mer, sauce au choix",
        price: 8,
        maison: true,
      },
      {
        slug: "panini-thon-harissa",
        name: "Panini Thon Harissa",
        description: "harissa maison, olives, fromage fondu",
        price: 14,
        maison: true,
      },
      {
        slug: "croque-havana",
        name: "Croque Havana",
        description: "pain de mie, dinde fumée, emmental, salade verte",
        price: 15,
      },
      {
        slug: "bruschetta-mediterraneenne",
        name: "Bruschetta Méditerranéenne",
        description:
          "tomates confites, basilic, mozzarella, huile d'olive de Djerba",
        price: 16,
      },
      {
        slug: "salade-djerbienne",
        name: "Salade Djerbienne",
        description: "thon, œuf, câpres, olives, poivrons grillés",
        price: 18,
      },
      {
        slug: "club-sandwich",
        name: "Club Sandwich",
        description: "poulet grillé, œuf, crudités, frites maison",
        price: 22,
        maison: true,
      },
    ],
  },
];

export function getCategory(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

export function findItem(
  slug: string,
): { item: Item; category: Category } | undefined {
  for (const category of categories) {
    const item = category.items.find((i) => i.slug === slug);
    if (item) return { item, category };
  }
}

export const allItems = categories.flatMap((category) =>
  category.items.map((item) => ({ item, category })),
);

/** Prix formaté avec l'espace fine insécable exigée par la maquette. */
export function formatPrice(price: number): string {
  return `${price} DT`;
}

/** La composition de la fiche produit dérive de la description. */
export function composition(item: Item): string[] {
  if (!item.description) return [];
  return item.description.split(",").map((part) => part.trim());
}
