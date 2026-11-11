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
- Gotcha: Next 16 renamed middleware to proxy. The file is `src/proxy.ts` exporting `proxy` (not `middleware`), matcher constants only, Node.js runtime by default. Since 2026-11-12 the matcher covers only `/dashboard` and `/dashboard/:path*`, and it still only does cookie presence checks. The auth pages (`/login`, `/forgot-password`) now validate the session themselves with `auth.api.getSession` and redirect signed in users to `/dashboard`. Real authorization stays in the guards. A stale cookie renders the login form instead of bouncing or looping.
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

## Dashboard sidebar build (2026-11-08)

- Added via `bunx --bun shadcn@latest add sidebar sheet tooltip separator -y -o`: `src/components/shadcnui/sidebar.tsx`, `sheet.tsx`, `tooltip.tsx`, `separator.tsx`, `input.tsx`, `skeleton.tsx`, `src/hooks/use-mobile.ts`. New files imported `cn from "cn"` and added a `cn` package to `package.json`. Fixed all to `from "@/lib/utils"` and removed `cn` with `bun remove cn` so the lockfile stays clean.
- `use-mobile.ts` as shipped calls `setState` synchronously in an effect and fails `react-hooks/set-state-in-effect` on lint. Rewrote to initialize from `window.innerWidth` in `useState` and subscribe only, no sync set in the effect.
- Shell: `src/lib/navigation.ts` holds per-role items with Lucide icon objects and `getNavGroups(storedRole)` merging dual roles plus General. `src/components/Layout/AppSidebar.tsx` is `"use client"`, `Sidebar collapsible="icon"` with logo in `SidebarHeader`, `SidebarMenuButton` with `tooltip={title}` and `render={<Link/>}` plus `closeMobile` via `setOpenMobile(false)`. No `SidebarFooter` profile. Role switching stays only in header `ProfileMenu` plus `RoleSwitcher`.
- `DashboardShell.tsx` wraps with `TooltipProvider` plus `SidebarProvider`, then `AppSidebar` plus `SidebarInset`. `src/app/(dashboard)/layout.tsx` stays a Server Component doing `requireSession()` and passes user data down. `DashboardHeader.tsx` is slim, no logo, `SidebarTrigger` plus breadcrumb `Dashboard / {roleLabel}` plus `ThemeToggleButton` plus `ProfileMenu`. No `max-w-6xl` centering so no centered void; `SidebarInset` is full width.
- Mobile: shadcn renders the sidebar as a `Sheet` dialog under 768px. Clicking a menu link calls `setOpenMobile(false)` so the drawer auto closes. Verified at 390 by 844: drawer opens with full labels, tapping Academic returns to the main view with the scrim cleared.
- Collapsed icon tooltips need a wait. `hover` then wait 600ms before screenshot or the portal tooltip is missed. `run-code` with `mouse.move` plus `waitForTimeout` then `screenshot` catches it.
- Login to verify: `bun run dev` in the background, `bunx @playwright/cli open --headed http://localhost:3000`, sign in as the seed principal `principal@gmail.com` with password equal to the email. Then `resize 1440 900` for desktop, toggle `Toggle Sidebar`, `resize 390 844` for mobile. Screenshots in `.playwright-cli/` are gitignored. Console is 0 errors with one pre-existing `logo-mark.png` aspect warning. Deleted `mockups/dashboard-sidebar.html` after the build and stopped the dev server.

## Login mocks deleted and header Sign in check (2026-11-06)

- Deleted `mockups/login/` (all six HTML files). `mockups/` held only that folder, so the now empty parent was removed too; `git status` no longer lists `mockups/`.
- Header `Sign in` link (`href="/login"`) sits next to `ThemeToggleButton` at both widths with no overlap. At 390 the home link and Sign in bounding boxes abut exactly (0px gap), the middle whitespace is only the inner padding, so any future header growth will collide first on mobile.

## Logo aspect warning fix (2026-11-08)

