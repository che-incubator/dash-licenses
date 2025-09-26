export default {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  plugins: [
    'notice'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint', 'notice'],
      extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended',
        '@typescript-eslint/recommended-requiring-type-checking'
      ],
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname
      },
      rules: {
        // License Header Check for TypeScript
        'notice/notice': ['error', {
          templateFile: '.license-template.js',
          messages: {
            whenFailedToMatch: 'Missing or incorrect license header'
          }
        }],
        
        // TypeScript specific rules
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/explicit-function-return-type': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/prefer-nullish-coalescing': 'error',
        '@typescript-eslint/prefer-optional-chain': 'error',
        '@typescript-eslint/no-unnecessary-type-assertion': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        
        // Disable base ESLint rules that are covered by TypeScript
        'no-unused-vars': 'off'
      }
    }
  ],
  rules: {
    // License Header Check
    'notice/notice': ['error', {
      templateFile: '.license-template.js',
      messages: {
        whenFailedToMatch: 'Missing or incorrect license header'
      }
    }],
    
    // Possible Errors
    'no-console': 'off', // Allow console.log in this project
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    
    // Best Practices
    'eqeqeq': 'error',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-wrappers': 'error',
    'no-throw-literal': 'error',
    'prefer-promise-reject-errors': 'error',
    
    // Stylistic Issues
    'indent': ['error', 2, { SwitchCase: 1 }],
    'linebreak-style': ['error', 'unix'],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'never'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'space-before-function-paren': ['error', {
      anonymous: 'always',
      named: 'never',
      asyncArrow: 'always'
    }],
    
    // ES6+
    'arrow-spacing': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-arrow-callback': 'error',
    'prefer-template': 'error'
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true
      },
      rules: {
        'no-unused-expressions': 'off'
      }
    }
  ]
};
