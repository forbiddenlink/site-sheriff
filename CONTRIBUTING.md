# Contributing to Site Sheriff

Thank you for your interest in contributing to Site Sheriff! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork the repository** and clone it locally
2. **Install dependencies**: `pnpm install`
3. **Set up environment**: Copy `.env.example` to `.env` and fill in required values
4. **Run the dev server**: `pnpm dev`

## Development Workflow

### Commands

```bash
pnpm dev          # Start development server
pnpm build        # Build for production
pnpm lint         # Run ESLint
pnpm test         # Run tests in watch mode
pnpm test:run     # Run tests once
pnpm test:e2e     # Run Playwright E2E tests
```

### Code Quality

- **TypeScript**: All code must pass type checking (`pnpm exec tsc --noEmit`)
- **ESLint**: Code must pass linting (`pnpm lint`)
- **Tests**: New features should include tests
- **Pre-commit hooks**: Husky runs lint-staged automatically

### Project Structure

```
src/
├── app/                 # Next.js App Router pages and API routes
├── components/          # React components
├── lib/
│   ├── scanner/        # Core scanning logic
│   │   ├── core/       # Shared utilities and types
│   │   ├── seo-checker/# SEO-specific checks
│   │   └── *.ts        # Individual checker modules
│   └── *.ts            # Shared utilities
└── ...
```

### Adding a New Check

1. Create or update the appropriate checker in `src/lib/scanner/`
2. Follow the checker pattern:
   ```typescript
   export async function checkSomething(
     pages: CrawlResult[],
     normalizedUrl: string
   ): Promise<ScanIssue[]>
   ```
3. Add tests in a corresponding `.test.ts` file
4. Register the check in the scan pipeline (`src/lib/scanner/index.ts`)

## Pull Request Process

1. **Create a branch** from `main` with a descriptive name
2. **Make your changes** following the code quality guidelines
3. **Write tests** for new functionality
4. **Update documentation** if needed
5. **Create a PR** with a clear description of changes

### PR Requirements

- [ ] All tests pass
- [ ] ESLint passes with no errors
- [ ] TypeScript compiles without errors
- [ ] Commits follow conventional format (optional but appreciated)

## Reporting Issues

- Use the GitHub issue tracker
- Include steps to reproduce
- Include expected vs actual behavior
- Include browser/environment details if relevant

## Questions?

Open an issue or start a discussion on GitHub.