- Root cause was mismatched ratio in `AuthCard.tsx` (`108x64` vs true `954x561` at 1.7005) with `h-16 w-auto`, so rendered height matched the attribute while width did not, triggering the Next `width or height modified` warning. Fixed by using `954x561` plus `style={{ width: "auto" }}`.
- `Header.tsx` and `src/app/(public)/page.tsx` kept `954x561` but gained `style={{ width: "auto" }}` to match the Next suggested pattern.
- `AppSidebar.tsx` square `size-9` plus `object-contain` was replaced by a `relative size-9` wrapper with a `fill` `Image` and `sizes="36px"` plus `object-contain`, scoped to `size-8` in collapsed icon mode. The fill version with `priority` introduced a preload unused warning (`w=48`), so `priority` was removed. The final fill version preserves the square slot and 0 warnings with no text truncation.
- Verified at 1440x900 on `/`, `/login`, and `/dashboard/principal` expanded and collapsed as the seed principal `principal@gmail.com`: console 0 errors and 0 warnings on every route, screenshots show no logo clipping, no dead space, and no duplicate labels.

## Custom 404 page (2026-11-08)

- Added `src/app/not-found.tsx` using the `AuthCard` card shell. The Next default 404 was near white text on the light silk and unreadable. The card uses `bg-card` with `text-card-foreground` plus `text-muted-foreground` and `text-primary` tokens, so contrast is strong in both themes.
- Verified at 1440 by 900 in dark and light and at 390 by 844 on `/unknown-route` and `/dashboard/principal/academic` as the seed principal: title `Page not found | Zenith Crown Academy`, HTTP 404 is the only console error, 0 warnings, no aspect warning on the logo, buttons stack vertically on mobile, no overlap or dead space.

## Error boundaries and dashboard loading (implemented 2026-11-10)

- Added `src/components/ErrorState.tsx`, a shared 404-styled card shell with props eyebrow, title, description, onRetry plus retryLabel, secondaryLabel plus secondaryHref, and an `embedded` flag. `src/app/error.tsx`, `src/app/global-error.tsx`, and `src/app/(dashboard)/error.tsx` compose it; `src/app/(dashboard)/loading.tsx` is a stat card plus bar panel skeleton on the existing `Skeleton`.
- global-error renders its own html and body, imports `./globals.css`, and hardcodes the `dark` class plus the three font variable classes from `@/lib/fonts`, because the root layout is bypassed when it renders.
- Typed routes gotcha hit again: link hrefs typed as plain `string` fail `tsc` with TS2769 under typedRoutes. `ErrorState` types `secondaryHref?: Route` imported from `next`; literals like `/` and `/dashboard` then typecheck at every call site with no casts.
- Next 16.4 loading behavior, verified empirically: a client-side navigation to a route that is warm in the router cache keeps the stale page on screen with a dev-only "Rendering..." pill and does not swap to `loading.tsx`. The `loading.tsx` fallback does render when content streams, proven with a temp page that awaited 3 seconds and a document navigation to it. So the skeleton guards real streams, and warm re-navigations rely on the pending pill.
- Finding: unknown leaf sub-routes under a role page, for example `/dashboard/principal/academic`, render the ROOT 404 page with no dashboard shell at all (snapshot showed no sidebar and no header). The dashboard breadcrumb is plain text, not a link, so the only real in-shell client navigation from a role page is the sidebar `Overview` link.
- Route interception gotchas: aborted prefetch requests make `route.continue()` throw "Route is already handled", so wrap continue in try and catch. Inline regex in `run-code` dies with "Invalid regular expression flags" from shell quoting, always use `run-code --filename`.
- Boundary probes used temp throw routes, `dashboard/throwaway-error-test`, `dashboard/principal/loading-check`, and `(public)/throwaway-error-test`, all created and deleted in the same session. Results: dashboard error card rendered with the sidebar alive, Overview link present, retry stayed in the boundary while the throwaway kept throwing, and Go to dashboard landed on `/dashboard/principal` through the redirect hub. Root error card rendered standalone with the silk background behind it.
- Dev versus production: Next dev adds an error pill and may log "Encountered a script tag while rendering React component" when a 500 document streams; both are dev-only artifacts around the boundary card.
- global-error was typechecked and compiled but never browser triggered, since triggering it requires a throw inside the root layout, which blanks the whole app in dev and was not worth the temporary instability.
- Final state: `bun lint:check` green before and after cleanup, console audit contained only expected throwaway errors, browser theme restored to dark default, dev server and browser closed. `.gitignore` gained `/Ultimate Plan.md` from earlier user work, left untouched.

## Review fixes on error boundaries and loading (2026-11-10)

