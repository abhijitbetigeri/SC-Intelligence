// komodos-ui → Persona theme bridge.
//
// Persona renders inside a Shadow DOM, so `index.css` and the komodos-chat-ui `.aichat` rules
// cannot reach it. Everything the skin says has to be restated as Persona design tokens.
//
// What translates cleanly: the three-theme palette, Figtree, the pill composer, the circular
// send, the asymmetric bubble radii, the two-layer soft shadow, one accent + red for risk only.
// What does NOT: komodos-chat-ui's entrance animation and 3-dot typing bounce — Persona ships
// its own motion and does not expose those as tokens. Calm and close, not byte-identical.
//
// Values are copied from the skill's palette.css (light / white / dark blocks) and chat.css.
// If the accent is ever rebranded, change it in all three blocks here AND in index.css.

const SHADOW = {
  warm: '0 1px 2px rgba(58,50,28,.05), 0 6px 22px rgba(58,50,28,.05)',
  warmPop: '0 2px 6px rgba(58,50,28,.08), 0 16px 44px rgba(58,50,28,.12)',
  neutral: '0 1px 2px rgba(15,15,10,.05), 0 6px 22px rgba(15,15,10,.06)',
  neutralPop: '0 2px 6px rgba(15,15,10,.09), 0 16px 44px rgba(15,15,10,.13)',
  dark: '0 1px 2px rgba(0,0,0,.25), 0 6px 22px rgba(0,0,0,.22)',
  darkPop: '0 2px 6px rgba(0,0,0,.3), 0 16px 44px rgba(0,0,0,.4)',
};

// One entry per komodos theme. `accentHover` darkens in the light themes and brightens in
// dark, matching how --accent behaves against each canvas.
export const KOMODOS = {
  light: {
    bg: '#F7F5F0', card: '#FFFFFF', raised: '#F0EDE5', border: '#EAE6DC', bv: '#DAD4C7',
    muted: '#8A8474', ink: '#26241D', display: '#171510',
    accent: '#1E6F47', accentHover: '#185839', accentSoft: '#E3F0E7', red: '#C4453C',
    shadow: SHADOW.warm, shadowPop: SHADOW.warmPop, scheme: 'light',
  },
  white: {
    bg: '#FFFFFF', card: '#FFFFFF', raised: '#F4F4F1', border: '#ECECE8', bv: '#DBDBD5',
    muted: '#84847B', ink: '#232320', display: '#101010',
    accent: '#1E6F47', accentHover: '#185839', accentSoft: '#E6F2EA', red: '#C4453C',
    shadow: SHADOW.neutral, shadowPop: SHADOW.neutralPop, scheme: 'light',
  },
  dark: {
    bg: '#161510', card: '#1F1D17', raised: '#27251E', border: '#2D2A22', bv: '#3C382D',
    muted: '#9D9689', ink: '#E9E5DB', display: '#F7F4EB',
    accent: '#4FB57F', accentHover: '#6BC494', accentSoft: '#20362A', red: '#E06A5F',
    shadow: SHADOW.dark, shadowPop: SHADOW.darkPop, scheme: 'dark',
  },
};

const SANS = '"Figtree", system-ui, -apple-system, sans-serif';
const MONO = 'ui-monospace, Menlo, monospace';

