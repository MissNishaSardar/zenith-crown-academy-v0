# playwright-cli cheat sheet

Running record of tooling notes, UI element names, routes, and flow gotchas discovered while browser testing.

## Tooling gotchas

- The tool is now `@playwright/cli` (`bunx @playwright/cli ...`). The `playwright-cli` package is deprecated and errors with "could not determine executable to run".
- `file:` protocol URLs are blocked by the CLI. Serve static files over http first: `bunx serve -l 4599 .` from the repo root in the background, then browse `http://localhost:4599/...`. Stop it afterwards by killing the process listening on the port (`Get-NetTCPConnection -LocalPort 4599`).
- The CLI returns a 301 from `.html` to the extensionless path, that is normal for `serve`.
- Snapshots, console logs, and screenshots land in `.playwright-cli/` (gitignored).
- Useful commands: `open --headed <url>`, `goto <url>`, `resize <w> <h>`, `screenshot`, `run-code "<js>"`, `find <text>`, `click <target>`, `localstorage-get <key>`, `console error`, `close`.
- `run-code` runs Playwright JS: use it for `page.screenshot({ fullPage: true })`, element screenshots (`page.locator('...').screenshot(...)`), `mouse.wheel`, and `scrollIntoViewIfNeeded` with `waitForTimeout` so entrance animations settle (~0.9s).
- `run-code` accepts exactly one JavaScript function definition, e.g. `async (page) => { ... }`, and invokes it with `page`. A bare multi-statement snippet fails with "Unexpected token 'const'", a top-level `await` outside the function fails with "await is not defined". There is no `document` global inside, use `page.evaluate`. For loops use `run-code --filename .playwright-cli/<script>.js` to skip shell quoting, then delete the script.
- Fixed-position decorative layers render empty below the viewport in `fullPage` screenshots, giving a misleading "background stops mid page" artifact. Verify tall pages with viewport screenshots at scroll offsets instead.

## Mock theme preview (mocks deleted 2026-11-02, notes kept for history)

- Files: `mockups/theme-landing.html`, `mockups/theme-signin.html`, `mockups/theme-signup.html`, served from repo root.
- Font switcher: `.switcher` fixed bottom right, buttons `[data-sans="poppins|outfit|dm"]`. Choice persists via localStorage key `zca-mock-sans`, and page title plus `[data-sans-name]` text update with it.
- Brand emblem is `../public/logo-mark.png` (transparent emblem with no wordmark). Note: `public/14-grad-cap-crown.png` was deleted during the build by parallel asset work, anything still pointing at it 404s.
- The old solid logo had a baked white background, which is why the crop/multiply tricks existed; the transparent replacement removed the need for them.
- Landing sections: `.head-pill` sticky glass header, `.hero`, `.sys` (typography specimen + palette chips 3+2 mirroring the sheet), `.feature-band` (one glass band, hairline separators), `.cta-card`, `.foot`.
- Auth layout: `.auth` grid, left `.auth-brand` (emblem, serif headline, proof chips, note), right `.auth-panel` with `.auth-card` form (Better Auth shaped: name/email/password, oauth slots Google and GitHub).
- Mobile: below 940px the auth grid stacks and `.auth-panel` padding-top grows to 92px so the fixed "Back to home" pill never collides with the card heading; below 640px the switcher centers itself along the bottom.

## Brand identity build (implemented)

- Home `/` is the branded hero page. Default theme is dark (`defaultTheme="dark"` in `layout.tsx`), user theme choice persists in localStorage via next-themes.
- Theme toggle: `role=button[name='Toggle theme']` in the header; clicking flips `document.documentElement` between `dark` and `light` classes.
- Header: `header` sticky h-16, brand link `aria-label="Zenith Crown Academy home"` with `/logo-mark.png` mark at h-9 plus two-tone wordmark.
- Hero: `logo-mark.png` at h-36 (h-44 sm) with drop shadow, `h1` title, gold `CrownIcon` divider between hairline gradients, tagline paragraph.
- Routes: `/icon.png`, `/apple-icon.png`, `/opengraph-image.png` are file-convention metadata routes (200, image/png). `/favicon.ico` was removed; the app `icon.png` covers it.
- Gotcha: header height must stay exactly 4rem including its border (`h-16` on the header itself). A 65px header makes the hero's `calc(100svh-4rem)` overflow by 1px and shows a scrollbar.
- Brand palette was sampled from the logo art: navy `#1b2548` (light primary), steel `#38466b`, gold `#e1ac42` (dark primary). Palette lives in `globals.css` `:root` and `.dark` blocks.
- `public/14-grad-cap-crown.png` (flat white original) was deleted by the parallel asset work; the transparent master `14-grad-cap-crown-transparent.png` is the source of truth, `public/logo-mark.png` is the cropped mark-only derivative with no wordmark band.

