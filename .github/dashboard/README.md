# GitHub Dashboard

## Local Preview

```bash
cd .github/dashboard
npm install
npx tsx src/generate.tsx
npx serve site -l 8901
```

For faster iteration, set `maxRuns: 10` in the CI section of `src/config.ts` — full CI fetch takes ~90s.

## Type Check

```bash
npx tsc --noEmit
```
