module.exports = {
  root: true,
  ignorePatterns: ['dist/**', 'www/**', 'node_modules/**'],
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: ['eslint:recommended'],
  overrides: [
    {
      files: ['src/js/**/*.js'],
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    {
      files: ['src/*.js', 'tools/*.js'],
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script',
      },
    },
    {
      files: ['**/*.test.js'],
      env: {
        browser: false,
        node: true,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  ],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-undef': 'error',
  },
};