## Dark theme mock (deleted 2026-11-02)

- File: `mockups/theme-dark.html`, night rendition of the light landing. Canvas is the sheet ink `#0C0C12`, text is warm paper `#FFF9E8` (moon tokens), the lemon silk becomes a slow molten amber haze, glass chips and buttons invert to dark glass, violet and lime keep their roles.
- Emblem sits on a warm tile: `.brand-mark` uses `background: var(--moon)` with padding and radius so the artwork never sinks into the night canvas.
- Footer link `Light theme` (`.foot nav a` first) returns to `mockups/theme-landing.html`; the font switcher value carries across light and dark pages via the same localStorage key.

## Theme pack, 5 light and 5 dark pairs (deleted 2026-11-02)

- Directory `mockups/themes/`: ten slim pages named `<theme>-<mode>.html` where theme is meadow, bluebell, hearth, blush, chalk. Shared `pack.css` (one structure plus ten variable skins selected by `html[data-theme][data-mode]`) and `pack.js` (sans switcher plus the `#packui` theme and mode pill, navigation via `location.href`).
- Landing structure mirrors the approved light landing: sticky glass `.head-pill`, hero chip, `.sys` specimen with palette chips 3 plus 2, `.feature-band`, `.cta-card`, `.foot`.
- Lost rule found during review: `.sys .rule` needed explicit `width: min(320px, 60%)` and `margin: 46px auto` or the specimen hairline rendered full width.
- Palette chips list each page's exact tokens: primary, acc2, acc3, then the canvas chip and text chip. Dark pages give the canvas dot class `dot lg ring`; light pages list `#FFFFFF` (or paper) with a ring only when it is white on white.
- Dark canvases ride on `--head-*` inverted glass tokens; the emblem sits on a light `--mark-tile` tile on dark pages so it never sinks into the night.

## Crest collapse fix (applies to all mocks)

- Symptom: on mobile widths the header emblem image vanished. On dark pages with a light mark tile it showed as an empty vertical bar; on transparent-tile light pages it silently disappeared.
- Root cause: `.head-pill` is a flex row; when the row slightly overflows on narrow screens, default `flex-shrink` consumes the brand item first, and the mark's `img` (fixed `height`, `width:auto`, living inside an auto-width tile) collapses to zero width because of the global `img { max-width: 100% }` resolving against a squeezed containing block.
- Fix: `flex: none` on `.brand` and `.brand-mark`, `flex: none` on the mobile primary button, and hide `.brand-name` below 520px (crest only, no truncation). Applied to `pack.css` and all four old mocks. Verified crest renders at 390, 560, and 700 widths.

## Pack verification record

- All ten pair pages screenshot reviewed at 1280x860 (`.playwright-cli/pair-<theme>-<mode>.png`): five soft light canvases (green meadow, sky bluebell, parchment hearth, rosé blush, slate chalk) and five tinted soft-dark twins, correct pressed states on the packui pill, no wrapping.
- Scroll checks on chalk-light and hearth-dark (sys specimen, features band, CTA card, footer) all correct; palette chips match the CSS tokens exactly. At max scroll the two fixed preview pills cover the footer strip; hide `.packui,.switcher` via `addStyleTag` temporarily to inspect it. Footer renders `© 2026 Zenith Crown Academy` left, nav right.
- Mobile 390x844 on meadow-light and chalk-dark: header fits, pills stack centered without collision (packui above switcher), buttons wrap to two rows.
- Whole session console had a single error, the expected `favicon.ico` 404 from `serve`.

## Verification gotchas learned this round

