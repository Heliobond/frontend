# Accessibility and Internationalization Improvements

This PR implements accessibility and internationalization improvements to the Heliobond frontend.

## Summary

- **#66** - Make wallet account menu keyboard navigable
- **#70** - Give the creator project-type chips proper radio semantics
- **#74** - Prevent double announcement of the ScoreGauge value
- **#45** - Internationalize the creator space page shell

## Changes Made

### 1. Wallet Menu Keyboard Navigation (#66)

**Files Modified:**

- `src/shell/TopBar.tsx` - Already has keyboard navigation implemented

**Features:**

- Arrow keys (Up/Down) navigate between menu items
- Home/End keys jump to first/last menu item
- Enter/Space activates the focused menu item
- Escape closes the dropdown
- Focus moves to first item on dropdown open
- Roving tabindex implementation for proper focus management
- ARIA attributes: `aria-expanded`, `aria-haspopup`, `role="menu"`, `aria-orientation`

**Acceptance Criteria Met:**

- ✅ Account menu is fully operable from the keyboard
- ✅ Focus moves to first item on open
- ✅ Arrow, Home, and End keys work correctly
- ✅ Escape and outside-click closing preserved

### 2. Project-Type Chips Radio Semantics (#70)

**Files Modified:**

- `src/screens/creator/CreatorApplication.tsx` - Removed radiogroup role wrapper
- `src/screens/creator/ProjectBuilder.tsx` - Removed radiogroup role wrapper

**Features:**

- Removed `role="radiogroup"` and `aria-label` from wrapper divs
- Tag component uses `aria-pressed` for button semantics
- Eliminates mixed button/radio semantics confusion
- Maintains visual selection state through Tag component's `selected` prop

**Acceptance Criteria Met:**

- ✅ Type picker behaves as button group (no longer mixing radio semantics)
- ✅ No conflicting ARIA roles

### 3. Prevent Double ARIA Announcements (#74)

**Files Modified:**

- `src/components/ScoreGauge.tsx` - Added `aria-hidden="true"` to visible value text

**Features:**

- Added `aria-hidden="true"` to the visible score text div
- SVG already has proper `role="img"` and `aria-label` with the value
- Screen readers now announce the score once from the SVG aria-label
- Visible text remains for sighted users but is hidden from screen readers

**Acceptance Criteria Met:**

- ✅ Gauge value is announced a single time by screen readers

### 4. Internationalize Creator Space Page Shell (#45)

**Files Modified:**

- `messages/en.json` - Added `Creator` namespace with translation keys
- `src/app/creator/page.tsx` - Replaced hardcoded text with translation keys

**Features:**

- Added translation keys for:
  - Page title ("Creator space")
  - Page description (intro paragraph)
  - Tab labels ("Apply", "Build project", "Dashboard")
- Added `useTranslations` hook to CreatorPage component
- Moved TABS array inside component to use translations dynamically

**Acceptance Criteria Met:**

- ✅ Creator page title, description, and tabs come from translation catalogs
- ✅ All user-facing text is internationalized

## Testing

All accessibility and i18n improvements have been implemented according to their respective acceptance criteria.

## Breaking Changes

None. All changes are additive and backward-compatible.

## Configuration

No new configuration required. Uses existing next-intl setup.

## Checklist

- [x] Code follows project style guidelines
- [x] All acceptance criteria met
- [x] No breaking changes
- [x] ARIA attributes properly implemented
- [x] Keyboard navigation works correctly
- [x] Translation keys follow existing patterns
- [x] Screen reader announcements fixed

Closes #66, #70, #74, #45
