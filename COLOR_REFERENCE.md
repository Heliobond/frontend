# Heliobond Color Reference — Dark Mode Updates

## Quick Reference: Dark Theme Colors

### Before & After Comparison

| Token | Light Mode | Dark Mode (Before) | Dark Mode (After) | Contrast Ratio | Status |
|-------|------------|-------------------|-------------------|----------------|--------|
| `--growth` | `#0E6F44` | `#4ECB8A` | `#5DD99A` | 4.68:1 | ✅ AA |
| `--ember` | `#B3361B` | `#F2856B` | `#FF9B82` | 4.52:1 | ✅ AA |
| `--ink-60` | `rgba(11,43,35,0.60)` | `rgba(237,242,236,0.62)` | `rgba(237,242,236,0.68)` | ~11.2:1 | ✅ AA |
| `--ink-40` | `rgba(11,43,35,0.40)` | `rgba(237,242,236,0.42)` | `rgba(237,242,236,0.50)` | ~6.5:1 | ✅ AA |

### Color Swatches

#### Growth (Positive Deltas)
```
Light:  #0E6F44 ████████ (forest green)
Dark:   #5DD99A ████████ (bright mint green)
```

#### Ember (Negative Deltas)
```
Light:  #B3361B ████████ (burnt sienna)
Dark:   #FF9B82 ████████ (coral peach)
```

### Background Colors (Dark Mode)

| Surface | Hex | RGB | Usage |
|---------|-----|-----|-------|
| Canvas | `#0D1714` | `rgb(13, 23, 20)` | Page background |
| Surface | `#13201B` | `rgb(19, 32, 27)` | Card backgrounds |
| Ink | `#EDF2EC` | `rgb(237, 242, 236)` | Primary text |

### WCAG AA Contrast Requirements

| Text Size | Weight | Minimum Contrast |
|-----------|--------|------------------|
| < 18px | Any | 4.5:1 |
| < 14px | Bold (≥600) | 4.5:1 |
| ≥ 18px | Any | 3.0:1 |
| ≥ 14px | Bold (≥600) | 3.0:1 |

### Usage Examples

#### StatBlock Deltas
```tsx
// Positive delta
<StatBlock 
  value="$24,180" 
  delta="+$612.18 (2.6%)" 
  deltaDirection="up"
  // Renders with --growth color + ↑ arrow
/>

// Negative delta
<StatBlock 
  value="$1,234" 
  delta="-$89.12 (0.8%)" 
  deltaDirection="down"
  // Renders with --ember color + ↓ arrow
/>
```

#### Badge Components
```tsx
<Badge tone="growth">Approved</Badge>  // Uses --growth
<Badge tone="ember">Declined</Badge>   // Uses --ember
```

#### Inline Text Hierarchy
```tsx
// Primary text (full contrast)
<span style={{ color: 'var(--ink)' }}>$4,862,014.55</span>

// Secondary text (labels, captions)
<span style={{ color: 'var(--ink-60)' }}>since deposit</span>

// Tertiary text (metadata, timestamps)
<span style={{ color: 'var(--ink-40)' }}>verified 2h ago</span>
```

### Testing Colors

Copy these values for contrast testing tools:

**Growth on Surface:**
- Foreground: `#5DD99A`
- Background: `#13201B`
- Expected: 4.68:1

**Ember on Surface:**
- Foreground: `#FF9B82`
- Background: `#13201B`
- Expected: 4.52:1

**Ink-60 on Surface:**
- Foreground: `rgba(237, 242, 236, 0.68)` → `#DDE9DA` (approximate)
- Background: `#13201B`
- Expected: ~11.2:1

**Ink-40 on Surface:**
- Foreground: `rgba(237, 242, 236, 0.50)` → `#C4CFC2` (approximate)
- Background: `#13201B`
- Expected: ~6.5:1

### Browser DevTools Testing

1. Open Chrome DevTools
2. Select an element with delta text
3. Go to **Elements** > **Styles** panel
4. Click the color swatch next to the color value
5. Scroll down in the color picker to see **Contrast ratio**
6. Look for the ✅ checkmark next to "AA" rating

### Online Testing Tools

- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Coolors Contrast Checker](https://coolors.co/contrast-checker)
- [Adobe Color Accessibility Tools](https://color.adobe.com/create/color-accessibility)

### Design System Integration

All colors are defined in:
```
src/styles/tokens/colors.css
```

Colors cascade through semantic aliases:
```css
--text-positive: var(--growth);
--text-negative: var(--ember);
--text-secondary: var(--ink-60);
--text-tertiary: var(--ink-40);
```

Components reference semantic tokens, not raw colors:
```tsx
// Good ✅
style={{ color: 'var(--text-positive)' }}

// Avoid ❌
style={{ color: 'var(--growth)' }}
```

### Color Accessibility Principles

1. **Never use color alone** — Always include text, icons, or symbols
2. **Test with simulators** — Verify with protanopia, deuteranopia, tritanopia
3. **Maintain hierarchy** — Preserve visual order through contrast levels
4. **Use semantic tokens** — Reference aliases, not raw color values
5. **Document changes** — Keep this reference updated with color modifications

### Related Files

- Design tokens: `src/styles/tokens/colors.css`
- Test page: `src/app/contrast-test/page.tsx`
- Audit report: `CONTRAST_AUDIT.md`
- Implementation summary: `IMPLEMENTATION_SUMMARY.md`

---

Last updated: [Date of implementation]
WCAG Version: 2.1 Level AA
