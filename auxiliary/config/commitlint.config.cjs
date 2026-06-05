// commitlint configuration — enforce Conventional Commits
// See: docs/plans/AIDE-REFACTOR-PLAN-v1.0.md#p1-1
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Type must be one of these (enumerated for clarity)
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation only
        'style', // Formatting (no code change)
        'refactor', // Code refactor (no behavior change)
        'perf', // Performance improvement
        'test', // Add or fix tests
        'build', // Build system / dependencies
        'ci', // CI configuration
        'chore', // Maintenance / tooling
        'revert', // Revert previous commit
      ],
    ],
    // Subject must start lowercase, no period
    'subject-case': [2, 'always', 'lower-case'],
    'subject-full-stop': [2, 'never', '.'],
    // Max header length
    'header-max-length': [2, 'always', 100],
  },
  // Allow merge commits and revert commits
  ignores: [(message) => message.startsWith('Merge ') || message.startsWith('Revert ')],
};
