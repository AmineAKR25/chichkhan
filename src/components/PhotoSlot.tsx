type Props = {
  /** Identifiant de l'emplacement, pour le jour où les photos arrivent */
  id: string;
  caption?: string;
  size?: number;
};

/**
 * Emplacement photo — un cercle, partout, qui déborde du bord droit.
 * Une seule règle de recadrage pour toute la carte : carré, sujet centré.
 */
export function PhotoSlot({ id, caption, size = 196 }: Props) {
  return (
    <div
      data-image-slot={id}
      className="relative ml-auto overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        marginRight: -34,
        background:
          "radial-gradient(70% 70% at 32% 26%, color-mix(in oklab, var(--accent) 72%, #2a1b10) 0%, color-mix(in oklab, var(--accent) 34%, #2a1b10) 48%, #14181a 100%)",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-conic-gradient(from 12deg at 50% 50%, rgba(244,237,225,.10) 0deg 4deg, transparent 4deg 14deg)",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          inset: 10,
          border: "1px solid color-mix(in oklab, var(--accent) 60%, transparent)",
        }}
      />
      {caption && (
        <div
          className="eyebrow absolute inset-x-0 text-center"
          style={{ bottom: 30, color: "var(--color-creme)", letterSpacing: ".14em" }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
