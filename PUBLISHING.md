# Publishing LogDot Node.js SDK to npm

This guide covers publishing the LogDot SDK to the npm registry.

## Prerequisites

1. **npm Account**: Create an account at [npmjs.com](https://www.npmjs.com/signup)
2. **npm CLI**: Ensure npm is installed (`npm --version`)
3. **Authentication**: Log in to npm CLI

```bash
npm login
```

## Pre-Publish Checklist

- [ ] Update version number in `package.json`
- [ ] Update `CHANGELOG.md` (if applicable)
- [ ] Ensure all tests pass
- [ ] Verify `README.md` is up to date
- [ ] Check that `LICENSE` file exists

## Building the Package

Build the TypeScript source to JavaScript:

```bash
npm run build
```

This compiles the `src/` directory to `dist/` with:
- JavaScript files (`.js`)
- TypeScript declaration files (`.d.ts`)
- Source maps

## Verify Package Contents

Before publishing, check what files will be included:

```bash
npm pack --dry-run
```

The package should include:
- `dist/` - Compiled JavaScript and type declarations
- `README.md` - Documentation
- `LICENSE` - MIT license
- `package.json` - Package metadata

## Version Management

Use npm's built-in version commands:

```bash
# Patch release (1.0.0 -> 1.0.1) - bug fixes
npm version patch

# Minor release (1.0.0 -> 1.1.0) - new features, backwards compatible
npm version minor

# Major release (1.0.0 -> 2.0.0) - breaking changes
npm version major
```

These commands automatically:
1. Update `package.json` version
2. Create a git commit
3. Create a git tag

## Publishing

### To npm (Production)

```bash
npm publish
```

### To npm with Public Access (for scoped packages)

If using a scoped package name (e.g., `@logdot/sdk`):

```bash
npm publish --access public
```

## Testing Before Publishing

### Test with npm link

```bash
# In the SDK directory
npm link

# In a test project
npm link logdot
```

### Test with npm pack

```bash
npm pack
# Creates logdot-1.0.0.tgz

# In a test project
npm install ../path/to/logdot-1.0.0.tgz
```

## Unpublishing (Emergency Only)

You can unpublish within 72 hours of publishing:

```bash
npm unpublish logdot@1.0.0
```

**Warning**: Unpublishing is discouraged. Use `npm deprecate` instead:

```bash
npm deprecate logdot@1.0.0 "Critical bug, please upgrade to 1.0.1"
```

## CI/CD Publishing (Optional)

For automated publishing via GitHub Actions:

1. Generate an npm access token at npmjs.com
2. Add it as a GitHub secret named `NPM_TOKEN`
3. Create `.github/workflows/publish.yml`:

```yaml
name: Publish to npm
on:
  release:
    types: [created]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Troubleshooting

### "You must be logged in to publish"
Run `npm login` and enter your credentials.

### "Package name already exists"
Choose a different name or use a scoped package (`@yourorg/logdot`).

### "Cannot publish over existing version"
Bump the version number before publishing.

## Resources

- [npm Documentation](https://docs.npmjs.com/)
- [npm publish](https://docs.npmjs.com/cli/publish)
- [Semantic Versioning](https://semver.org/)
