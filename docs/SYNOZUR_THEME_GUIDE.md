# Synozur Theme Integration Guide

This guide explains how to use the Synozur brand theme modules across any Synozur application (Constellation, Vega, Nebula, Orion, etc.).

## Available Themes

| Theme | File | Description |
|-------|------|-------------|
| **Baseline** | `baseline.css` | Direction 0 — the original pre-brand state. Use to revert all brand changes. |
| **Night Sky** | `night-sky.css` | Direction 1 — dark-first, deep purple-tinted surfaces, brand gradient as illumination. Premium observatory dashboard feel. |
| **Navigator's Chart** | `navigators-chart.css` | Direction 2 — clean professional precision, purple as the single deliberate accent. Linear/Notion/Stripe aesthetic. |
| **Aurora** | `aurora.css` | Direction 3 — gradient as a living presence, lavender-cast surfaces, gradient border utilities. Energetic and marketing-forward. |

## Switching Constellation's Active Theme

Constellation uses a single theme import in `client/src/index.css`. To switch themes, change the import line:

```css
/* In client/src/index.css, change this line: */
@import './themes/aurora.css';

/* To one of these: */
@import './themes/night-sky.css';
@import './themes/navigators-chart.css';
@import './themes/baseline.css';
```

Only one theme should be imported at a time. The import must appear **after** the `@tailwind` directives and **before** the `@layer base` block.

## Adopting a Theme in Another Synozur App

### Step 1: Copy the theme file

Copy the desired theme CSS file from `client/src/themes/` into your project. For example:

```
cp client/src/themes/aurora.css /path/to/your-app/src/themes/aurora.css
```

### Step 2: Import the theme

Add the import to your app's main CSS file (e.g., `index.css`, `globals.css`, or `App.css`):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import './themes/aurora.css';

/* Your app's @layer base, custom utilities, etc. */
```

### Step 3: Configure Tailwind

Ensure your `tailwind.config.ts` maps CSS variables to Tailwind color utilities. The required configuration looks like:

```ts
export default {
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
};
```

### Step 4: Add dark mode support

Add a `ThemeProvider` component that toggles the `dark` class on `<html>`:

```tsx
function ThemeProvider({ children, defaultTheme = "light" }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || defaultTheme;
  });

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

## CSS Variables Reference

Every theme sets the same set of CSS custom properties. These are consumed by Tailwind utilities via the config above.

### Surface & Text Variables
| Variable | Purpose |
|----------|---------|
| `--background` | Page background |
| `--foreground` | Default text color |
| `--card` | Card/panel background |
| `--card-foreground` | Card text color |
| `--popover` | Popover/dropdown background |
| `--popover-foreground` | Popover text color |

### Brand Color Variables
| Variable | Purpose |
|----------|---------|
| `--primary` | Primary brand color (Synozur purple) |
| `--primary-foreground` | Text on primary backgrounds |
| `--secondary` | Secondary brand color (Synozur magenta) |
| `--secondary-foreground` | Text on secondary backgrounds |

### UI State Variables
| Variable | Purpose |
|----------|---------|
| `--muted` | Muted/subtle background |
| `--muted-foreground` | Muted text color |
| `--accent` | Accent background for highlights |
| `--accent-foreground` | Accent text color |
| `--destructive` | Destructive/error color |
| `--destructive-foreground` | Text on destructive backgrounds |

### Border & Input Variables
| Variable | Purpose |
|----------|---------|
| `--border` | Default border color |
| `--input` | Input field background |
| `--ring` | Focus ring color |

### Chart Variables
| Variable | Purpose |
|----------|---------|
| `--chart-1` through `--chart-5` | Data visualization palette |

### Sidebar Variables
| Variable | Purpose |
|----------|---------|
| `--sidebar` | Sidebar background |
| `--sidebar-foreground` | Sidebar text |
| `--sidebar-primary` | Sidebar active item color |
| `--sidebar-primary-foreground` | Text on sidebar active items |
| `--sidebar-accent` | Sidebar hover/accent background |
| `--sidebar-accent-foreground` | Sidebar accent text |
| `--sidebar-border` | Sidebar border color |
| `--sidebar-ring` | Sidebar focus ring |

### Typography & Layout Variables
| Variable | Purpose |
|----------|---------|
| `--font-sans` | Sans-serif font stack (Avenir Next LT Pro) |
| `--font-serif` | Serif font stack |
| `--font-mono` | Monospace font stack |
| `--radius` | Border radius base value |
| `--spacing` | Base spacing unit |
| `--shadow-*` | Shadow elevation scale (2xs through 2xl) |

## Reverting to Baseline

To undo all brand changes and return to the original state:

```css
@import './themes/baseline.css';
```

This restores the exact CSS variable values from before any brand direction was applied.

## Layering a Synozur Theme with App-Specific Overrides

If your app needs custom variables on top of a Synozur theme, import order matters. The theme sets the defaults; your overrides come second:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Theme first — sets all Synozur brand defaults */
@import './themes/aurora.css';

/* App overrides second — these take precedence */
:root {
  --radius: 0.75rem;          /* tighter border radius for this app */
  --sidebar: hsl(268 25% 98%); /* slightly different sidebar background */
}

.dark {
  --sidebar: hsl(268 25% 4%);
}
```

The CSS cascade ensures your app-specific values override the theme defaults while keeping all other Synozur brand variables intact.

## Aurora-Only Utility Classes

The Aurora theme includes two additional CSS utility classes not present in other themes:

- **`.sidebar-item-active-gradient`** — Adds a 3px vertical gradient bar (purple → magenta) on the left edge of the element. Apply to active sidebar items.
- **`.page-header-gradient-bar`** — Adds a 2px horizontal gradient border along the top edge. Apply to page header sections.

These classes reference `--primary` and `--secondary` variables, so they adapt to light/dark mode automatically. They are defined in `aurora.css` only. If you switch to a different theme, these classes will not be available unless you copy them into your CSS.

## Shared Gradient Utilities

The following utilities are defined in `index.css` (not in theme files) and work with any active theme:

```css
.synozur-gradient {
  background: linear-gradient(135deg, var(--primary), var(--secondary));
}

.synozur-gradient-text {
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

These use `--primary` and `--secondary` from whatever theme is active, so the gradient always reflects the current brand colors.
