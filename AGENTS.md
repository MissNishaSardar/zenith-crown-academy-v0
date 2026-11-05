<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Stack

| Pkg           | Ver                | Note                                                                                                                                                                 |
| ------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js       | ^16.3              | `reactCompiler: true`, `typedRoutes: true`                                                                                                                           |
| React         | ^19.2              |                                                                                                                                                                      |
| TypeScript    | ^5.9               | strict, ESNext module, bundler resolution                                                                                                                            |
| Prisma        | ^7.10              | Uses `prisma-client` generator (not `prisma-client-js`). Output: `generated/prisma`. Driver adapter: `@prisma/adapter-libsql` for SQLite. Config: `prisma.config.ts` |
| shadcn/ui     | base-vega style    | Components in `src/components/shadcnui/`. Aliased as `@/components/shadcnui`                                                                                         |
| Base UI React | ^1.7               | Primitive provider for shadcn components (e.g., `@base-ui/react/button`)                                                                                             |
| Tailwind CSS  | ^4.3               | `@tailwindcss/postcss` plugin, `tw-animate-css`, `shadcn/tailwind.css`                                                                                               |
| Zod           | ^4.5               | Schema validation                                                                                                                                                    |
| better-auth   | ^1.7               | Auth: `src/lib/auth.ts` (server), `src/lib/auth-client.ts` (react client), routes mounted at `src/app/api/auth/[...all]/route.ts`                                    |
| env           | @t3-oss/env-nextjs | Split: `src/lib/env/serverEnv.ts` + `clientEnv.ts`                                                                                                                   |

Path aliases: `@/*` → `./src/*`, `@generated/*` → `./generated/*`.

Engines: Node >= 24, bun >= 1.4. Package manager: bun.

## Scripts

| Script       | Runs                                     |
| ------------ | ---------------------------------------- |
| `dev`        | `next dev`                               |
| `build`      | `prisma generate && next build`          |
| `start`      | `next start`                             |
| `lint`       | `eslint` only                            |
| `lint:check` | `next typegen && tsc --noEmit && eslint` |
| `migrate`    | `prisma migrate dev && prisma generate`  |
| `studio`     | `prisma studio --browser none`           |

## Agent behavior

- **Ask questions when ambiguous or before destructive actions.** Ask one question at a time, one question per turn, so each answer is clear and nothing gets confused or skipped. Before asking, explain in simple words why the answer is needed. When the topic could touch related files, point out the files that need the same modification or that share the key logic flow, and ask about them in the same question when possible. Wait for the user's answer and confirmation before spending tokens on the topics that depend on it. An earlier answer can change what the remaining questions should be.
- **Plan mode is binding**: while a session runs as the Plan agent, stay read-only. Never bypass Plan mode by routing edits or commands through subagents, since child sessions start fresh and run without Plan-mode tool restrictions. Implement only after the user actually switches to the build agent, even if they say proceed. Tell them to switch instead of implementing.
- **Ask before touching anything outside the project**: never write, create, or delete any file or folder outside the repo directory, including global config such as `C:\Users\USER\AGENTS.md` or `C:\Users\USER\.config\opencode\AGENTS.md`, unless the user has explicitly approved that exact path in the current session. Tool-owned caches from bunx, Playwright browsers, and the Next.js build are exempt since they are standard tooling storage, not content changes. Nothing leaves the working tree through a commit or push without an explicit request from the user.
- **Use your full toolkit**: Reach for `websearch`, `webfetch`, and any other available tools whenever they improve correctness. Do not answer from memory what a live tool can verify. Use `rg` (ripgrep) for file and content searches in the shell when it is installed.
- **Decisions between options**: When a choice exists, evaluate all options first, pick the best one, then ask the user with every option listed (chosen one included and marked) before proceeding. Never silently pick one.
- **Update this file** when you discover non-obvious gotchas, fixes, or conventions.
- **Use skills + MCPs** before writing code matching `prisma-*`, `next-*`, `better-auth-*`, `zod`, etc. Use `shadcn` MCP for component add/search/audit. Use `better-auth` MCP for auth docs.
- **Review with docs verification**: whenever the user asks for a review, or a pre build review such as the /review command, run /review. Then verify the touched code against the latest official documentation, Prisma through the prisma skills, better-auth through its MCP docs search resolved to the installed version, and Next.js through the guides in `node_modules/next/dist/docs/`. The review must identify structural issues, problematic areas, and duplicated code, and report all findings before a build proceeds.
- **Package manager**: always use bun (`bun install`, `bun run <script>`, `bunx <tool>`). Never npm, yarn, or pnpm. Keep `bun.lock` in sync when dependencies change.
- **Never abandon in progress work**: when the user sends new information or a new task during ongoing work, do not drop the earlier build and jump to the newest request. Note the new input, fold it into the plan, and finish everything step by step in order: complete the current step, then the next, then apply the addition. Nothing is left half built unless the user explicitly confirms dropping it or changing the priority. For an urgent or conflicting addition, ask how to order the work instead of silently deciding.
- **Revise all plans before building**: when plan mode is used and a build is about to start, do not jump straight into code. First reread every plan made in this session, recheck each item, and confirm no planned part was skipped or missed. Only begin the build once the full plan list checks out, and state the final revised plan before starting.
- **Mocks are temporary HTML**: whenever the user asks for a mock, create temporary HTML files under the project and point to them so the result can be viewed directly in the browser. After the mock is approved and the real build is finished, delete the temporary mock files so nothing is left behind.
- **Propagate issue fixes**: when the user reports an issue or asks for a fix, do not fix only the reported spot. First search the rest of the project for the same or a similar issue in related files, inform the user about every location where it also exists, then fix all of them together in one pass unless the user says otherwise.

