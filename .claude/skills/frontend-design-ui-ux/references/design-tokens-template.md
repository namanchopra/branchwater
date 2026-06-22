# Design Tokens Template

Use this template when defining a design token system for a project or feature.

---

## Design Tokens: [Project/Feature Name]

### Overview

**Purpose:** [Brief description of the design system context]

**Theme Support:** [Light only / Light + Dark / Multiple themes]

**CSS Strategy:** [Tailwind config / CSS variables / Both]

---

### Colors

#### Brand Colors

```typescript
const brandColors = {
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',  // Default
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49',
  },
  secondary: {
    // ... full scale
  },
  accent: {
    // ... full scale
  },
}
```

#### Semantic Colors

```typescript
const semanticColors = {
  // Backgrounds
  background: {
    default: 'white',        // Main page background
    muted: 'gray.50',        // Subtle sections
    subtle: 'gray.100',      // Cards, panels
    inverse: 'gray.900',     // Dark sections
  },

  // Foregrounds (text)
  foreground: {
    default: 'gray.900',     // Primary text
    muted: 'gray.600',       // Secondary text
    subtle: 'gray.400',      // Placeholder, hints
    inverse: 'white',        // Text on dark backgrounds
  },

  // Borders
  border: {
    default: 'gray.200',     // Standard borders
    muted: 'gray.100',       // Subtle borders
    focus: 'primary.500',    // Focus rings
  },

  // Status colors
  success: {
    default: '#22c55e',
    foreground: '#ffffff',
    background: '#f0fdf4',
    border: '#86efac',
  },
  warning: {
    default: '#f59e0b',
    foreground: '#ffffff',
    background: '#fffbeb',
    border: '#fcd34d',
  },
  error: {
    default: '#ef4444',
    foreground: '#ffffff',
    background: '#fef2f2',
    border: '#fca5a5',
  },
  info: {
    default: '#3b82f6',
    foreground: '#ffffff',
    background: '#eff6ff',
    border: '#93c5fd',
  },
}
```

#### Dark Mode Overrides

```typescript
const darkModeColors = {
  background: {
    default: 'gray.950',
    muted: 'gray.900',
    subtle: 'gray.800',
    inverse: 'white',
  },
  foreground: {
    default: 'gray.50',
    muted: 'gray.400',
    subtle: 'gray.500',
    inverse: 'gray.900',
  },
  border: {
    default: 'gray.800',
    muted: 'gray.700',
    focus: 'primary.400',
  },
}
```

---

### Typography

#### Font Families

```typescript
const fontFamily = {
  sans: [
    'Inter',
    'ui-sans-serif',
    'system-ui',
    '-apple-system',
    'sans-serif',
  ],
  mono: [
    'JetBrains Mono',
    'ui-monospace',
    'SFMono-Regular',
    'monospace',
  ],
  // Optional: serif for marketing/editorial
  serif: [
    'Georgia',
    'ui-serif',
    'serif',
  ],
}
```

#### Font Sizes

```typescript
const fontSize = {
  xs: ['0.75rem', { lineHeight: '1rem' }],      // 12px
  sm: ['0.875rem', { lineHeight: '1.25rem' }],  // 14px
  base: ['1rem', { lineHeight: '1.5rem' }],     // 16px
  lg: ['1.125rem', { lineHeight: '1.75rem' }],  // 18px
  xl: ['1.25rem', { lineHeight: '1.75rem' }],   // 20px
  '2xl': ['1.5rem', { lineHeight: '2rem' }],    // 24px
  '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30px
  '4xl': ['2.25rem', { lineHeight: '2.5rem' }], // 36px
  '5xl': ['3rem', { lineHeight: '1' }],         // 48px
  '6xl': ['3.75rem', { lineHeight: '1' }],      // 60px
}
```

#### Font Weights

```typescript
const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
}
```

#### Line Heights

```typescript
const lineHeight = {
  none: '1',
  tight: '1.25',
  snug: '1.375',
  normal: '1.5',
  relaxed: '1.625',
  loose: '2',
}
```

#### Letter Spacing

```typescript
const letterSpacing = {
  tighter: '-0.05em',
  tight: '-0.025em',
  normal: '0',
  wide: '0.025em',
  wider: '0.05em',
  widest: '0.1em',
}
```

---

### Spacing

```typescript
const spacing = {
  px: '1px',
  0: '0',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  11: '2.75rem',    // 44px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
  28: '7rem',       // 112px
  32: '8rem',       // 128px
  36: '9rem',       // 144px
  40: '10rem',      // 160px
  44: '11rem',      // 176px
  48: '12rem',      // 192px
  52: '13rem',      // 208px
  56: '14rem',      // 224px
  60: '15rem',      // 240px
  64: '16rem',      // 256px
  72: '18rem',      // 288px
  80: '20rem',      // 320px
  96: '24rem',      // 384px
}
```

