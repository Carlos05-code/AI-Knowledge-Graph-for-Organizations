# Coding Standard

## 1. Naming conventions

| Type | Rule | Example |
|---|---|---|
| Files | kebab-case | `documents.service.ts`, `login_screen.dart` |
| TS classes | PascalCase | `DocumentsService` |
| Dart classes/widgets | PascalCase | `LoginScreen` |
| TS functions/params | camelCase | `generateTokens` |
| Dart functions/fields | lowerCamelCase | `_emailController` |
| Enums/constants | UPPER_SNAKE (TS) / camelCase (Dart) | `UserRole.ADMIN`, `_primaryLight` |
| Prisma models | PascalCase, singular | `KnowledgeGap` |
| DB columns | camelCase | `organizationId` |

## 2. Folder structure

- Backend: `src/{modules,infrastructure,presentation,shared,domain}` (see BACKEND_SPEC).
- Frontend: `lib/core` + `lib/features/<feature>/{presentation,domain,data}`.
- New backend feature → module under `src/modules/`; register in `AppModule`.
- New frontend feature → folder under `lib/features/`; route in `app_router.dart`.

## 3. Architecture rules

1. Services must not import controllers; controllers only orchestrate.
2. Infrastructure is `@Global()`; feature modules never duplicate infra providers.
3. All tenant queries filter `organizationId` — no exceptions.
4. All endpoints respond through the global envelope (never `res.send` raw).
5. Auth: JWT guard per controller; admin-only actions use `@Roles(UserRole.ADMIN)`.
6. No `any` in new TS code where a type exists (`meetings`/`connectors` DTOs are known
   debt — type them as you touch them).
7. Frontend: state via Riverpod notifiers; screens stay thin; no `setState` in providers.

## 4. Error handling

- Throw typed Nest exceptions (`UnauthorizedException`, `ConflictException`, ...).
- Catch at service boundaries where degradation is expected (Neo4j/Qdrant/Redis/OpenAI);
  log with context, never swallow silently.
- Frontend: errors surface through state (`error` fields), displayed inline.
- Global filter converts unknowns to 500 with logged stack.

## 5. Logging

- Use Nest `Logger` (`new Logger(X.name)`) or the global winston `LoggerService`.
- Levels: info for lifecycle, warn for degradation, error for failures.
- Never log passwords, tokens, credentials or full file contents.

## 6. Documentation

- Every endpoint gets Swagger decorators (`@ApiOperation`, `@ApiResponse`, `@ApiTags`).
- Public functions: brief JSDoc when non-obvious.
- Doc changes accompany behavior changes (docs/ suite mirrors implementation).
- ADR for any new significant technical decision.

## 7. Git conventions

- **Conventional Commits**: `feat(scope): ...`, `fix(scope): ...`, `docs: ...`,
  `test(scope): ...`, `chore: ...`, `refactor(scope): ...`.
- Branch strategy: `main` protected; feature branches `feat/<slug>`; PRs to main.
- Commit only related changes; never commit secrets or build artifacts.

## 8. Review checklist

- [ ] Builds (`npm run build` / `flutter analyze`) clean
- [ ] Tests pass (unit + e2e / widget)
- [ ] Lint + format pass
- [ ] No TODOs, placeholders or dead code
- [ ] No duplicated logic
- [ ] Security reviewed (auth, tenancy, secrets)
- [ ] Performance considered (pagination, N+1, indexing)
- [ ] Docs updated if behavior changed
