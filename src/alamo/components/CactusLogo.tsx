// ==========================================================
// FILE: src/alamo/components/CactusLogo.tsx
// PURPOSE: Shared Cactus logo component. Used in Sidebar
// and Login page. Single source of truth for the brand mark.
// WHY width/auto: Logo SVG is landscape (923x475) — setting
// equal width+height creates letterbox whitespace. Width-only
// lets the SVG scale naturally to its correct proportions.
// ==========================================================

export function CactusLogo({ width = 140 }: { width?: number }) {
    return (
      <img
        src="/cactus-logo.svg"
        alt="Cactus"
        width={width}
        style={{
          display: 'block',
          height: 'auto',
          objectFit: 'contain',
        }}
      />
    )
  }