## Verification

- **Primary**: `bun run lint`, eslint only. This is the default check.
- **Heavy gates**: `bun lint:check` runs `next typegen`, `tsc --noEmit`, and `eslint`. `bun run build` runs `prisma generate && next build`. Use these only when requested or when playwright-cli testing fails, since the dev server already runs typegen and typechecks during browser verification.
- **Browser**: Use `@playwright/cli` via `bunx @playwright/cli` (the old `playwright-cli` package is deprecated and errors with "could not determine executable"). The CLI blocks `file:` URLs, so test over http: run `bun run dev` and browse `http://localhost:3000`, or serve a static preview with e.g. `bunx serve -l 4599 .` from the repo root and browse `http://localhost:4599/<path>`. Enumerate capabilities with `bunx @playwright/cli --help`.
- **Headed mode**: Always run visible with `--headed`, e.g. `bunx @playwright/cli open --headed ...`.
- **Look at the page**: The agent has vision. Use `bunx @playwright/cli screenshot` and actually inspect layout, badges, dialogs, and styling. Do not rely on accessibility snapshots alone.
- **Click-testing**: Prefer CLI-driven click-testing against the running dev server.
- **Artifacts**: Snapshots, console logs, and screenshots land in `.playwright-cli/`, which is gitignored.
- **Cheat-sheet**: Maintain `playwright-cli.md` at the repo root, a running record of UI element names, routes, form shapes, and flow gotchas discovered while testing. Consult it before scanning snapshots, and append new learnings as they are discovered.
- **Post build verification**: after finishing any build or feature, always run playwright-cli against the running dev server to confirm what was built actually renders and works, not only that the code compiles. State the result of this check before handing the work back.
- **Layout hygiene**: while verifying, inspect the screenshots for unwanted spacing. No unusual empty or dead spaces, no stray double spaces in text, and no uneven margins or padding may appear. Fix every spacing problem found, with consistent tailwind spacing utilities, and recheck before handing back.
- **No loose ends**: a build is complete only when nothing is dangling. Before handing any work back, review every touched file and confirm there are no TODO placeholders, no unused imports or variables, no empty or unhandled states, no broken imports or dead routes, no leftover console logs or throwaway files, and no temporary mock files still present. Every new feature must be reachable, fully wired up, and working end to end.

## Project structure

```
src/
  app/              # App Router (layout.tsx, page.tsx, globals.css)
  components/
    Layout/         # Header, ThemeToggleButton
    Providers/      # ThemeProvider (next-themes)
    shadcnui/       # shadcn primitives (button.tsx, toast.tsx)
  hooks/            # Custom hooks (currently empty)
  lib/
    dbClient/       # Prisma singleton with libSQL adapter
    env/            # serverEnv.ts, clientEnv.ts (t3-env)
    fonts.ts        # next/font (Geist, Inter)
    types.ts        # LayoutProps
    utils.ts        # cn() helper (clsx + tailwind-merge)
  server/           # API routes placeholder (empty)
generated/prisma/   # Prisma client output (gitignored)
public/uploads/     # User uploads (all files ignored except .gitkeep)
```

## Gitignore pattern: uploads

`public/uploads/*` + `!public/uploads/.gitkeep` ignores all uploaded files but keeps the empty dir tracked via `.gitkeep`. Do not add `public/uploads/` itself to gitignore.

## Code style

