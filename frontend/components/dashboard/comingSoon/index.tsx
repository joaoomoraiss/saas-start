"use client";

// Placeholder para seções do dashboard que ainda não existem.
// Útil para publicar a navegação antes da feature ficar pronta.

interface ComingSoonProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

const DefaultIcon = (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <rect
      x="2.5"
      y="2.5"
      width="23"
      height="23"
      rx="4"
      stroke="#9ca3af"
      strokeWidth="1.6"
    />
    <path
      d="M14 9v5l3.5 2"
      stroke="#9ca3af"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function ComingSoon({
  title,
  description,
  icon,
}: ComingSoonProps) {
  return (
    <section
      className="flex flex-col items-center justify-center min-h-[60vh] gap-4 pb-32 text-center"
      style={{ animation: "fadeUp 0.4s ease both" }}
    >
      <div className="w-16 h-16 rounded-lg bg-surface-soft flex items-center justify-center">
        {icon ?? DefaultIcon}
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-[24px] font-semibold text-ink tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-[14px] text-ink/45 max-w-[280px]">{description}</p>
        )}
      </div>

      <div className="inline-flex items-center gap-2 border border-hairline rounded-pill px-4 py-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <span className="caption-mono text-ink/60">Em breve</span>
      </div>
    </section>
  );
}