- Error boundary prop typing pinned to the docs contract: all three boundaries (`src/app/error.tsx`, `global-error.tsx`, `(dashboard)/error.tsx`) now type `error` as `unknown` instead of `Error & { digest?: string }`. The bundled error.md says a value thrown in a Client Component is passed as-is and may not be an Error, so reading message or digest later must narrow first.
- `(dashboard)/loading.tsx` reworked from the stat card plus bar panel skeleton to a single centered Skeleton bar (`h-9 w-72`) with the same axis centering and padding as the current placeholder role pages, so the fallback silhouette matches what renders next instead of a stat dashboard that does not exist yet.
- Hub flash probe (review finding) measured as the seed principal by clicking the sidebar brand link into the redirect hub with a MutationObserver watching `main[aria-busy]`: the skeleton never appeared, `busySeen false` across two runs; the URL flips to `/dashboard` for about 130 to 250ms and then settles on `/dashboard/principal`. No route restructure needed.
- Runtime rechecks with temp routes `dashboard/loading-check` (5s await) and `dashboard/throwaway-error-test` (throw page), both deleted in session: the streamed slow page showed the centered skeleton bar with the sidebar and header intact and then swapped to the real heading; retry stayed in the boundary on the throwaway while the shell stayed alive and the `Try again` reset worked with the `unknown` typing. Console audit contained only the throwaway errors and the known favicon.ico 404.
- `bun run lint` green after deleting both probe scripts. Dev server Next 16.4.3 confirmed in this session.

## Users and Roles module (2026-11-11, Super Admin phase 3)

- Route: `/dashboard/super-admin/users-and-roles` (server page,
  equireRole("super_admin"), reads searchParams and passes validated initialStatus/initialRole to the UsersTable client). Table data comes from the listAdminUsers server action in src/server/users.ts (Prisma directly, approved in this session, because the admin API supports only one ilterField per call so search + role + status cannot combine). Mutations (create, edit, roles, set password, ban, unban, delete, impersonate) all go through uthClient.admin.*.
- Sign in for browser checks: `admin@gmail.com` / password equal to email. A leftover next dev from the user's session already holds port 3000 (PID 5828), a second `bun run dev` exits with "Another next dev server is already running", so browse the running server.
- Create dialog: roles picker shows the 8 non super roles, defaults to student, the second slot only appears for parent or teacher and offers only the counterpart; generated 16 character password in a read only field with regenerate, plus Type your own mode. On success the reveal dialog shows the password once with copy. Verified: new user appears first in the list (18 then deleted back to 17 after cleanup).
- Edit dialog: Save disabled until `formState.isDirty`. Identity edits allowed on any row, roles locked on super admin rows (identity still editable). Verified: name edit, role change student to parent plus teacher pair, both badges render, audit rows `user.update` and `user.role_set` written.
- Ban dialog: Reason mandatory, Permanent/Temporary toggle, temporary defaults to 7 days with unit Select; success revokes sessions and the row shows `Until <date>` destructive badge. Banned sign in shows the reason and expiry at the login screen end to end (`bannedUserMessage` in `src/lib/auth.ts` plus the LoginForm 403 message passthrough). Verified on `verifyphase3`.
- Row actions menu: every item disabled on the admin's own row (tooltip "This is your own account." visible on hover of the wrapper span, example verified); on a plain user all five items enabled. There is only one super admin row in the seed data, so the non self super admin mid case is code covered only.
- Delete dialog: confirm button disabled until the exact email is typed; deletion removes the row (17 users before and after).
- Empty and filter states: `?status=banned` and `?role=parent` deep links work (Overview link target); with no banned users the page shows "No users match those filters" with a Clear filters button. Search by name or email filters live with a 500 ms debounce.
- Audit rows observed via `prisma.auditLog`: `user.create`, `user.ban`, `user.unban`, `user.update`, `user.role_set`, `user.password_set`. Test user `verifyphase3` was created, banned, unbanned, password set, re roles, deleted during this pass.
- base-ui Select does not render the selected item's children; every `SelectValue` needs a label function or it shows the raw value ("all", "student", "days").
- `bun run lint` green. Impersonate dialog renders and was cancelled in this pass because the Stop banner lands in phase 7. `bun lint:check` not run (heavy gate, on request only).

## Users and Roles: TanStack data-table migration (2026-11-11)

