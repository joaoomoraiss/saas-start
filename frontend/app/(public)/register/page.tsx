'use client'

import CardRegister from "@/components/cardRegister";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center px-4 relative overflow-hidden">
      {/* Dot grid background — same as landing page Hero */}
      <div
        className="absolute inset-0 pointer-events-none opacity-100"
        style={{
          backgroundImage: "radial-gradient(circle, #e2e2e2 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />
      {/* Radial fade over dots */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 50% 50%, transparent 30%, #fff 80%)",
        }}
      />

      {/* Card */}
      <div
        className="relative z-10 w-full flex justify-center"
        style={{ animation: "fadeUp 0.45s ease both" }}
      >
        <CardRegister />
      </div>

      <style jsx global>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}