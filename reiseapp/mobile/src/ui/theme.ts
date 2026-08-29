export const theme = {
  colors: {
    background: '#f7f7f5',
    surface: '#ffffff',
    border: '#e2e2dd',
    text: '#1b1b19',
    muted: '#6b6b63',
    accent: '#2f6f4f',
    danger: '#a4342b',
  },
  spacing: (n: number) => n * 8,
  radius: 12,
} as const;
