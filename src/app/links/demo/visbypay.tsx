// The VisbyPay button from public/sdk/v1/button.js, drawn as live CSS so it stays sharp at any size and keeps
// transparent corners in dark mode. Sizes use container units: put it inside a box with container-type: size.
export function VisbyPayButton() {
  return (
    <div
      aria-hidden
      style={{
        width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15cqh',
        background: 'linear-gradient(95deg, #3FD0BA 0%, #86A9F0 50%, #CF6FE0 100%)',
        boxShadow: '0 2px 12px rgba(120,110,160,.30), 0 1px 2px rgba(16,18,21,.12)',
        fontFamily: "'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontStyle: 'italic', fontWeight: 600, fontSize: '34cqh', letterSpacing: '-.01em', lineHeight: 1, color: '#33303D',
      }}
    >
      <img src="/visby-logo-mark.png" alt="" style={{ height: '43cqh', width: 'auto', display: 'block', filter: 'brightness(0)', opacity: 0.92, marginLeft: '-11cqh' }} />
      <span style={{ whiteSpace: 'nowrap' }}>VisbyPay</span>
    </div>
  );
}

export type PillBox = { left: number; top: number; width: number; height: number };

// Places the button over a screenshot at percentage coordinates.
export function VisbyPayOverlay({ box }: { box: PillBox }) {
  return (
    <div style={{ position: 'absolute', left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%`, containerType: 'size' }}>
      <VisbyPayButton />
    </div>
  );
}
