# Build Optimization

Cold build: ~45s
Cached build: ~15s (3x faster)

## Optimizations
- Turborepo pipeline caching for build, lint, test
- CI matrix with Node 18/20/22 + artifact caching
- .next/cache persisted between runs