- Bare `.dot` spans used as grid children rendered as squares: inline elements ignore width, height, and border radius, so the colored halo shadow leaked as a square. Fixed with `display: inline-block` on `.dot` in all mock files; dots inside `.chip` flex containers were never affected.
- Fixed-position switcher buttons wrapped into two lines on mobile: `white-space: nowrap` plus `flex-shrink: 0` on `.switcher button` fixes it.
- Below 640px the landing header needs `.brand-name` and the primary action forced to one line `nowrap` with smaller sizes, otherwise the pill wraps its text.
- Prefer `scrollIntoViewIfNeeded` over `mouse.wheel` inside `run-code` scripts; an earlier wheel script left the active tab on an unexpected page, so always re-check the `### Page` URL and Title in run-code output.
- Rival direction note: the real app now carries its own navy and gold build (oklch palette in `globals.css`, `defaultTheme="dark"` and Geist plus Inter fonts in `layout.tsx`, branded hero in `page.tsx`), while the sheet mocks in `mockups/` propose the violet, lemon, and Source Serif 4 identity from the palette task.

## Meadow silk background ported to the real app

- Source of truth: `mockups/themes/pack.css` `.silk` art layer: fixed `inset 0` `z-index: -1` element painting `var(--silk1), var(--silk2), var(--silk3)`, plus seven `.fold` blurred blobs (`blur(44px)`, `@keyframes drift`, 22 to 38s alternate) driven by `--fold1..7`, themed per `data-theme`/`data-mode`.
- Port: `:root` and `.dark` in `globals.css` carry the exact meadow light and dark silk and fold gradients copied from pack.css; `.silk`, `.fold`, `.f1..f7`, `keyframes drift` live in an `@layer components` block with the `prefers-reduced-motion` guard.
- `src/components/Layout/SilkBackground.tsx` renders the fixed layer (seven `<i class="fold fN"/>`) and is mounted in `layout.tsx` before `ThemeProvider`, so it sits behind every page and shines through the translucent `bg-background/80` header.
- `src/app/page.tsx` lost its ad-hoc radial overlay; it would have painted over the silk because `main` used `isolate`. The `main` also no longer needs `relative isolate overflow-hidden`.
- Equivalence check (compare app vs `meadow-light.html`): probe every fold's `getBoundingClientRect` plus computed `background` and the silk's computed multi gradient string on both pages. All strings were byte identical, geometry deltas were only drift animation phase. Transparent stops compute to `rgba(0, 0, 0, 0)`, equal to `transparent`.
- Reduced-motion and scrollbar: `overflow: hidden` on `.silk` clips vmax sized folds so no horizontal scrollbar appears at any width; mobile 390x844 dark verified clean, no dead space.
- Screenshots: `.playwright-cli/app-dark.png`, `app-light.png`, `app-dark-2.png`, `app-mobile.png`, `mock-light.png`. Console: only the React DevTools info line and HMR ping, 0 errors.
- Per-session wrap up: delete the temp probe script, stop the mock `serve` on port 4599, close the browser, check `git status` for lockfile churn (bunx runs saved a lockfile when first resolving `@playwright/cli` and `serve`, nothing changed in the project lockfile since).

## Meadow theme live verification (green palette and fonts applied to the real app)

- Supersedes the Rival direction note above: the real app now carries the meadow green palette with Source Serif 4 headings and Poppins UI text.
- Route `/` on the dev server at localhost:3000, default theme dark via next-themes. Toggle is `getByRole('button', { name: 'Toggle theme' })` in the sticky header, moon icon in dark, sun icon in light, one click flips mode and the choice persists in localStorage.
- Page composition at 1920x945: sticky header with `logo-mark.png`, two-tone serif wordmark and the toggle button, then a single 100svh hero with the h-36 emblem mark, serif h1, green CrownIcon between two hairline gradients, Poppins tagline paragraph. Everything centered, body height equals viewport height, no scrollbar, no double spaces detected by regex over h1, p, and header text.
- Computed style probe findings, both modes, all green tinted per CIE Lab a axis:
  - Dark: body bg lab(8.2, -8.7, 3.8) very dark pine, text lab(95.8, -5.1, 5.0) light green tinted, header oklab L 0.20 at 0.8 alpha green tinted glass, accent crown color lab(51.4, -41.2, 20.6) saturated green.
  - Light: body bg lab(97.5, -3.6, 3.5) pale off white green, text lab(14.4, -11.7, 5.0) very dark pine, header oklab L 0.98 at 0.8 alpha, accent crown color lab(48.6, -39.7, 18.8) saturated green.
