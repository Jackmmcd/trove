# Trove Redesign: Audit and Implementation Plan

Companion to [trove-product-overview.md](trove-product-overview.md), which describes every screen as a user sees it. This document covers the code behind those screens, what to keep, what's broken, and the order to change things in.

**Status labels:** **Confirmed** = read in the code during this audit. **Assumed** = inferred, or taken from the overview without re-checking. **Done** = fixed in this pass.

---

## 1. Architecture (confirmed)

| Layer | What's there |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript. Pages are mostly `'use client'` components that fetch from `app/api/*`. |
| Auth | Supabase Auth. `proxy.ts` → `utils/supabase/middleware.ts` gates every page and API, except `/api/cron`, `/api/advisor/corpus`, and the public Analyst endpoints. Email allowlist in `lib/access/`. |
| Account isolation | `lib/broker/owner.ts` (`isBrokerOwner`) is the single rule: the owner gets Tastytrade and everyone else gets `paper_positions`. `lib/broker/guard.ts` enforces it in the brokerage routes. |
| Data | Supabase Postgres via a service-role client (`lib/supabase/admin.ts`, RLS bypassed, so every route must scope by `user.id` itself). Tables: `funds` (shared rows, `user_id IS NULL`), `holdings` (per fund and quarter, including `period_end`, `filing_date`, `put_call`, `cusip`, `issuer_name`, `instrument_type`), `user_watched_funds` (follows), `basket_purchases` (`orders` JSONB, `sold_at`, `sale_orders`), `fund_theses`, `stock_analyses`, `securities`, `security_fundamentals`, `security_embeddings`, `fund_embeddings`, `advisor_*`, `analyst_usage`. |
| Ingestion | `lib/sec-api/client.ts` (EDGAR, CUSIP → ticker via OpenFIGI) → `lib/services/fund-sync.ts` (writes one quarter atomically, generates the thesis). `lib/services/fund-profile.ts` is a read-through cache: opening a fund loads or refreshes it. |
| Scheduling | `app/api/cron/sync/route.ts` → `lib/cron/sync-funds.ts#dailySync`. **No schedule is configured**: `vercel.json` has no `crons`. Freshness depends entirely on page views and Sync buttons. |
| Discovery | `lib/funds/directory.ts` (73 curated funds, aliases, tags, on-demand flag), `useFundSearch` (instant directory + Voyage semantic), `/api/sec/search` (EDGAR filers), `/api/search` (tickers + funds for the nav), `lib/ai-search.ts`. |
| Analyst | `lib/advisor/*`. Tools: `get_fund_detail`, `get_ticker_holders`, `get_stock_analysis`, `get_market_snapshot`, `find_institutional_holders`, `get_user_portfolio`, `search_securities`. Corpus snapshots and ticker allowlist (`lib/analyst/tickers.ts`) keep it grounded. |
| UI system | Inline styles throughout. Colours are CSS variables named after their dark-theme hex (`var(--bg-ff8c00)`), remapped for light theme. There are no shared Button/Card/Table components; each file redefines a local `B` palette and button styles. |
| Tests | Jest: `lib/` suites pass. Component suites (Dashboard, FundList, Navigation) and `app/api/__tests__` were **already failing** before this pass because they assert old UI text, and Jest also picks up the Playwright `e2e/*.spec.ts`. `tsc --noEmit` is clean. |

## 2. Current user journeys

- **Follow:** Funds tab → + Add fund → search → Follow → card loads from SEC. *Works, but it's the only place to follow.* (**Done:** follow is now also on the fund page.)
- **Research a fund:** card → Full portfolio → `/fund/[cik]`. Rich page: thesis, sectors, instruments, new positions, weight changes, full table.
- **Research a stock:** you reach `/stock/[t]` (price, trade, news, fundamentals) or `/company/[t]` (fund ownership), depending on where you clicked. Neither page is complete.
- **Buy a basket:** fund card → select rows → Buy basket → sheet → per-stock orders from the browser.
- **Watch:** Portfolio (folded basket rows) and Baskets page.
- **Hear about changes:** effectively absent. `/api/notifications/13f` exists, but it's only shown on unlinked `/rebalance`, and it was wrong (see 4.2).

