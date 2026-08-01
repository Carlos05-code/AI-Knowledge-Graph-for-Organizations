# Design System

Flutter (Material 3) design tokens for the **AI Knowledge Graph** frontend. Implemented in
`frontend/lib/core/theme/app_theme.dart` and `frontend/lib/core/widgets/app_shell.dart`.

## 1. Color palette

| Token | Light | Dark |
|---|---|---|
| Primary (seed) | `0xFF2563EB` (blue 600) | `0xFF3B82F6` (blue 500) |
| Scaffold background | Material surface (from seed) | `0xFF13131F` |
| AppBar / Card surface | surface (light) | `0xFF1E1E2E` |
| Card border | `grey.shade200` | `grey.shade800` |
| Input fill | surface variant | `0xFF1E1E2E` |
| Divider | `grey.shade200` (1 px) | `grey.shade800` |

Semantic roles use Material defaults: `error` for failures, `onSurfaceVariant` for
secondary text, `primary` for actions.

## 2. Typography

- Material 3 type scale (headlineMedium for screen titles, bodyLarge for subtitles,
  bodyMedium for secondary text).
- Headings bold (`fontWeight: FontWeight.bold`) for screen titles.
- No custom fonts yet — system stack; add `GoogleFonts` only if brand requires.

## 3. Spacing

- Screen padding: 32 (auth screens), page content default 16–24.
- Form field gaps: 16; section gaps: 24–48.
- Card internal padding: 12–16.

## 4. Components

| Component | Spec |
|---|---|
| Buttons | `FilledButton` (primary), padding h24/v14, radius 12; loading = 20 px spinner |
| Text fields | filled, `OutlineInputBorder` radius 12, padding h16/v14, prefix icons |
| Cards | elevation 0, radius 12, 1 px border |
| Navigation | `NavigationRail`, `labelType: all`, selected + unselected icon variants |
| Chips | `FilterChip` (search modes) |
| Lists | chat messages: role-based alignment + color; results: leading icon by type |

## 5. Icons

Material Icons only (`cupertino_icons` for iOS fallback). Category mapping for search
results: person → `Icons.person`, document → `Icons.description`, meeting →
`Icons.meeting_room`, project → `Icons.folder`, technology → `Icons.code`.

## 6. Animations

- Material motion defaults (page transitions, ink ripples).
- Loading states: `CircularProgressIndicator` (strokeWidth 2, 20–24 px) in buttons;
  typing indicator in chat.
- No custom animation controllers; keep any future motion ≤ 200 ms and honor
  `disableAnimations`.

## 7. Responsive behavior

- Desktop/web: NavigationRail + content; auth forms constrained to 400 px.
- Mobile: forms full-width; bottom navigation planned for narrow screens.
- Chat/search layouts fluid within the shell's expanded area.

## 8. Accessibility

- Material contrast defaults; error messages in `colorScheme.error` with icons/prefixes.
- Form validators provide actionable messages ("Enter a valid email", "Minimum 8 characters").
- Planned: `Semantics` labels on icons-only controls, focus traversal tests.

## 9. Interaction patterns

- Auth success → auto-redirect (`/`), errors shown inline above the form.
- Chat: optimistic user bubble, assistant error bubble (`isError`).
- Search: mode chips persist query; results show `Score x.x` provenance chips.
- Empty states: chat shows prompt ("Ask anything about your organization"); placeholders
  show icon + "Coming soon".