- Fonts verified with `getComputedStyle` and `document.fonts.check`: body, header, and paragraph resolve to `Poppins, "Poppins Fallback"`, h1 to `"Source Serif 4", "Source Serif 4 Fallback"`, both checks true in dark and light. Font module classes on `html` confirm the variable fonts load.
- Screenshots: `.playwright-cli/meadow-dark.png` and `.playwright-cli/meadow-light.png`, fullPage, each exactly one viewport on this single screen page.
- Console: 0 errors, 0 warnings, only the React DevTools info line and the HMR connected log.
- Gotchas: the next dev "N" bubble sits bottom left in dev screenshots, it is the dev tools launcher, not a page element. Navy and gold survive only inside the `logo-mark.png` emblem artwork, which is source art carried over from the previous build, no CSS color in either mode computes to navy, indigo, or gold. `run-code --filename` with one `async (page) => {}` function and `page.evaluate` works well for multi property style probes, remember to delete the script afterwards.

## Fonts revert

- Fonts reverted 2026-11-02: `fonts.ts` and `layout.tsx` went back to the previous font stack, Geist Sans for UI text and Inter for headings, Geist Mono unchanged. The Poppins and Source Serif 4 claims in the meadow verification section above are history now, headings resolve to Inter, so treat those font probe results as outdated.

## Route separation and RBAC pass (implemented 2026-11-02, trimmed to bare stubs 2026-11-04)

- Route groups: `src/app/(public)/` with landing at `/` and site Header in `layout.tsx`, `src/app/(auth)/` as bare pass-through layout with no site header and only `/login`, `src/app/(dashboard)/` with session guarded `layout.tsx` rendering the shared `DashboardShell` with sidebar, header, and capped content, plus `dashboard/` with role redirector and 10 role home stubs.
- Roles under the better-auth admin plugin access control: `owner` as read only business owner, `administrator` as technical system admin replacing legacy `super_admin`, `principal` as academic head, `vice_principal` as deputy for attendance, discipline, and timetable only with no board exam finalization or promotions, plus `teacher`, `student` as signup default via `defaultRole`, `parent`, `accountant`, `office_staff`, `librarian`. Definitions and URL slug map live in `src/lib/auth/permissions.ts`; guards live in `src/server/guards.ts` with `requireSession` and `requireRole` wrapped in React `cache`. Database blocks direct URL access per role; middleware layer is `src/proxy.ts`. Legacy `super_admin` values map to `administrator` and `/dashboard/super-admin` redirects to `/dashboard/administrator`.
- Gotcha: Next 16 renamed middleware to proxy. The file is `src/proxy.ts` exporting `proxy` (not `middleware`), matcher constants only, Node.js runtime by default. It only does cookie presence checks; real authorization stays in the guards.
- Gotcha: `nextCookies()` must be the LAST plugin in the better-auth `plugins` array, otherwise a server warning appears and cookies can be dropped.
- Gotcha: better-auth admin endpoints (for example `/api/auth/admin/set-role`) reject requests without an `Origin` header (`MISSING_OR_NULL_ORIGIN`); PowerShell curl style tests must add `-Headers @{ Origin = 'http://localhost:3000' }`.
- Gotcha: with `typedRoutes`, dynamic hrefs (`redirect()`, `Link href={\`/dashboard/${slug}\`}`) fail tsc as plain strings; cast with `as Route` (`import type { Route } from "next"`). Still applies in `src/server/guards.ts`and`(dashboard)/dashboard/page.tsx`.
- Trimmed to bare stubs 2026-11-04 per scope call: `/login` renders one centered "Sign in" heading and the auth layout is a pass-through. The RHF + zod login form (`src/lib/zodSchema.ts`), inner sidebar shell, `SignOutButton`, and `shadcnui/input` were deleted after a fully verified run on 2026-11-02. No sign in UI exists; browser checks authenticate with a same-origin `fetch POST /api/auth/sign-in/email` inside `run-code` (status 200 sets the session cookie), and sign out is `POST /api/auth/sign-out` or a fresh browser context.
- Test accounts in the local dev.db, local sqlite only: `owner@gmail.com` as owner, `admin@gmail.com` as administrator, plus principal, vice principal, teacher, student, parent, accountant, office staff, librarian seeds in `prisma/seed.ts`. Passwords equal email in dev and must not be committed; rotate any password previously committed here. Signup API is `POST /api/auth/sign-up/email` with JSON body `{ email, password, name }` and returns user with assigned role.
- Verified after the trim, all green: `bun lint:check` with typegen plus tsc plus eslint passed. Anonymous `/dashboard` bounces to the stub `/login` with body text exactly "Sign in" and no scroll overflow at 1440x900. API cookie sessions: student own home 200, foreign principal 307 back to `/dashboard/student`; administrator own home 200, foreign librarian 307 to `/dashboard/administrator`, with legacy `/dashboard/super-admin` redirecting to `/dashboard/administrator`. The same bounces hold in the browser context after a same-origin fetch sign in with `/dashboard/principal` and `/dashboard` both landing on `/dashboard/student`. Login and student stubs render centered on the silk background with zero spacing issues. The full 10 role home matrix with 200 own and 307 foreign, wrong password error, sign out, light and dark themes, and mobile 390 stacking were proven on 2026-11-02 before the trim; the guard and proxy engines are unchanged since except role renames.
- Role sweep trick for untested roles: sign in the librarian account via API, `UPDATE user SET role = ?` in `prisma/dev.db` (sqlite via `node:sqlite` in `bun -e`), then fetch the target page with the session cookie; each page load reads the fresh DB role.
- Console after the trim: only the React DevTools info line and HMR/Fast Refresh entries, zero errors or warnings.
- Screenshots after the trim: `.playwright-cli/login-stub.png`, `.playwright-cli/student-stub-trim.png`. The pre-trim set (`dashboard-super-admin.png`, `dashboard-student-dark.png`, `dashboard-student-light.png`, `dashboard-librarian-mobile.png`, `landing-dark-restored.png`, `dashboard-librarian.png`) shows the deleted UI and survives for history.

