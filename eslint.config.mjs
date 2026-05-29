import nextConfig from 'eslint-config-next';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...nextConfig,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      '@next/next/no-html-link-for-pages': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXOpeningElement[name.name='a'] > JSXAttribute[name.name='href'] > Literal[value=/^\\/(?!api\\/)/]",
          message:
            'Use next/link for internal navigation. Raw <a href=\"/...\"> is allowed only for external/download/API endpoints.',
        },
      ],
    },
  },
];

export default config;
