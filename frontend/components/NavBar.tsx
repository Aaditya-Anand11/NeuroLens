"use client";

import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/history", label: "History" },
  { href: "/calibration", label: "Calibrate" },
  { href: "/privacy", label: "Privacy" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b backdrop-blur-xl" style={{ borderColor: 'var(--border-subtle)', background: 'rgba(6,7,10,0.8)' }}>
      <div className="max-w-[1400px] mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
        {/* Logo */}
        <a href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="relative w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden">
            <div
              className="absolute inset-0 transition-opacity group-hover:opacity-100 opacity-90"
              style={{ background: 'linear-gradient(135deg, var(--accent-green), var(--accent-blue))' }}
            />
            <svg className="relative w-3.5 h-3.5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="font-bold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>
            NeuroLens
          </span>
        </a>

        {/* Nav links */}
        <div className="flex items-center gap-0.5">
          {NAV_ITEMS.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <a
                key={href}
                href={href}
                className="relative px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200"
                style={{
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.target as HTMLElement).style.color = 'var(--text-secondary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.target as HTMLElement).style.color = 'var(--text-muted)';
                  }
                }}
              >
                {label}
                {isActive && (
                  <div
                    className="absolute -bottom-[9px] left-2 right-2 h-[2px] rounded-full"
                    style={{ background: 'var(--accent-green)' }}
                  />
                )}
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
