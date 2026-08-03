# Frontend Specification

## 1. Stack

- **Flutter 3.35.6** (stable) — Web + Android targets.
- **Riverpod 2** (`StateNotifierProvider` / `Provider`) — state management (no codegen yet).
- **GoRouter 14** — routing with auth redirects.
- **Dio 5** — HTTP; **flutter_secure_storage** — JWT storage; 401-refresh-retry interceptor.
- Targets: Android (`com.akg.ai_knowledge_graph`), Web.

## 2. Structure (feature-first)

```
lib/
├── main.dart                    # ProviderScope + MaterialApp.router (light+dark, ThemeMode.system)
├── core/
│   ├── api/                     # ApiClient, AuthInterceptor, services, providers
│   ├── routing/app_router.dart  # GoRouter config
│   ├── theme/app_theme.dart     # Material 3 light/dark
│   └── widgets/app_shell.dart   # NavigationRail shell
└── features/
    ├── auth/                    # login, register, AuthNotifier, AuthState
    ├── admin/                  # admin_screen (members list, role/status management)
    ├── settings/               # settings_screen (profile edit)
    ├── documents/              # documents_screen (list, upload, detail, process, delete)
    ├── chat/                   # chat_screen + chat_provider (state next to screen)
    ├── search/                 # search_screen + search_provider
    ├── graph/                  # graph_explorer_screen (CustomPaint)
    ├── home/                   # dashboard quick actions
    └── shell/                  # ShellPlaceholder ("Coming soon")
```

Remaining placeholder feature dirs (empty): `connectors/`, `meetings/`, `policies/`
— planned next.

## 3. Routing

| Route | Screen | Auth |
|---|---|---|
| `/login` | LoginScreen | public |
| `/register` | RegisterScreen | public |
| `/` | HomeScreen | JWT |
| `/chat` `/chat/:conversationId` | ChatScreen | JWT |
| `/search` | SearchScreen | JWT |
| `/documents` | DocumentsScreen (list, filter, upload, detail, process/delete) | JWT |
| `/graph` | GraphExplorerScreen | JWT |
| `/connectors` `/meetings` `/policies` | ShellPlaceholder | JWT |
| `/admin` | AdminScreen (members + RBAC; non-admin gets locked view) | JWT |
| `/settings` | SettingsScreen (profile edit) | JWT |

Redirect rule: unauthenticated → `/login` (unless on `/login|/register`); authenticated on
auth route → `/`.

## 4. State management

| Provider | Type | Purpose |
|---|---|---|
| `apiClientProvider` | Provider | Dio client (base `http://localhost:3000/api/v1`) |
| `authService/chatService/searchService/graphService/documentsService/usersService` providers | Provider | API wrappers |
| `appRouterProvider` | Provider | GoRouter (watches auth) |
| `authProvider` | StateNotifierProvider | `AuthInitial/Loading/Authenticated/Unauthenticated`; `checkAuth/login/register/logout` |
| `chatProvider` | StateNotifierProvider | messages, conversationId, sending/error; optimistic send |
| `searchProvider` | StateNotifierProvider | query, mode (hybrid default), results, loading |

Graph explorer intentionally uses local `setState` + `ref.read` (self-contained screen).

## 5. API layer

- `ApiClient`: Dio with 10 s connect / 30 s receive timeouts; tokens in
  `FlutterSecureStorage` (`access_token`, `refresh_token`).
- `AuthInterceptor`: attaches `Authorization: Bearer`; on **401** → `POST /auth/refresh`
  → stores new tokens → retries original request; refresh failure clears storage.
- Response unwrapping: tolerates `{ data: ... }` envelope and raw bodies; string bodies
  JSON-decoded.
- Services: `AuthService`, `ChatService`, `SearchService`, `GraphService`,
  `DocumentsService`, `UsersService` (hand-written Dio calls; retrofit unused).

## 6. Design system

See [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) for full tokens. Highlights:

- Material 3, seeded palettes: light `0xFF2563EB`, dark `0xFF3B82F6`.
- Dark mode: full support, `ThemeMode.system`.
- Cards: radius 12, elevation 0, subtle border; inputs: filled, radius 12.

## 7. Responsive & accessibility

- NavigationRail (labels always) — expands to BottomNavigation for mobile (planned).
- Forms use semantic validators; Material defaults provide contrast & focus rings.
- Full a11y pass (labels, semantics) tracked in ROADMAP.

## 8. Localization / dark mode / offline

- Localization: not yet (hardcoded EN) — intl dependency ready.
- Offline: not yet; `connectivity_plus` available; API errors surfaced in state.
- Caching: server-side Redis; client in-memory states only.

## 9. Animation guidelines

- Material motion defaults; no custom animation controllers yet.
- Use `flutter_animate` (dep) when adding micro-interactions; keep < 200 ms,
  respect `disableAnimations` accessibility setting.

## 10. Known gaps (documented, tracked)

- 3 placeholder routes ("Coming soon": connectors, meetings, policies).
- No typed models (`Map<String, dynamic>` everywhere) — freezed planned.
- `widget_test.dart` tests are not runnable as written (no `ProviderScope`).
- Android release manifest lacks `INTERNET` permission (debug/profile only).
- Dead dependencies in pubspec (retrofit, graphview, fl_chart, ...) — prune or adopt.
- `ApiClient` base URL hardcoded to localhost — needs build-time config (`--dart-define`).
