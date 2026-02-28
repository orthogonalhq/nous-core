export const tokens = {
  colors: {
    background: 'hsl(var(--background))',
    foreground: 'hsl(var(--foreground))',
    border: 'hsl(var(--border))',
    muted: 'hsl(var(--muted))',
    mutedForeground: 'hsl(var(--muted-foreground))',
    primary: 'hsl(var(--primary))',
    primaryForeground: 'hsl(var(--primary-foreground))',
    // dark defaults (zinc palette)
    bgDefault: '#18181b',    // zinc-900
    fgDefault: '#e4e4e7',    // zinc-200
    fgMuted: '#71717a',      // zinc-500
    fgSubtle: '#a1a1aa',     // zinc-400
    borderDefault: '#3f3f46', // zinc-700
  },
} as const