- **Functions**: Always use arrow functions (`const foo = () => {}`), never `function` declarations. Exception: `src/components/shadcnui/` keeps its generated style.
- **No em dashes**: Never use em dashes in prose, comments, or docs. Use periods or commas instead. Also avoid parentheses, en dashes, and hyphens as dash substitutes.
- **Tailwind class sorting**: files written through opencode get auto-formatted by `prettier-plugin-tailwindcss`, which reorders `className` strings. After writing a file, reread it before the next edit and match the sorted order, or the edit fails to match.

## Key restrictions

- **ESLint**: Locked at eslint@9.x until `eslint-plugin-react` ships v10 support. Do NOT bump.
- **TypeScript**: Currently ^5.9. TS 7.0 (Go-native compiler) blocked until typescript-eslint API stabilizes (~Oct 2026). Do not migrate.

## Form patterns

Schemas live in `src/lib/zodSchema.ts`. Export both the schema and `type X = z.infer<typeof xSchema>`.

Components use `"use client"`, `react-hook-form` + `@hookform/resolvers/zod`, and shadcn primitives:

```typescript
const { handleSubmit, control, formState: { isSubmitting } } = useForm({
  resolver: zodResolver(mySchema),
  defaultValues: { ... },
  mode: "all",
});
```

Each field goes through `Controller`:

```typescript
<Controller
  name="fieldName"
  control={control}
  render={({ field, fieldState }) => (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor={field.name}>Label</FieldLabel>
      <Input {...field} id={field.name} aria-invalid={fieldState.invalid} autoComplete="..." />
      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
    </Field>
  )}
/>
```

Submit: `<form onSubmit={handleSubmit(handler)} noValidate>`. Button disabled while submitting with icon toggle.

## Button behavior

- **Real disabled logic**: whenever a button needs to be disabled, implement proper disabled logic through the `disabled` attribute tied to the relevant state, never visual only styling.
- **Edit buttons**: every edit or save button must be disabled while `!hasChanged`, staying inactive until the user actually changes something. Track this with `formState.isDirty` from react-hook-form or an explicit `hasChanged` flag.
- **Spinning loader**: an acting button shows a spinning loader for about 1500ms. When there is no real async operation, provide an equivalent minimum delay so the loading state is perceivable instead of flashing for an instant.
- **Baseline, not the limit**: these are minimum button behaviors, not exclusions. Other UI effects and micro interactions are still allowed on top of them.

## Git commits

Use PowerShell here-strings:

```powershell
git commit -m @"
<commit message here>
"@
```

## Better Auth

- Schema lives in `prisma/schema.prisma` (generated models: `User`, `Session`, `Account`, `Verification`, each `@@map`ped to lowercase tables). Apply changes with the project `migrate` script, never `auth migrate` (unsupported for the Prisma adapter).
- `bunx auth generate` is interactive: pass `--output prisma/schema.prisma -y`. It does not load `.env`, so set `DATABASE_URL` and `BETTER_AUTH_SECRET` inline for that command.
- Re-run generate + migrate after adding Better Auth plugins.
- Plugin order matters: custom plugins like `admin()` go BEFORE `nextCookies()`, which must stay last in the `plugins` array or cookies get dropped (server warning).
- `bunx auth generate` regenerates `prisma/schema.prisma` from scratch: after every run, reapply the RBAC tightening on `User`: `role String @default("student")` and `banned Boolean @default(false)` (generate emits them as nullable), then migrate.
- The admin CLI supports non interactive setup: `bunx auth create-admin --email <email> --name <name> --password <pw> --role super_admin` with env inline (`--role` accepts any slug from `src/lib/auth/permissions.ts`).
- Admin endpoints (set-role, ban, etc.) require an `Origin` header in curl or PowerShell tests, plus a session cookie; the client plugin handles it in-app.

## Agent orchestration and token efficiency

The main agent is the brain. Subagents are workers with fresh context and no memory of the conversation. Act directly only when urgent; delegate everything else.

- **Delegate heavily**: launch the maximum useful number of subagents, batched in parallel whenever tasks are independent. Use background mode for slow independent work.
- **Self contained prompts**: every subagent prompt includes the goal, context, file paths, constraints, and the exact output expected. Workers see nothing else.
- **Tight worker prompts**: no fluff. Workers return short structured summaries, never raw dumps of file contents or logs.
- **Right thoroughness**: use Explore with quick thoroughness for simple lookups, deeper thoroughness only for genuinely complex questions.
- **Batch spawn overhead**: combine related questions into a single worker call instead of many small spawns.
- **Act directly only for**: tiny one line edits where spawning costs more than the fix, a single small file read needed to plan, and destructive or hard to reverse actions (always confirm those with the user first).
- **No re-reads**: never re-read files already covered by a worker summary. Keep replies concise.
- **Fresh sessions**: for a new unrelated task, recommend starting a new session so the old context does not keep being resent every turn.
