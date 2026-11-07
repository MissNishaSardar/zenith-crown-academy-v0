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

- Route groups: `src/app/(public)/` (landing at `/` with the site Header; `layout.tsx` holds Header), `src/app/(auth)/` (bare pass-through layout, no site header; only `/login`), `src/app/(dashboard)/` (session guarded `layout.tsx` wrapping children in a bare `flex min-h-svh flex-col` container, plus `dashboard/` with role redirector and 9 role home stubs). The inner `(dashboard)/dashboard/layout.tsx` sidebar shell was deleted; the top group layout is the only session guard layer.
- Roles (better-auth admin plugin, access control): `super_admin`, `principal`, `vice_principal`, `teacher`, `student` (signup default via `defaultRole`), `parent`, `accountant`, `office_staff`, `librarian`. Definitions and URL slug map live in `src/lib/auth/permissions.ts`; guards live in `src/server/guards.ts` (`requireSession`, `requireRole` wrapped in React `cache`). Database blocks direct URL access per role; middleware layer is `src/proxy.ts`.
- Gotcha: Next 16 renamed middleware to proxy. The file is `src/proxy.ts` exporting `proxy` (not `middleware`), matcher constants only, Node.js runtime by default. It only does cookie presence checks; real authorization stays in the guards.
- Gotcha: `nextCookies()` must be the LAST plugin in the better-auth `plugins` array, otherwise a server warning appears and cookies can be dropped.
- Gotcha: better-auth admin endpoints (for example `/api/auth/admin/set-role`) reject requests without an `Origin` header (`MISSING_OR_NULL_ORIGIN`); PowerShell curl style tests must add `-Headers @{ Origin = 'http://localhost:3000' }`.
- Gotcha: with `typedRoutes`, dynamic hrefs (`redirect()`, `Link href={\`/dashboard/${slug}\`}`) fail tsc as plain strings; cast with `as Route` (`import type { Route } from "next"`). Still applies in `src/server/guards.ts`and`(dashboard)/dashboard/page.tsx`.
- Trimmed to bare stubs 2026-11-04 per scope call: `/login` renders one centered "Sign in" heading and the auth layout is a pass-through. The RHF + zod login form (`src/lib/zodSchema.ts`), inner sidebar shell, `SignOutButton`, and `shadcnui/input` were deleted after a fully verified run on 2026-11-02. No sign in UI exists; browser checks authenticate with a same-origin `fetch POST /api/auth/sign-in/email` inside `run-code` (status 200 sets the session cookie), and sign out is `POST /api/auth/sign-out` or a fresh browser context.
- Test accounts in the local dev.db (local sqlite only): `superadmin@zenithcrownacademy.test` (super_admin), `student1@zenithcrownacademy.test` (student from signup default), `librarian@zenithcrownacademy.test` (promoted via set-role). Passwords are redacted and must not be committed; rotate any password previously committed here. Signup API: `POST /api/auth/sign-up/email` with JSON body `{ email, password, name }` returns user with assigned role.
- Verified after the trim (all green): `bun lint:check` (typegen + tsc + eslint) passed. Anonymous `/dashboard` bounces to the stub `/login` with body text exactly "Sign in" and no scroll overflow at 1440x900. API cookie sessions: student own home 200, foreign principal 307 back to `/dashboard/student`; super admin own home 200, foreign librarian 307 to `/dashboard/super-admin`. The same bounces hold in the browser context after a same-origin fetch sign in (`/dashboard/principal` and `/dashboard` both land on `/dashboard/student`). Login and student stubs render centered on the silk background with zero spacing issues. The full 9 role home matrix (200 own, 307 foreign), wrong password error, sign out, light and dark themes, and mobile 390 stacking were proven on 2026-11-02 before the trim; the guard and proxy engines are unchanged since.
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

## Login mocks deleted and header Sign in check (2026-11-06)

- Deleted `mockups/login/` (all six HTML files). `mockups/` held only that folder, so the now empty parent was removed too; `git status` no longer lists `mockups/`.
- Header `Sign in` link (`href="/login"`) sits next to `ThemeToggleButton` at both widths with no overlap. At 390 the home link and Sign in bounding boxes abut exactly (0px gap), the middle whitespace is only the inner padding, so any future header growth will collide first on mobile.