## 3. Worth preserving (don't regress these)

1. Puts and calls treated honestly: labelled, kept out of baskets and sector charts, weight overstatement explained (`buyable()` in FundList, `OptionBadge`, `stats.puts`).
2. Period-end quarters: `holdings.quarter` is the period the positions describe, not the filing date.
3. Atomic quarter writes with rollback in `fund-sync.ts`.
4. Analyst grounding: a ticker allowlist from real holdings, theme search over company descriptions, and invented tickers left unlinked.
5. Server-side account choice (`isBrokerOwner`) and ownership-checked basket mutations.
6. Read-through fund cache with explained waits.
7. Mobile shell: bottom tabs, More sheet, full-screen search, safe areas.

## 4. Correctness, data-integrity and safety findings

| # | Finding | Status |
|---|---|---|
| 4.1 | **Basket could buy stocks never shown.** `/api/funds` returns the top 50; FundList preselected all 50 but rendered 15. | **Done**: the selection and the basket are limited to the 15 rows shown, and the copy says so. |
| 4.2 | **Phantom "new filing" alerts.** `/api/notifications/13f` took the quarter from the *filing date* (always one quarter after the period) and compared it with stored period quarters, so every current fund alerted. It also didn't scope to shared rows. | **Done**: uses the EDGAR `reportDate`, scoped to `user_id IS NULL`. |
| 4.3 | **Partial basket execution left orphan positions.** The basket was recorded only after the last browser-side order. A closed tab meant real positions with no basket. | **Done**: the basket is recorded before the first order (legs `queued`), each leg is written back as it settles (`PUT /api/baskets`), and an all-failed basket is deleted. If the record can't be created, no orders are placed. Readers already count only `done` legs. *Remaining:* execution is still client-driven. A server-side job with broker reconciliation is the full fix (Phase 5). |
| 4.4 | Whole-share baskets leave a small budget idle with no guidance. | **Done**: the sheet says how many stocks get 0 shares and suggests fractional shares. |
| 4.5 | **Portfolio chart replays today's holdings over the past year** (`/api/tastytrade/portfolio-history`), but it's presented as if it were account history. | Confirmed. `Dashboard.tsx` has uncommitted work in progress, so it's left untouched. Fix: label it "How today's holdings performed". |
| 4.6 | Paper fills at Yahoo `regularMarketPrice` (`/api/paper/order`), while valuation uses the settled close (`lib/market/close.ts`). This produces an instant phantom P&L. | Confirmed in code. Fix: value same-day fills at the fill price until the next close, or fill at the same quote source. |
| 4.7 | `/company/[t]` "Your position" reads `paper_positions` only (`/api/advisor/stock`), which is wrong for the owner. | Confirmed. Fix: route through `isBrokerOwner`. This disappears once the company pages merge (Phase 4). |
| 4.8 | `/recommendations` queries `funds.user_id = userId`, but follows live in `user_watched_funds` against shared funds. It likely always comes back empty. | Confirmed in code; effect on real data **assumed**. |
| 4.9 | `/api/cron/sync` **fails open**: auth is checked only if `CRON_SECRET` is set. Anyone can trigger a full SEC sync. | Confirmed. Not changed, because an external cron may rely on it. Fix: require the secret when `NODE_ENV=production`. |
| 4.10 | Service-role client everywhere: any new route that forgets `.eq('user_id', user.id)` leaks data. | Structural risk. Mitigate with a `requireUser()` + `ownRow()` helper and a test per user-scoped route. |
| 4.11 | Rebalance proposes $0 buys for unowned tickers. | From the overview; **assumed**, not re-checked. |
| 4.12 | Weight change is shown as "change" with no share-count delta. A rising weight can just mean the price went up. | Confirmed (`ProfilePosition.change` is weight pp). Fix: add the prior quarter's shares to the profile and show both (Phase 4). |