## Login mocks, 5 options (temporary, delete after build)

- Files: `mockups/login/index.html`, `v1-crown-card.html`, `v2-split.html`, `v3-header-minimal.html`, `v4-zenith-art.html`, `v5-mobile-support.html`. Served from repo root with `bunx serve -l 4599 .` and browsed at `http://localhost:4599/mockups/login/`. No app file is touched until one option is picked.
- Form shape is identical in all five so layout can be compared. Combined field is `#identifier` labelled Email or username with placeholder for email or admission number. Password is `#password` with `#toggle-password` Show and Hide button. Remember checkbox is `#remember-me` unchecked by default. Forgot link points to `/forgot-password`. Submit button is `#signin` and shows a spinner for about 1400ms in the demo script. Status line is `role=status` and states demo only with admin created accounts and no public signup.
- Brand mark is `../../public/logo-mark.png` relative to `mockups/login/`, dark meadow palette with primary green and gold accent, Inter headings and Geist style system body. Silk folds use blurred radial gradients matching `globals.css` dark values.
- Gotchas found in review. SVG `preserveAspectRatio="none"` stretches circles into ellipses, use `xMidYMid slice` for peak art. A split brand panel with `justify-content: space-between` leaves a large empty middle on tall viewports, centering the headline with a top pinned logo keeps the balance. Sticky bottom bars need `padding-bottom` on the shell so the footer note clears the bar, checked at 390 by 844.
- Screenshots: index menu plus v1 centered card, v2 split, v3 header minimal, v4 zenith art, v5 mobile at 390 by 844, then v2 and v4 rechecks after the spacing and ellipse fixes.

## Auth build verification (2026-11-06)

- `bunx prisma migrate dev --name add_username` and `--create-only` both fail in this harness with "Prisma Migrate has detected that the environment is non-interactive". Working fallback: `bunx prisma migrate diff --from-migrations ./prisma/migrations --to-schema ./prisma/schema.prisma --script`, write the SQL to `prisma/migrations/<ts>_add_username/migration.sql`, then `bunx prisma migrate deploy` and `bunx prisma generate`. Schema tightening (`role @default("student")`, `banned @default(false)`) stays intact.
- `react-hooks/purity` flags `Date.now()` even inside event handlers defined in a component. Fix used: move the minimum load timer to a module level `withMinimumLoad` helper outside the component. In `.tsx` the generic must be `<T,>` with trailing comma or the file fails to parse.
- Plain `bunx tsc --noEmit` without `next typegen` reports a stale typedRoutes error for new routes (e.g. `Link href="/forgot-password"`). Always run `bun lint:check` (typegen first) or `bunx next typegen` before `tsc`.
- `RoleSwitcher` renders a role badge (`<span>Student</span>`) for a single role and only a `<select id="role-switcher">` dropdown for multiple roles. Check the header text for the role label, not just a select element.
- Browser login verification without a known password: create a throwaway user via `POST /api/auth/sign-up/email` (needs `Origin` header), then sign in through the real login form with email or username to prove both paths.
- Auth screenshots from this pass: `.playwright-cli/auth-login.png`, `auth-dashboard-student.png`, `auth-forgot.png`, `auth-reset-token.png`, `auth-reset-notoken.png`. Console: 0 errors. Pre-existing warnings only: React DevTools info, HMR log, one Image aspect warning from `AuthCard` logo, one verbose password autocomplete hint on reset.
- Seed is dev-only: `prisma/seed.ts` refuses to run when NODE_ENV=production, and re-running it no longer resets `banned`.

