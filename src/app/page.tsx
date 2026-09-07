import Link from "next/link";
import { site } from "@/lib/site";
import { categories } from "@/lib/menu";
import { accentStyle } from "@/components/accents";
import "./home.css";

export default function Ouverture() {
  return (
    <main className="havana-home" id="accueil">
      <a className="home-skip" href="#decouvrir">
        Découvrir la carte
      </a>
      <header className="home-header">
        <Link href="/" className="home-monogram" aria-label="Havana — accueil">
          h<span aria-hidden="true">.</span>
        </Link>
        <span className="home-location">
          {site.place}
          <span>Tunisie</span>
        </span>
        <nav aria-label="Navigation principale">
          <Link href="/infos">Infos pratiques</Link>
          <Link href="/carte" className="home-nav-menu">
            La carte <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>

      <section className="home-opening" aria-labelledby="home-title">
        <div className="home-wordmark-line">
          <span>Café · Glacier</span>
          <span>{site.established}</span>
        </div>
        <h1 id="home-title" className="home-wordmark">
          Havana<span aria-hidden="true">.</span>
        </h1>
        <div className="home-opening-grid">
          <div className="home-opening-copy">
            <span className="home-eyebrow">Salon & terrasse</span>
            <h2>
              Le temps
              <br />
              d’une <em>douceur.</em>
            </h2>
            <p>{site.intro}</p>
            <Link href="/carte" className="home-primary">
              Découvrir la carte <span aria-hidden="true">↗</span>
            </Link>
            <a href="#decouvrir" className="home-scroll-link">
              <span aria-hidden="true">↓</span> Prenez le temps de choisir
            </a>
          </div>
          <div className="home-arch-composition" aria-hidden="true">
            <div className="home-arch-outline" />
            <div className="home-colour-arch">
              <span className="home-arch-circle" />
              <span className="home-arch-lower" />
            </div>
            <div className="home-small-block">
              <span>
                Une pause
                <br />
                <i>au bord de l’eau.</i>
              </span>
            </div>
            <span className="home-art-caption">La douceur a son adresse.</span>
          </div>
        </div>
      </section>

      <section
        className="home-chapters"
        id="decouvrir"
        aria-labelledby="chapters-title"
      >
        <div className="home-section-heading">
          <div>
            <span className="home-eyebrow">La carte Havana</span>
            <h2 id="chapters-title">
              Suivez
              <br />
              <em>votre envie.</em>
            </h2>
          </div>
          <p>
            Six chapitres,
            <br />
            de la glace au sel de mer.
          </p>
        </div>
        <div className="home-chapter-grid">
          {categories.map((category) => (
            <Link
              href={`/carte/${category.slug}`}
              className="home-chapter"
              key={category.slug}
              style={accentStyle(category.accent)}
            >
              <div className="home-chapter-placeholder" aria-hidden="true">
                <span />
                <i />
              </div>
              <div className="home-chapter-label">
                <span className="home-chapter-number">
                  {String(category.index).padStart(2, "0")}
                </span>
                <h3>{category.name}</h3>
                <span aria-hidden="true">↗</span>
              </div>
              <p>{category.tagline}</p>
            </Link>
          ))}
        </div>
        <Link href="/carte" className="home-all-menu">
          Toute la carte <span aria-hidden="true">→</span>
        </Link>
      </section>

      <footer className="home-footer">
        <div>
          <span className="home-eyebrow">{site.place}</span>
          <p>
            On se retrouve
            <br />
            <em>chez Havana.</em>
          </p>
        </div>
        <div className="home-footer-links">
          <Link href="/infos">
            Horaires, adresse & Wi-Fi <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/carte">
            La carte <span aria-hidden="true">↗</span>
          </Link>
          <span>
            {site.name} · {site.established}
          </span>
        </div>
      </footer>
    </main>
  );
}
