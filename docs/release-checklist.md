# Release Checklist

Use this checklist before publishing AIDE on GitHub or npm.

## Repository

- [ ] `git status --short` is clean.
- [ ] Branch is named and pushed.
- [ ] README installation commands match the actual npm package names.
- [ ] `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `CHANGELOG.md` are present.
- [ ] GitHub issue templates, PR template, Dependabot, CodeQL, CI, docs, and release workflows are committed.

## Quality Gates

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm audit --omit=dev`
- [ ] Docker smoke build, if Docker artifacts are part of the release.

## Package Metadata

- [ ] Every published package has `license`, `repository`, `bugs`, `homepage`, `files`, `exports`, `types`, and `publishConfig`.
- [ ] Internal `@aide-dev/*` dependencies use explicit semver ranges.
- [ ] Root package remains `private: true` unless the root is intentionally published.
- [ ] Generated `dist` files are reproducible from source.

## Product Safety

- [ ] Missing tests or missing verification evidence produce `REVIEW`, not `TRUST`.
- [ ] README describes limitations and does not promise correctness or security guarantees.
- [ ] MCP path handling blocks traversal outside the project root.
- [ ] Installer writes are documented, reversible, and covered by tests.

## Release

- [ ] Changeset is present for package version changes.
- [ ] Changelog is updated.
- [ ] Release notes include known limitations.
- [ ] GitHub release is created after CI passes.
- [ ] npm packages are published from the same commit as the GitHub release.