## Shared dashboard shell (implemented 2026-11-24)

- Structure: `(dashboard)/layout.tsx` renders client `DashboardShell`, which owns collapsed and mobile drawer state and composes `DashboardSidebar`, `DashboardHeader`, and a shared `main` capped at `max-w-7xl` with `px-4 sm:px-6`. Sidebar state persists in `localStorage` under `zca-sidebar-collapsed` via `useSyncExternalStore` with a server snapshot of collapsed, so no hydration mismatch and no `set-state-in-effect` lint error. Drawer open tracks the pathname where it opened, so any navigation auto closes it, plus overlay click and Escape.
- Sidebar: desktop icon rail `w-16` collapsed by default with tooltips plus aria labels, `w-60` expanded with labels, sticky `h-svh`, hidden below `md`. Brand lives in the sidebar top as a two line wordmark when expanded and mark only when collapsed. Mobile drawer is a fixed overlay with brand and full labels.
- Header: single row with mobile menu button, desktop collapse toggle with `aria-expanded`, per-page `Breadcrumbs`, theme toggle, and profile menu. Role switching stays only inside the profile menu. No brand in the header.
- Links: `src/lib/dashboard-nav.ts` maps the active role to Dashboard plus its own workspace home, both existing pages only, so no dead routes. Active role derives from the pathname with fallback to the first stored role. Breadcrumbs are per page as Dashboard link plus current workspace plain text, set through `BreadcrumbTrail` context.
- Gotchas: `react-hooks/set-state-in-effect` errors on sync `setState` in effects and `react-hooks/refs` errors on ref reads during render. Fixes used: `useSyncExternalStore` for the persisted toggle and pathname-tracked drawer state instead of effects. The expanded sidebar truncates a single line wordmark at `w-60`, so the brand stacks as `Zenith Crown` plus `Academy`.
- Verified: `bun run lint` passed. API matrix of admin own 200, owner own 200, foreign bounces 307 to own home, legacy super-admin 307 to administrator, anon 307 to login. Headed browser at desktop and 390 widths: collapsed rail, expanded labels, drawer open plus link tap auto close, breadcrumbs, even gutters, console 0 errors 0 warnings.

## Dashboard shell fixes, toggle, brand, headers, surfaces

- Toggle sits flush against the sidebar edge with no left padding and square left corners, mobile hamburger goes flush the same way. The `max-w-7xl` cap was then removed entirely per the wide reference: header row and main are full width with even side gutters, toggle back in normal flow. Sidebar collapsed mark wraps in a fixed `size-10` box with `object-contain` since the rail content box is only 40px after padding while the mark at `h-9` runs about 61px wide.
- Page headers use a shared `PageHeader` with top-left title plus subtitle from the central `roleDescriptions` map beside `roleLabels`. All ten stubs render breadcrumb trail plus header with empty content below, no centered hero text.
- Sidebar, drawer, and header share the `bg-sidebar` surface with solid `border-sidebar-border` dividers so the shell reads as one frame around the content.
- Verified: `bun run lint` passed. Headed browser at desktop and 390 widths, dark and light themes: flush toggle, contained collapsed mark, expanded brand intact, top-left headers with subtitles, distinct shell surface with solid dividers, console 0 errors 0 warnings. Wide 1920 check after cap removal: header and content run edge to edge with the toggle glued to the rail.

## Shell symmetric 52px gutters (implemented 2026-11-25)

- `DashboardShell` main went from `pr-6 pl-[52px] sm:pr-8 sm:pl-[52px]` to a flat `px-[52px]` at all widths, and `DashboardHeader` row went from `pr-4 sm:pr-6` to flat `pr-[52px]`. The left toggle stays glued to the rail and the crumb text still lands at 52, so the verified title and crumb alignment holds.
- Probe against the layout viewport, not `innerWidth`, since headed Chromium classic scrollbars inflate `innerWidth` by 15 and fake a wider right gap. Desktop reads card left 116 (64 rail plus 52) with card and profile right gaps both exactly 52 and title to crumb delta 0. Mobile 390 reads 52 on all three. Document scroll width equals client width on both.
- Screenshots: `.playwright-cli/gutters-desktop.png`, `gutters-mobile.png`.

