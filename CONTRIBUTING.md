# Contributing to AI Knowledge Graph

## Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit using Conventional Commits
4. Push and open a Pull Request

## Conventional Commits

```
feat:     New feature
fix:      Bug fix
docs:     Documentation
refactor: Code change without feature/fix
test:     Adding tests
chore:    Build/config changes
style:    Formatting
perf:     Performance improvement
```

### Examples

```
feat(auth): implement OAuth2 with Google Drive connector
fix(pipeline): handle empty PDF chunking edge case
refactor(graph): optimize Neo4j relationship queries
test(chat): add RAG pipeline integration tests
docs(readme): add deployment section
```

## Code Standards

### Backend (NestJS)
- Clean Architecture: Domain → Application → Infrastructure → Presentation
- All dependencies injected via constructor
- DTOs with class-validator decorators
- Prisma for database access
- Unit test coverage > 80% for critical modules
- E2E tests for all API endpoints

### Frontend (Flutter)
- Feature-first architecture
- State management via Riverpod
- Null safety required
- Responsive design (desktop-first)
- Widget tests for all components
- Dark mode support

## Pull Request Process

1. Ensure all tests pass: `npm test`
2. Ensure linting passes: `npm run lint`
3. Update documentation if needed
4. Add changelog entry
5. Request review from maintainer

## Branch Naming

- `feat/short-description`
- `fix/short-description`
- `refactor/short-description`
- `docs/short-description`

## Commit Checklist

- [ ] Tests pass
- [ ] Linter passes
- [ ] Types are correct
- [ ] No secrets committed
- [ ] Documentation updated
- [ ] Conventional commit format used