---

### Border Radius

```typescript
const borderRadius = {
  none: '0',
  sm: '0.125rem',   // 2px
  DEFAULT: '0.25rem', // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  '3xl': '1.5rem',  // 24px
  full: '9999px',
}
```

---

### Shadows

```typescript
const boxShadow = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  none: 'none',
}
```

---

### Z-Index Layers

```typescript
const zIndex = {
  auto: 'auto',
  0: '0',
  10: '10',        // Base elevated elements
  20: '20',        // Dropdowns
  30: '30',        // Sticky headers
  40: '40',        // Fixed elements
  50: '50',        // Modals/dialogs
  60: '60',        // Popovers/tooltips
  70: '70',        // Toast notifications
  80: '80',        // Skip links (a11y)
  90: '90',        // Dev tools overlay
  100: '100',      // Maximum (emergency)
}
```

#### Named Layers

```typescript
const layers = {
  base: 0,
  dropdown: 20,
  sticky: 30,
  fixed: 40,
  modalBackdrop: 45,
  modal: 50,
  popover: 60,
  tooltip: 60,
  toast: 70,
  skipLink: 80,
}
```

---

### Breakpoints

```typescript
const screens = {
  sm: '640px',   // Mobile landscape / small tablet
  md: '768px',   // Tablet portrait
  lg: '1024px',  // Tablet landscape / small desktop
  xl: '1280px',  // Desktop
  '2xl': '1536px', // Large desktop
}
```

#### Container Widths

```typescript
const container = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1400px', // Slightly narrower for readability
}
```

---

### Animations

#### Durations

```typescript
const transitionDuration = {
  0: '0ms',
  75: '75ms',
  100: '100ms',
  150: '150ms',    // Fast interactions (hover, focus)
  200: '200ms',
  300: '300ms',    // Standard transitions
  500: '500ms',    // Emphasis/attention
  700: '700ms',
  1000: '1000ms',  // Slow/dramatic
}
```

#### Timing Functions

```typescript
const transitionTimingFunction = {
  DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',  // ease-in-out
  linear: 'linear',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  out: 'cubic-bezier(0, 0, 0.2, 1)',
  'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
  bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
}
```

#### Keyframe Animations

```typescript
const keyframes = {
  fadeIn: {
    '0%': { opacity: '0' },
    '100%': { opacity: '1' },
  },
  fadeOut: {
    '0%': { opacity: '1' },
    '100%': { opacity: '0' },
  },
  slideInFromTop: {
    '0%': { transform: 'translateY(-100%)' },
    '100%': { transform: 'translateY(0)' },
  },
  slideInFromBottom: {
    '0%': { transform: 'translateY(100%)' },
    '100%': { transform: 'translateY(0)' },
  },
  spin: {
    '0%': { transform: 'rotate(0deg)' },
    '100%': { transform: 'rotate(360deg)' },
  },
  pulse: {
    '0%, 100%': { opacity: '1' },
    '50%': { opacity: '0.5' },
  },
  bounce: {
    '0%, 100%': { transform: 'translateY(-25%)', animationTimingFunction: 'cubic-bezier(0.8,0,1,1)' },
    '50%': { transform: 'none', animationTimingFunction: 'cubic-bezier(0,0,0.2,1)' },
  },
}
```

---

### CSS Variables Export

For projects using CSS variables alongside Tailwind:

```css
:root {
  /* Colors */
  --color-primary: theme('colors.primary.500');
  --color-background: theme('colors.white');
  --color-foreground: theme('colors.gray.900');

  /* Typography */
  --font-sans: theme('fontFamily.sans');
  --font-mono: theme('fontFamily.mono');

  /* Spacing */
  --spacing-unit: 0.25rem;

  /* Borders */
  --radius-default: theme('borderRadius.md');

  /* Shadows */
  --shadow-default: theme('boxShadow.DEFAULT');
}

.dark {
  --color-background: theme('colors.gray.950');
  --color-foreground: theme('colors.gray.50');
}
```

---

### Tailwind Config Integration

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paste brandColors and semanticColors here
      },
      fontFamily: {
        // Paste fontFamily here
      },
      // ... other tokens
    },
  },
  plugins: [],
}

export default config
```

---

### Implementation Notes

**For Engineering Agents:**
- Use semantic color names in components (e.g., `bg-background` not `bg-white`)
- Prefer Tailwind classes over inline styles
- Use CSS variables for dynamic theming
- Test all components in both light and dark modes

**Accessibility:**
- Ensure 4.5:1 contrast ratio for normal text
- Ensure 3:1 contrast ratio for large text and UI components
- Test with color blindness simulators
