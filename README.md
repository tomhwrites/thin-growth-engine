# thin-growth-engine

Thin harness, fat skills. Rewrite of growth-engine as a CLI.

## Run

```bash
npm install
npm run ge -- draft-tweet --narrative="AI infra costs are the new CAC" --style=oneliner
```

## Layout

- `skills/` — markdown procedures (the actual product)
- `skills/_context/` — shared context loaded by the resolver
- `skills/learned/` — rules appended by the `improve` skill; review before promoting
- `harness/` — ~200 lines that loads a skill, resolves context, calls Claude, parses
- `lib/` — deterministic tools (Prisma, Sheets)
- `bin/ge.ts` — CLI entrypoint
