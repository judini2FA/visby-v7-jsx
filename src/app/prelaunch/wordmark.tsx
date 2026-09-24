export function PrelaunchWordmark() {
  return (
    <>
      <img src="/visby-logo.png" alt="" style={{ width: 80, height: 'auto', marginBottom: 12 }} />
      <svg width="120" height="36" viewBox="0 0 120 36" role="img" aria-label="Visby">
        <defs>
          <linearGradient id="plvg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#25CDB8" />
            <stop offset="50%" stopColor="#2A8AED" />
            <stop offset="100%" stopColor="#BC2DE6" />
          </linearGradient>
        </defs>
        <text x="60" y="30" textAnchor="middle" fontFamily="'Quicksand',sans-serif" fontSize="32" fontWeight="400" fill="url(#plvg)" letterSpacing="-1">Visby</text>
      </svg>
    </>
  );
}
