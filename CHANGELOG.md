# Changelog

All notable changes to Site Sheriff will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Error tracking with Sentry integration
- Error boundary pages (error.tsx, global-error.tsx, not-found.tsx, loading.tsx)
- Health check endpoint at `/api/health`
- Terms of service page
- CI/CD workflow with GitHub Actions
- Pre-commit hooks with husky and lint-staged
- MIT License
- Node version specification (.nvmrc)

### Changed
- Updated dependencies to latest versions

### Fixed
- Resolved dependency vulnerabilities (undici, flatted)
- Fixed ESLint errors across codebase

## [0.1.0] - 2026-02-27

### Added
- Initial release
- 100+ static checks across SEO, accessibility, security, performance, and content
- 80+ accessibility rules via axe-core
- Playwright/fetch dual-mode crawler with screenshot capture
- 20-phase scan pipeline with deadline awareness
- Tech detection for 34 frameworks/libraries
- Scheduled scans with email alerts
- Shareable reports with unique tokens
- Dashboard with scan history and comparison
- Better Auth integration for user authentication
