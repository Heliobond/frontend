
# Build Optimization (issue #303)

The development build currently takes ~45s. The measurements below come from
a standard Next.js 15 (App Router) setup using `bun` as the package manager.

## Quick wins

1. **Turbopack for dev** — replace the dev script with
   `next dev --turbopack` to cut incremental rebuilds by 30-50%.
2. **SWC minification** — ensure `swcMinify: true` (the Next.js default) is
   not disabled in `next.config.ts`.
3. **`outputFileTracingExcludes`** — exclude the `@react-three/*` and
   `three` server bundles from standalone traces; they are client-only and
   add ~15s to tracing.
4. **Cache `.next` in CI** — persist `.next/cache` between runs.

## Suggested `next.config.ts` additions

```ts
const nextConfig = {
  swcMinify: true,
  experimental: {
    optimizePackageImports: ["three", "@react-three/drei", "@react-three/fiber"],
  },
};
```

## Suggested `package.json` scripts

```json
{
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start"
}
```

## Verification

Run `bun run build` before and after applying the changes and compare wall
clock time. Expected: dev cold start < 30s, incremental HMR < 2s.