## Full data table swap (implemented 2026-11-25, user approved)

- Replaced the native table with a TanStack plus shadcn data table. New dependency `@tanstack/react-table` installed with bun after explicit user approval. New shadcn primitives `table`, `badge` and `checkbox` added with the CLI next to the other frozen primitives. All three primitives arrived with a wrong `from "cn"` import and were fixed to `@/lib/utils`.
- New files in `src/components/Admin/`: `UsersColumns.tsx` with column defs, sortable headers, status Badge, selection checkboxes and the disabled actions placeholder, plus `UsersDataTable.tsx` as a client table in manual pagination and sorting mode with URL driven state. Old `UsersTable.tsx` deleted. `page.tsx` parses and validates `sort` and `dir` params against an allowlist of name, username, email, role and created, default created ascending, and orders the Prisma query with id tiebreaker. Default sort params stay out of the URL.
- Installed TanStack is v9 with a new store based `useTable`, but the build uses the officially exported legacy `useLegacyTable` plus `legacyCreateColumnHelper` from `@tanstack/react-table/legacy` with `flexRender`, `SortingState` and `RowSelectionState` types from the package root, since that matches the documented data table pattern. Typing gotchas solved with the installed dts: column value generics go features first, so the sortable header uses a structural column type, and the columns array goes through `columnHelper.columns()` which types defs with `any` value, matching the library idiom.
- Verified: `bun run lint:check` passed. Headed browser as seed admin: 5 sort buttons present, name asc puts Accountant first and desc puts Vice Principal first with `sort` and `dir` visible in the URL, select all reports 10 selected on the page, invalid sort and dir fall back to the default list, mobile 390 keeps zero document level sideways scroll, console 0 errors 0 warnings. Screenshots: `.playwright-cli/datatable-desktop.png`, `datatable-selected.png`, `datatable-mobile.png`.

## Users list review fixes (implemented 2026-11-24)

- Toolbar search syncs from the live URL value during render, so footer Clear filters and back button no longer leave a stale query that the debounce re-applies. Render-time sync keeps the effect-free pattern that satisfies `react-hooks/set-state-in-effect`, and the debounce compares against the live URL value so role changes no longer double navigate. `hasFilter` trims the search text.
- `UsersDataTable` remounts via `key` on page, search, role, banned, sort and dir, so row selection resets with the rows per the Step 1 acceptance.
- Sorting back to default createdAt asc omits `sort` and `dir` from the URL, matching pagination links.
- Role filter matches comma separated storage with comma boundaries, since plain `contains` would confuse principal with vice_principal. Display stays on the primary role.
- `where` and clauses typed as `Prisma.UserWhereInput` with an `isSortKey` guard.
- Removed unused direct `cn` dependency with `bun remove cn`. Shadcn primitives use `@/lib/utils`.
- Verified: `bun run lint:check` passed (typegen plus tsc plus eslint).

## Administrator Step 1 users list (implemented 2026-11-25)

- Route: `src/app/(dashboard)/dashboard/administrator/users/page.tsx` as Server Component guarded by `requirePermission("system:manage")`, plus `loading.tsx` skeleton, client `UsersToolbar` (search with 300ms debounce, role and banned selects) and server `UsersTable` (columns name, username, email, role, status, created plus disabled actions placeholder, empty state, prev and next links) in `src/components/Admin/`, later replaced by the full data table swap above. Page size 10, order by createdAt asc plus id asc, total plus rows in one where clause, out of range pages clamp. Effective banned is computed per row as banned true plus expiry null or future. Nav adds a Users link gated on `system:manage` in `src/lib/dashboard-nav.ts`.
- Search is plain Prisma `contains` on name, email and username with no insensitive mode. Mixed case `ADMIN` matched the admin row on libSQL SQLite, ASCII case folding holds, no raw SQL needed.
- Dynamic hrefs need `as Route` casts for `router.replace` and `Link` with query strings under typedRoutes, same as the existing guards pattern.
- Lint gotcha: syncing props into state with `useEffect` + `setState` trips `react-hooks/set-state-in-effect`. Fixed by deriving role and banned directly from `useSearchParams` and keeping only the search text as local state.
- Real bug found and fixed: an `sr-only` span inside the actions `th` is absolutely positioned against the viewport from inside a table cell and stretched `documentElement.scrollWidth` to 789 at 390 widths with nothing visible painted. Bisected through thead, tbody, min width, silk, scrollbars and every ancestor before landing on the 1px span. Fix is `aria-label="Actions"` on the empty `th` instead of the span. Never put `sr-only` content inside `th` or `td` in a horizontally scrolling table.
- Verified: `bun run lint:check` typegen plus tsc plus eslint passed. Headed browser as seed admin: list shows 10 of 10, mixed case search 1 of 1, role filter 1 of 1, banned filter empty state, `?page=99` clamps to page 1 of 1, student is bounced to `/dashboard/student`, typing in search rewrites the URL with debounce and resets to page 1, mobile 390 stacks with internal table scroll and zero document level sideways scroll. Screenshots: `.playwright-cli/step1-users-desktop.png`, `step1-users-search.png`, `step1-users-mobile.png`. Console 0 errors 0 warnings on the final pass. Seed passwords equal email, reseeded once when the local admin password was out of sync.
- Note: `bunx @playwright/cli run-code --filename` scripts must be deleted after each check, and the dev server on port 3000 stays running for the next step.