## 5. Target information architecture

| Destination | Route | Built from |
|---|---|---|
| **Home** | `/home` (the post-login redirect moves here; `/dashboard` stays) | New `InstitutionalBriefing` from followed funds' latest vs prior quarter (new, exits, share-count changes); `ThemeEntryPoints` (theme search); a compact `PortfolioSnapshot` (an extract of Dashboard's header) |
| **Explore** | `/explore` with `?tab=funds\|companies\|themes`; `/fund` redirects to `/explore?tab=funds` | Merges the `/fund` directory, the Add-fund search (`useFundSearch` + EDGAR + CIK), `/recommendations` (as the Companies tab, once 4.8 is fixed) and AI Search (as the natural-language mode). One `UnifiedSearch` component replaces the nav search, the Add-fund panel and AI Search. |
| **Analyst** | `/advisor` (unchanged) | Adds `?context=fund:<cik>` / `company:<t>` to seed the first prompt and starters |
| **Following** | `/following`; `/funds` redirects | FundList, minus basket UI, plus filing freshness and a "what changed" link. Company and theme follows need new tables (§6). |
| Secondary (More sheet on mobile, account menu on desktop) | `/dashboard` (Portfolio), `/baskets`, `/rebalance`, `/news`, `/disclosures` | Unchanged pages, now linked |

**Company:** one canonical route, `/company/[ticker]`, gains price/chart/trade/news/fundamentals from `/stock/[ticker]`. `/stock/[ticker]` becomes a redirect (`next.config.ts` `redirects()`), so Analyst links, basket rows and portfolio rows keep working.

**Fund profile order:** identity + Follow + Ask Analyst → "Positions as of Sep 30 · public Nov 14" line → thesis (labelled AI interpretation) → What changed (new / exited / shares ± / weight ±) → composition → full table → contextual Analyst → Buy basket (secondary, opens the same BasketModal).

## 6. Database changes

| Change | Why | Phase |
|---|---|---|
| none | Ledger fix (4.3) uses the existing `orders` JSONB | 1 ✓ |
| `user_follows (user_id, kind 'company'\|'theme', key, created_at)` | Following companies and themes. Keep `user_watched_funds` as is. | 5 |
| `filing_events (fund_id, quarter, period_end, filing_date, detected_at)` + `user_seen_events (user_id, event_id)` | Notifications that a sync writes once and each user marks seen | 5 |
| `basket_purchases.status` (`placing`/`open`/`closed`) | Explicit state once execution moves server-side | 5 |
| `vercel.json` `crons` → `/api/cron/sync` (with the secret enforced) | Filing freshness without page views | 5 |

## 7. Shared components to create (Phase 2)

`lib/ui/tokens.ts` (semantic names over the existing CSS variables: `surface`, `border`, `accent`, `gain`, `loss`, `muted`) · `Button` (primary/ghost/danger) · `Panel` · `Badge` (PUT/CALL/PAPER/NEW) · `DataTable` (with the existing `r-cards` mobile reflow) · `AsOf` (period end + filing date + lag tooltip; used anywhere a 13F number appears) · `EmptyState` · `Toast` (replaces three copies and the `confirm()` dialog). Monospace only for figures; a sans-serif for prose and headings.

## 8. Phased plan