- `@tanstack/react-table@9.3.1` added with bun. v9 is feature-based: `tableFeatures({ rowPaginationFeature, rowSortingFeature })` in `UsersTable.tsx`, `createColumnHelper<DataTableFeatures, AdminUserRow>()`, `<table.FlexRender />`.
- Server-side everything: `manualPagination: true`, `manualSorting: true`, `rowCount` from the paged total, clamped `pageIndex` guard for deletions on the last page, `resetPageIndex` on filter or sort change. `listAdminUsers` gained `sortBy` (`createdAt`|`name`, default `createdAt`) and `sortDir` (default `desc`).
- The `@shadcn/data-table` registry item does not exist for this base-vega style; the composition comes from the official data-table guide (columns + data-table inside the feature file, not a registry block).
- Gotcha: `row.getVisibleCells()` is provided by `columnVisibilityFeature`, which we deliberately do not register (no column hiding); use core `row.getAllCells()` instead.
- Sortable headers: User (name) and Created (createdAtIso), toggle asc/desc with `column.toggleSorting(column.getIsSorted() === "asc")` and a three-state SortIcon. Verified: name asc and desc, createdAt toggle, both reset to page 1; pagination verified under sort; console 0 errors.

## Username uniqueness: inline error plus suggestions (2026-11-11)

- `src/server/users.ts` gained super_admin-guarded actions `isUsernameTaken` (exact match, optional `excludeUserId`) and `suggestUsernames` (`base<N>` then `base_<N>`, up to 3 available, single IN query; empty/normalized-empty bases return `[]`).
- Both `UserCreateDialog` and `UserEditDialog` check on username blur and again at submit time; the blur result is stored as `{ value, taken, suggestions }` and only applied when it matches the current input, so a stale answer can never overwrite a newer one (first attempt with a `useRef` counter was rejected by the React Compiler lint rule `react-hooks/refs`; the value-keyed state survives it and is race free by construction).
- Inline `FieldError` "That username is already taken." plus `aria-invalid`; up to 3 rounded-full outline chips under the field fill the value on click and clear the error. Edit dialog skips the check when the username is unchanged and passes `excludeUserId` (own username is never flagged, own value is always suggestion eligible).
- Test user `Blur Target` (`librarian1`) was created through the full flow (chip pick, create), exercised the edit-dialog exclusion path, then deleted with the typed-email gate. Database back to 17 users. Console 0 errors, `bun run lint` green.

## Users and Roles dialogs: field stacking plus reveal row (2026-11-12)

- Name and Username Field blocks in `UserCreateDialog.tsx` and `UserEditDialog.tsx` were lifted out of the `grid sm:grid-cols-2` wrapper; both dialogs now stack them full width in the form's own `flex flex-col gap-4` flow.
- `PasswordRevealDialog.tsx` now uses the same in-field trailing button pattern as `PasswordGenerateInput` manual mode: `relative` wrapper, `pr-12` on the read only Input, ghost `size=icon-sm` button absolute at `right-1.5 top-1/2 -translate-y-1/2`. The Done button sits in the same row as the field (field wrapper `flex-1 min-w-0`, Done `shrink-0`); `DialogFooter` is gone.
- `screenshot --filename x.png` saves to the repo root, not `.playwright-cli`; move the file there afterwards. Bare `screenshot` errors out.
- Element refs rotate wholesale between snapshots after a dialog closes or a menu opens (for example the row Actions button changes ref after Cancel); always re-snapshot before clicking instead of reusing refs.
- Verified with the seed super admin `admin@gmail.com` (password equal to email): create flow end to end (created Clip Test / cliptest1, copy button flipped aria-label to Copied), edit dialog shows the stacked layout, test user deleted afterwards, database back to 19 users. Console: only React DevTools info and HMR lines, 0 errors.

## Create dialog inline errors plus toast layer fix (2026-11-12, later same day)

- Base UI toasts render as role=dialog inside a `region "Notifications"`; with the viewport stuck at `z-50` (same as the dialog portal, which mounts later) they painted behind the modal. `ToastViewport` in `shadcnui/toast.tsx` is now `z-[60]` and the root `Toaster` timeout went back to 2000 at the owner's call.
- `UserCreateDialog.tsx` now carries a persistent destructive banner (`role="alert"`) at the top of the form for `admin.createUser` failures, cleared at the start of every submit. The submit-time username-taken toast was dropped because the inline FieldError already covers it. Audit-failure and success toasts stay as toasts and now render above modals.
- Verified failure path: duplicate email `admin@gmail.com` returns 400, banner shows "User already exists. Use another email.", dialog stays open with fields intact; the only console error is the expected HTTP 400 resource log. Success path: toast "User created" renders above the reveal dialog (screenshot `success-toast-above.png`). Test user `Dupe Email Check` created then deleted, count back to 19.
- Other SuperAdmin dialogs (edit, ban, confirm) still toast on error; they benefit from the z-[60] fix but have no inline banner.