## Login mocks deleted and header Sign in check (2026-11-06)

- Deleted `mockups/login/` (all six HTML files). `mockups/` held only that folder, so the now empty parent was removed too; `git status` no longer lists `mockups/`.
- Header `Sign in` link (`href="/login"`) sits next to `ThemeToggleButton` at both widths with no overlap. At 390 the home link and Sign in bounding boxes abut exactly (0px gap), the middle whitespace is only the inner padding, so any future header growth will collide first on mobile.

## Sidebar content gap (2026-11-24)

- First try was `gap-4` on the `DashboardShell` outer row. It gave a 16px background strip but broke the frame: sidebar `border-r` and header `border-b` no longer met, leaving a notch at the corner.
- Final choice is the connected frame: outer row has no gap, sidebar border meets the content edge. Space lives inside the content: `main` uses `py-6 pr-6 pl-[52px] sm:pr-8 sm:pl-[52px]`, and the header breadcrumb wrapper keeps `pl-2` while the collapse toggle stays flush to the sidebar.
- The 52px left value equals toggle 36px plus header `gap-2` 8px plus crumb `pl-2` 8px, so crumb text and page title share the same left edge. Probe reads delta 0px at 929px and at 390px widths. Right gutters stay `pr-6 sm:pr-8`.
- Probe after the fix: frame gap 0px, main left padding 52px. Console 0 errors.
- Gotcha: editing the shell class while the dev server holds a stale render shows a hydration mismatch with server HTML missing the new class and the spacing measures 0px. Restarting `next dev` clears it back to 0 console errors.
- Review fixes: `resolveActiveRole` matches the URL segment after `/dashboard/` so nested routes and trailing slashes keep the right sidebar; `normalizeRolePart` also accepts hyphenated slugs and warns on truly unknown values instead of silently falling back to student; `BreadcrumbTrail` deps use the serialized items so inline array literals cannot refire the effect; crumb list keys are index qualified; `BreadcrumbItem.href` is typed as `Route`.

## Permissions plus multirole plus audit build 2026-11-24

- `permissions.ts` now carries singular `Permission`, fixed `ROLE_PERMISSIONS` mirroring `ac`, plus `can` and `hasPermission` with union across comma roles. `parseRoleNames` dedupes while keeping order.
- `guards.ts` adds `requireAnyRole`, `requirePermission` redirecting to own first home, and `assertPermission` throwing `ForbiddenError` for actions.
- `dashboard-nav.ts` lists every held workspace via `getDashboardLinks` stored role input with optional `requiredPermission` filter. `resolveActiveRole` is strict and falls back when the URL slug is not held. `DashboardShell` passes stored role only.
- `AuditLog` model in schema plus `20261124165957_add_audit_log` migration, helper `src/server/audit.ts` fail closed with optional transaction client and secret redaction. All gated mutations must call it, reads never do. Better Auth admin writes stay a known gap.
- Proof boundary is the administrator page on `system:manage`, held by administrator only today.
- Verified: `bun run lint` passed, `lint:check` typegen plus tsc plus eslint passed after Json input fix. Headed login renders with 0 errors and 1 pre-existing logo sizing warning, unauthenticated `/dashboard` bounces to `/login`. Unit probes show multirole links, strict fallback, and redacted audit write then cleanup.
