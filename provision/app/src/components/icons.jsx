// Monochrome line icons (komodos-ui) — inline SVG that inherits currentColor, ~1.8 stroke,
// rounded caps/joins, so a single glyph stays theme-aware in all three themes.
// NEVER emoji: a colored glyph breaks the one-accent rule.
const S = ({ size = 16, children, fill = 'none', ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{children}</svg>
);

export const Menu = (p) => <S {...p}><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></S>;
export const X = (p) => <S {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></S>;
export const ChevronDown = (p) => <S {...p}><polyline points="6 9 12 15 18 9" /></S>;
export const ChevronRight = (p) => <S {...p}><polyline points="9 6 15 12 9 18" /></S>;
export const ArrowUp = (p) => <S {...p}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></S>;
export const Check = (p) => <S {...p}><polyline points="20 6 9 17 4 12" /></S>;
export const Alert = (p) => <S {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></S>;
export const CornerUpLeft = (p) => <S {...p}><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></S>;
export const Refresh = (p) => <S {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></S>;
export const Clock = (p) => <S {...p}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></S>;
export const Users = (p) => <S {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></S>;
export const Box = (p) => <S {...p}><path d="M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8Z" /><polyline points="3.3 7 12 12 20.7 7" /><line x1="12" y1="22" x2="12" y2="12" /></S>;
export const Truck = (p) => <S {...p}><path d="M14 16V5a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h1" /><path d="M14 8h4l3 3v5a1 1 0 0 1-1 1h-1" /><circle cx="6.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /><line x1="9" y1="17.5" x2="15" y2="17.5" /></S>;
export const Gauge = (p) => <S {...p}><path d="M12 14 15.5 9.5" /><path d="M20.5 17a9 9 0 1 0-17 0" /><circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" /></S>;
export const Sparkle = ({ size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M12 2.5c.5 4.4 2.6 6.5 7 7-4.4.5-6.5 2.6-7 7-.5-4.4-2.6-6.5-7-7 4.4-.5 6.5-2.6 7-7Z" />
  </svg>
);
export const Grid = (p) => <S {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></S>;
export const Shield = (p) => <S {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></S>;