## Role filter substring bug (2026-11-12)

- The `user.role` column stores comma separated slugs with no spaces (better-auth admin joins arrays via `roles.join(",")` in `dist/plugins/admin/routes.mjs`). Any `contains` on that column matches `principal` inside `vice_principal`, which leaked Vice Principal into the Principal filter on Users and Roles.
- Fix: `roleTokenWhere(role)` in `src/lib/auth/permissions.ts` builds an OR of exact match, `startsWith(role + ",")`, `endsWith("," + role)`, `contains("," + role + ",")`. `listAdminUsers` in `src/server/users.ts` applies it as `where.AND = [roleTokenWhere(safeRole)]` so the top level search OR stays untouched. The Super Admin overview student/teacher/parent counts in `dashboard/super-admin/page.tsx` use the same helper now (no wrong counts existed there, same latent pattern).
- Verified: Principal filter shows exactly Chhanda Sardar and Principal (1 to 2 of 2 users), Vice principal filter shows exactly 1, overview counts unchanged (Students 8, Teachers 1, Parents 1). `bun run lint` green.

## Search by username (2026-11-12)

- The Users and Roles search now matches name, email and username. Leading `@` characters are stripped in `listAdminUsers` (`searchTerm = trimmedSearch.replace(/^@+/, "")`), and an all-@ term falls back to no search filter. Placeholder is now "Search by name, email or username".
- Verified: `viceprincipal01` returns exactly Chhanda Sardar, `@viceprincipal01` same single row, `principal@gmail.com` matches both `principal@gmail.com` and `viceprincipal@gmail.com` (substring semantics, same as before). `bun run lint` green.

## Review fixes verification (2026-11-12, later same day)

- Overview "What needs my attention": the three module cards (Active sessions, Expired sessions, Audit actions in 24h) render static, no link role, no ArrowRight, hints "Arrives with the Sessions/System Health module"; Banned users card keeps the link and arrow. StatCard now has `href?` and renders a plain div without it.
- Username rules now mirror the username plugin (min 3, max 30, charset letters/numbers/dot/underscore) in a shared `usernameSchema` in zodSchema.ts. Verified on the running dev server: typing `ab` and blurring shows `role=alert` "Username must be at least 3 characters", `my-user` shows "Use only letters, numbers, dots and underscores", `ADMIN` resolves against stored `admin` (isUsernameTaken now lowercases) and shows "That username is already taken." with Try chips.
- Delete confirm dialog remounts per target (`key={deleteFor?.id ?? "closed"}` in UsersTable), so the typed email no longer survives a Cancel-and-reopen. Verified: typed `sentinel@example.com`, Cancel, reopen, input empty.
- Console audit after the fixes: React DevTools info and HMR Fast Refresh lines only, 0 errors. `bun run lint` green.
- Gotcha: the sidebar still links to unbuilt `/dashboard/super-admin/sessions`, `/system-health`, `/backups`, `/system-settings` (phases 4 to 7). Pre-existing, plan approved, expected 404 until those phases land.

## Auth-page session validation (2026-11-12)

- `src/proxy.ts` no longer matches `/login` or `/forgot-password`; the matcher is `["/dashboard", "/dashboard/:path*"]` only. The "has cookie, redirect auth pages to /dashboard" bounce was removed because it checked cookie existence only, which trapped stale sessions and could loop with `requireSession`.
- `src/app/(auth)/login/page.tsx` and `src/app/(auth)/forgot-password/page.tsx` are async server components that call `auth.api.getSession({ headers: await headers() })`. Valid session: `redirect("/dashboard")`. Otherwise the form renders as before.
- Why: a regular browser holding a Vice Principal session cookie was silently bounced from `/login` to `/dashboard/vice-principal`, so it looked like the super admin role had changed by itself. Playwright chromium uses a separate profile, which is why it never reproduced. Switching accounts in one browser still requires signing out from the avatar menu first; a valid session bounces `/login` to the dashboard.
- Stale cookie outcome now: `/login` renders the form, signing in overwrites the cookie, no bounce and no loop. Post-reset sessions are revoked, so `/login` after a password reset also renders the form.
