/** Havana — café & glacier, Marina de Djerba. Informations pratiques. */

export const site = {
  name: "Havana",
  tagline: "Café · Glacier",
  established: "Est. 2016",
  place: "Marina de Djerba",
  intro:
    "Glaces fabriquées sur place, dattes de l'île, thé à la menthe au coucher du soleil.",
  hours: [
    { days: "Du lundi au jeudi", time: "09 h – 00 h" },
    { days: "Vendredi & samedi", time: "09 h – 02 h" },
    { days: "Dimanche", time: "10 h – 01 h" },
  ],
  hoursNote: "Cuisine salée jusqu'à minuit, glaces jusqu'à la fermeture.",
  address: [
    "Quai sud, Marina de Djerba",
    "Route touristique, Houmt Souk 4180",
    "Djerba, Tunisie",
  ],
  phone: "+216 75 654 210",
  maps: "https://maps.google.com/?q=Marina+de+Djerba+Houmt+Souk",
  wifi: { network: "Havana_Marina", password: "glacedjerba" },
  social: [
    { label: "Instagram", handle: "@havana.djerba", href: "https://instagram.com/havana.djerba" },
    { label: "Facebook", handle: "Havana Marina Djerba", href: "https://facebook.com/havanamarinadjerba" },
  ],
  legal: "Prix en dinars tunisiens (DT), taxes et service compris.",
  updated: "Carte mise à jour en septembre 2026.",
} as const;

export const footnotes = {
  nuts: { mark: "*", label: "contient des fruits à coque" },
  maison: { mark: "†", label: "préparé maison" },
} as const;