// Persona resolves semantic tokens from the palette, so the gray scale has to carry komodos'
// neutrals. Component tokens then override the handful of surfaces where komodos distinguishes
// card from canvas (a distinction a single gray ramp cannot express).
export function personaTheme(name) {
  const k = KOMODOS[name] || KOMODOS.light;
  return {
    palette: {
      colors: {
        primary: { 500: k.accent, 600: k.accentHover, 700: k.accentHover },
        // 50 is the panel surface (semantic.surface/background resolve here), so it is `card`,
        // not `bg` — the drawer is a floating card, not the page canvas.
        gray: {
          50: k.card, 100: k.raised, 200: k.border, 300: k.bv,
          500: k.muted, 700: k.ink, 900: k.ink, 950: k.display,
        },
        error: { 500: k.red, 600: k.red },
        success: { 500: k.accent, 600: k.accentHover },
      },
      // Radius fields on component tokens are typed as token *references*, so a raw CSS string
      // is dropped on the floor (colours accept raw values; radii do not). Persona supports
      // custom keys on this scale, so the komodos geometry is registered here and referenced
      // below — that is the only way the asymmetric bubbles and the pill composer survive.
      radius: {
        sm: '9px', md: '12px', lg: '16px', xl: '18px', '2xl': '20px', full: '9999px',
        pill: '999px',
        bubbleUser: '16px 16px 4px 16px', // tail on the sender's side
        bubbleAi: '16px 16px 16px 4px',
      },
      typography: { fontFamily: { sans: SANS, mono: MONO } },
    },
    semantic: {
      colors: {
        surface: 'palette.colors.gray.50',
        background: 'palette.colors.gray.50',
        // The transcript canvas resolves from `container`. komodos runs the log on card white so
        // the raised user bubble reads as raised — pointing this at gray.100 makes the canvas and
        // the user bubble the same cream, and the bubble disappears.
        container: 'palette.colors.gray.50',
        text: 'palette.colors.gray.900',
        textMuted: 'palette.colors.gray.500',
        border: 'palette.colors.gray.200',
        divider: 'palette.colors.gray.200',
      },
    },
    components: {
      // Persona's panel defaults are sized for a floating launcher (440×600 with an inset).
      // Mounted inside our own drawer it must simply fill it, or the transcript stops ~600px
      // down and the composer floats mid-drawer.
      panel: {
        background: k.card,
        width: '100%', maxWidth: 'none',
        height: '100%', maxHeight: '100%',
        inset: '0px', borderRadius: '0px', shadow: 'none',
        canvasBackground: k.card,
      },
      header: {
        background: k.card,
        borderBottom: `1px solid ${k.border}`,
        titleForeground: k.display,
        subtitleForeground: k.muted,
        iconBackground: k.accentSoft,
        iconForeground: k.accent,
        actionIconForeground: k.muted,
        shadow: 'none',
      },
      // The komodos-chat-ui bubble geometry: the tail corner (4px) sits on the sender's side.
      message: {
        user: { background: k.raised, text: k.ink, borderRadius: 'palette.radius.bubbleUser', shadow: 'none' },
        assistant: { background: k.card, text: k.ink, borderRadius: 'palette.radius.bubbleAi', border: k.border, shadow: k.shadow },
      },
      // Pill composer, soft-halo focus — never a hard outline.
      input: {
        background: k.card,
        text: k.ink,
        placeholder: k.muted,
        border: k.border,
        borderRadius: 'palette.radius.pill',
        padding: '5px 5px 5px 16px',
        shadow: k.shadow,
        focus: { border: k.accent, ring: k.accentSoft },
      },
      composer: { shadow: 'none' },
      button: {
        primary: { background: k.display, foreground: k.bg, borderRadius: 'palette.radius.pill' },
        secondary: { background: k.raised, foreground: k.ink, borderRadius: 'palette.radius.pill' },
        ghost: { background: 'transparent', foreground: k.muted, borderRadius: 'palette.radius.pill' },
      },
      launcher: { size: '52px', iconSize: '20px', borderRadius: 'palette.radius.full', background: k.display, foreground: k.bg, shadow: k.shadowPop },
      markdown: {
        inlineCode: { background: k.raised, foreground: k.ink },
        link: { foreground: k.accent },
        prose: { fontFamily: SANS },
      },
      code: { background: k.raised, foreground: k.ink, border: k.border },
      // Tool-call and reasoning chrome share `collapsibleWidget`; keep them quiet so an
      // expanded trace never competes with the answer.
      collapsibleWidget: { background: k.raised, border: k.border, foreground: k.muted, borderRadius: 'palette.radius.md' },
      toolBubble: { shadow: 'none' },
      reasoningBubble: { shadow: 'none' },
      scrollToBottom: { background: k.card, foreground: k.ink, border: k.border, shadow: k.shadow },
    },
  };
}
