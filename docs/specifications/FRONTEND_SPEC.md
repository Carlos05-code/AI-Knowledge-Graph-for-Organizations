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
    ├── admin/                  # admin_screen (tabs: Overview dashboard, Members RBAC, Audit Logs)
    ├── settings/               # settings_screen (profile edit)
    ├── documents/              # documents_screen (list, upload, detail, process, delete)
    ├── connectors/             # connectors_screen (list/add/config/test/sync/runs)
    ├── meetings/               # meetings_screen (create/list/detail/summarize/delete)
    ├── policies/               # policies_screen (search/filter/create/edit/activate/delete)
    ├── chat/                   # chat_screen + chat_provider; citations from message `sources`
    ├── search/                 # search_screen + search_provider
    ├── graph/                  # graph_explorer_screen (CustomPaint)
    ├── home/                   # dashboard quick actions
    └── shell/                  # (placeholder dir, no longer routed)
```

All shell routes are wired to real screens.

## 3. Routing

| Route | Screen | Auth |
|---|---|---|
| `/login` | LoginScreen | public |
| `/register` | RegisterScreen | public |
| `/` | HomeScreen | JWT |
| `/chat` `/chat/:conversationId` | ChatScreen (streamed, citation chips) | JWT |
| `/search` | SearchScreen | JWT |
| `/documents` | DocumentsScreen (list, filter, upload, detail, process/delete) | JWT |
| `/graph` | GraphExplorerScreen | JWT |
| `/connectors` | ConnectorsScreen (list, add, config, test, sync, runs) | JWT |
| `/meetings` | MeetingsScreen (list, create, detail, summarize, delete) | JWT |
| `/policies` | PoliciesScreen (search, filter, admin CRUD) | JWT |
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
  `DocumentsService`, `UsersService`, `ConnectorsService`, `MeetingsService`,
  `PoliciesService`, `AdminService` (hand-written Dio calls; retrofit unused).

Connectors flow: FAB (ADMIN) → create sheet (type/name/JSON credentials/optional channel +
interval) → `POST /connectors`; tile → detail sheet (`GET /connectors/:id` + `/runs`) with
Test (`POST :id/test`), Sync now (`POST :id/sync`) and soft-delete; tile switch toggles
`isEnabled` (PUT).

Meetings flow: FAB → create sheet (title/description/date picker/duration/optional
transcript) → `POST /meetings`; tile → detail bottom-sheet
(`GET /meetings/:id`) with participants, summary, action items, decisions, transcript,
"Generate summary" (`POST :id/summarize`) and delete.

Policies flow: search-as-you-type field (`GET /policies/search?q=` — active only) vs
filtered list (category chips + active switch, paged); FAB (ADMIN) → create sheet;
detail sheet with content + linked documents; admin actions: edit (inline), toggle
active, delete.

Admin flow: three tabs — Overview (`GET /admin/dashboard` stat cards + recent
activity), Members (existing RBAC management), Audit Logs (`GET /admin/audit-logs`
with entity/action filters + pagination). Access is gated to `ADMIN` (non-admin sees
a locked view).

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

- No typed models (`Map<String, dynamic>` everywhere) — freezed planned.
- `widget_test.dart` runs (5 passing widget tests); broader Riverpod harness suites planned.
- Dead dependencies in pubspec (retrofit, graphview, fl_chart, ...) — prune or adopt.
- `ApiClient` base URL hardcoded to localhost — needs build-time config (`--dart-define`).
