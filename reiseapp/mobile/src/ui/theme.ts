/**
 * Design tokens.
 *
 * Screens must not invent colours, sizes or gaps. Everything they need comes
 * from here, so a change to the palette or the type scale lands everywhere at
 * once instead of in twelve slightly different places.
 *
 * The palette is built around a pine green: the same colour the route is drawn
 * in, on the map and in the printed book. Warm neutrals keep photographs — the
 * actual content of this app — from being framed by cold grey.
 */

const palette = {
  ground: '#f4f6f3',
  surface: '#ffffff',
  surfaceSunk: '#eaede9',

  border: '#dde2dc',
  borderStrong: '#c3cbc2',

  ink: '#14201a',
  inkMuted: '#4a5852',
  inkSoft: '#6e7b75',
  inkInverted: '#ffffff',

  brand: '#1f6b46',
  brandPressed: '#175537',
  brandSoft: '#e2efe7',

  /** Recording is the one state that has to be readable from across a room. */
  recording: '#c2571f',
  recordingSoft: '#fbeadf',

  danger: '#a4342b',
  dangerSoft: '#fbeceb',
  warning: '#8f560a',
  warningSoft: '#f7ecd9',
} as const;

/** 4-based scale. Named steps for layout, the function for one-off nudges. */
const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * One scale, used everywhere. Line heights are baked in because leaving them to
 * the platform is what makes a screen look almost right but not quite.
 */
const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 26, lineHeight: 31, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.2 },
  subheading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.8 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  /** Figures that sit in columns have to line up, hence the tabular variant. */
  stat: { fontSize: 24, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4 },
} as const;

const shadow = {
  card: {
    shadowColor: '#14201a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#14201a',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

export const theme = {
  colors: {
    ...palette,
    // Names the screens already use; kept so the palette can grow without a
    // rename sweep through every file.
    background: palette.ground,
    text: palette.ink,
    muted: palette.inkSoft,
    accent: palette.brand,
  },
  space,
  radius: radius.md,
  radii: radius,
  type,
  shadow,
  spacing: (n: number) => n * 8,
} as const;

export type Theme = typeof theme;
