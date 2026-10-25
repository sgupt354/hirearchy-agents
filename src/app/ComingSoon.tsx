/** Placeholder for a tab whose feature hasn't landed on this branch yet. */
export function ComingSoon({ icon, title, blurb }: { icon: string; title: string; blurb: string }) {
  return (
    <section className="coming-soon">
      <div className="cs-card">
        <span className="cs-icon" aria-hidden>{icon}</span>
        <h2>{title}</h2>
        <p>{blurb}</p>
        <span className="cs-pill">Coming soon</span>
      </div>
    </section>
  );
}