| Phase | Scope | Key files | Size |
|---|---|---|---|
| **1. Correctness** | ✓ 4.1–4.4. Remaining: 4.5 (after your Dashboard WIP lands), 4.6, 4.7, 4.8, 4.9. Repair stale component tests; exclude `e2e/` from Jest. | `Dashboard.tsx`, `api/paper/order`, `api/advisor/stock`, `lib/recommendations/analyzer.ts`, `api/cron/sync`, `jest.config.js` | S–M |
| **2. Nav + design system** | New nav (Home / Explore / Analyst / Following + More), linked secondary pages, the shared components from §7, the `confirm()` → sheet replacement. Old routes keep working. | `Navigation.tsx`, `app/layout.tsx`, `lib/ui/*`, `globals.css` | M |
| **3. Home + Explore** | Briefing from real quarter-over-quarter deltas with honest empty states; UnifiedSearch; directory tabs. | new `app/home`, `app/explore`, `lib/services/briefing.ts` (reuses `fund-profile` diff logic) | L |
| **4. Profiles** | Fund page reorder + Ask Analyst + Buy basket + share-count deltas; merge stock into company; `/stock` redirect; Analyst `context` param. | `app/fund/[cik]`, `app/company/[ticker]`, `app/stock/[ticker]`, `fund-profile.ts`, `AnalystFull.tsx` | L |
| **5. Following + filings** | `/following`, company/theme follows, `filing_events`, cron schedule, server-side basket execution and reconciliation against broker positions. | migrations, `fund-sync.ts`, `api/cron`, `api/baskets` | L |
| **6. Polish** | Responsive pass, a11y, loading states, delete superseded components (AISearch panel, Add-fund panel, `/fund` directory page). | — | M |

**Dependencies:** 2 before 3 and 4 (shared components). The 4.8 fix before Explore's Companies tab. `filing_events` (5) is what makes Home's briefing say "new" accurately. Until then Home compares the latest two stored quarters and says when each was filed.

**Risks:** Merging two pages and changing the default route could break deep links (mitigated by redirects plus e2e tests). Briefing quality depends on two quarters per fund; only the 25 synced funds reliably have them. Server-side basket execution touches real money, so it should ship behind the owner flag first and be tested only with paper accounts.

## 9. Changed in this pass

- `app/components/FundList.tsx`: baskets limited to visible rows (4.1).
- `app/components/BasketModal.tsx`: record-first ledger, per-leg write-back, empty-basket cleanup, record-failure messages, fractional-shares hint (4.3, 4.4).
- `lib/baskets/ledger.ts` + test: ledger helpers and validation.
- `app/api/baskets/route.ts`: ledger validation on create; `PUT` (progress) and `DELETE` (unfilled only), both ownership-checked.
- `app/api/notifications/13f/route.ts`: period-based quarter comparison (4.2).
- `app/api/funds/[cik]/route.ts` + `app/fund/[cik]/page.tsx`: follow status endpoint and Follow/Following button on the fund page.

### Second pass: AI in one place, faster first load

- **AI Search removed as a separate feature.** The nav search is now "Search or ask": ticker and fund suggestions, plus an "✦ Ask Analyst" row. A phrase that isn't a fund name goes to the Analyst. `/advisor?q=` asks the question on arrival. "Ask Analyst" buttons on fund, stock and company pages pass the page's subject. `AISearch.tsx`, `/api/ai-search` and `lib/ai-search.ts` are deleted; the Analyst's tools cover themes and headlines.
- **Load time.** (1) `lib/auth/session.ts` reuses the Tastytrade access token until a minute before it expires, instead of an OAuth refresh on every brokerage call. (2) `lib/market/candles.ts` caches daily closes (Next data cache plus memory, 10 min) for the chart, quotes, paper valuation and the week-change route. The week-change route no longer makes one Polygon call per symbol in sequence. (3) The dashboard draws the last visit's numbers from a per-user browser snapshot (`lib/client-snapshot.ts`, cleared on logout), shows "UPDATING…", and refreshes behind them. Focusing the tab no longer blanks the page, and the chart no longer waits on the quotes.

Verified: `tsc --noEmit` clean; `jest lib` 7/7 suites, 64 tests pass; `next build` succeeds; cached candles checked against live Yahoo. **Not verified in a browser**, and no order was placed. The basket flow needs a paper-account run-through before it's trusted.
