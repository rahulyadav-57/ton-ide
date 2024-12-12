import type { UserConfig } from '@commitlint/types';

const Configuration: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  parserPreset: 'conventional-changelog-atom',
  formatter: '@commitlint/format',
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation changes
        'style', // Changes that do not affect the meaning of the code (white-space, formatting, etc.)
        'refactor', // Code changes that neither fix a bug nor add a feature
        'perf', // Performance improvement
        'test', // Adding missing tests or correcting existing tests
        'build', // Changes that affect the build system or external dependencies (example scopes: npm)
        'ci', // Changes to CI configuration files and scripts
        'chore', // Other changes that don't modify src or test files
        'revert', // Reverts a previous commit
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'setup', // Project setup
        'config', // Configuration files
        'deps', // Dependency updates
        'feature', // Feature-specific changes
        'bug', // Bug fixes
        'docs', // Documentation
        'style', // Code style/formatting
        'refactor', // Code refactoring
        'test', // Tests
        'build', // Build scripts or configuration
        'ci', // Continuous integration
        'ui',
        'release', // Release related changes
        'theme', // Theme changes
        'other', // Other changes
      ],
    ],
  },
};

export default Configuration;
