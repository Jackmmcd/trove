# Trove: The App as a User Experiences It

This document describes Trove from the user's side of the screen. It covers what the app is for, what each screen shows and does, where the information comes from, and where the experience currently falls short. It assumes no prior knowledge of the app, of 13F filings, or of the codebase. Read it top to bottom once; after that, the later sections work as a reference.

---

## 1. What Trove is, in one paragraph

Large investment firms in the United States (hedge funds, pension managers, university endowments, and the like) must tell the SEC every quarter which stocks they own. Those disclosures are called **13F filings**, and they are public. Trove turns them into something an ordinary investor can use. You can follow the funds you find interesting, see what they own and what they just bought or sold, and ask an AI analyst how your own ideas line up with where the big money is. If you like a fund's portfolio, Trove lets you buy a scaled-down copy of it, called a **basket**, in one action and track how that copy performs. The tagline on the home page sums up the ambition: *"Institutional intelligence, accessible to every investor."*

---

## 2. Concepts you need before anything else makes sense

Trove's screens assume you know these ideas. A new user usually doesn't, and much of the app's quality depends on how well it teaches them.

**13F filing.** A quarterly report from an institutional investor listing its US stock positions: which company, how many shares, and what they were worth on the last day of the quarter. It doesn't include short positions, cash, most bonds, or non-US holdings. It's a partial snapshot, not the whole portfolio.

**The 45-day lag.** A fund has up to 45 days after quarter-end to file. A filing that appears in mid-February describes the portfolio as of 31 December. By the time anyone sees it, the fund may already have sold. This lag is the most important caveat in the product. Trove mentions it in the Analyst's introduction and in the fund page's "As of" and "Filed" dates, but nowhere does it explain the lag in plain words to a first-time user.

**Quarter, period end, filing date.** Every holding Trove shows belongs to a quarter (for example, `2026-Q3`). The **period end** is the date the positions were true. The **filing date** is when the public could first see them. Trove stores both.

**CIK.** The SEC's ID number for a filer (for example, `0001067983` for Berkshire Hathaway). Trove shows it on fund cards and accepts it in search, but most users will never need it.

**Weight.** A holding's share of the fund's total reported value. A 12% weight means that position makes up 12% of what the fund disclosed. Weight signals conviction: a 10% position is a strong bet, while a 0.2% position may be a rounding error in a large fund.

**Puts and calls.** Some 13F lines are options rather than shares. A **put** is a bet that a stock will fall. A **call** is a leveraged bet that it will rise. The 13F reports options at the value of the shares they control, not what the fund paid, so their weights look much larger than the money actually at risk. Trove consistently marks these lines PUT or CALL, keeps them out of sector charts, and refuses to put them in baskets, because buying the stock to "copy" a put would be the opposite trade.

**Basket.** Trove's main action. You pick a fund (and optionally trim which of its holdings to include), name a dollar budget, and Trove buys every chosen stock in proportion to the fund's weights. The basket then appears as one line in your portfolio, with its own profit and loss.

**Paper vs live.** Trove can place real orders through a connected brokerage account (Tastytrade). Only the person who owns that brokerage connection sees and trades the real account. Every other user gets a **paper account**, a simulated account that starts with $10,000 of pretend money. Paper trades behave like real ones on screen but involve no money.

---

## 3. Who uses it, and how they get in

Trove is currently a **private deployment**, not a public product. There's no sign-up button. Access is controlled by an email allowlist: anyone not on it is signed out immediately and sees *"This account does not have access. Trove is a private deployment."*

There are effectively three kinds of people who encounter Trove:

| Who | What they can do |
|---|---|
| **Logged-out visitor** | See the one-sentence landing page. Open the **Analyst** demo if their email is on a separate demo allowlist. Open company pages linked from the Analyst. |
| **Signed-in user (paper)** | Everything in the app, trading against their own $10,000 simulated account. |
| **The owner** | Everything, but the portfolio, trades and baskets use the real Tastytrade brokerage account. |

Which account you see is decided by the server from your email address. The app never guesses this from the browser, because an earlier version once showed a stranger the owner's real positions after an error.

---

## 4. Look and feel

Trove is styled like a **financial terminal** (think Bloomberg): amber text on black, monospace type (Courier New), uppercase labels with wide letter spacing, thin borders, green for gains, red for losses, and cyan for secondary figures. It's dense on purpose. Some newer screens, such as the portfolio page, have moved toward a calmer, more consumer-app layout (one big number, a clean chart, simple rows), so the app currently mixes two visual philosophies.

There's a **light theme** and a **dark theme**, switchable with a toggle in the navigation. The website opens dark by default. If you install Trove to a phone's home screen, it opens light, because the phone app was requested in light. Your explicit choice always wins and is remembered.

Trove is built to work as an **installable phone app** (a progressive web app). On a phone:

- The top bar shrinks to the logo and a search icon.
- A **bottom tab bar** carries the main destinations, plus a **More** sheet that slides up from the bottom.
- Tables reflow into stacked cards.
- Search takes over the full screen.
- The layout respects the iPhone notch and home indicator.
- There's an offline fallback page.

---

## 5. A map of the app

### The navigation

The top bar on desktop (and the bottom tab bar on mobile) has four destinations:

1. **Portfolio**: your account, its value over time, and what you hold.
2. **Funds**: the funds you follow, with their top holdings and the basket-buy button.
3. **Baskets**: every basket you've bought, and how each is doing.
4. **Analyst**: the AI chat.

Next to these sit a **ticker-or-fund search box**, an **✦ AI Search** button, the theme toggle, and **Logout**. On mobile, the **More** sheet holds AI Search, Disclosures, the theme toggle and Logout.

Desktop also shows a **ticker tape** under the nav on the Portfolio and Funds pages: a scrolling strip of your positions with today's percentage change. It only appears for the owner (see section 9).

### Pages that exist but aren't in the navigation

Several complete pages can't be reached from any menu, only by typing their address. A user would never find them:

| Address | What it is |
|---|---|
| `/fund` | **Fund directory**: every fund Trove tracks (73 of them), searchable by name, manager, nickname or strategy. The only way in is the "← All funds" link on a fund page. |
| `/news` | **Daily briefing**: an AI-written market summary, news grouped by your positions, and a filterable news feed. |
| `/rebalance` | **Rebalance calculator**: alerts for new 13F filings, a comparison of your holdings against a blend of the funds, and basket purchase history. |
| `/recommendations` | **Institutional insights**: stocks ranked by how many followed funds hold them and how heavily. |
| `/demo` | A developer tool that frames the phone app inside a laptop browser. |
| `/terms`, `/privacy`, `/disclosures` | Legal pages. Disclosures is linked from the mobile More sheet and from AI Search. |

---

## 6. The journey, screen by screen

### 6.1 The landing page (logged out)

A visitor sees a black page with one sentence in large amber monospace type: *"Institutional intelligence, accessible to every investor."* A blinking cursor sits at the end. There's no explanation of what the product does, no screenshots and no feature list. This is deliberate: the reasoning in the code is that the Analyst explains the product better than marketing copy can.

The top bar has three things: the **TROVE** logo, an **Analyst** tab, and **Login**. Clicking Analyst replaces the page with a full-screen chat. The visitor first types their email; if it's on the demo allowlist, they can chat. Tickers the Analyst mentions become links to company pages, which open in a new tab so the conversation isn't lost.

**What to notice:** for a visitor who isn't on any allowlist, the landing page is a closed door with a nice sentence on it. That fits a private deployment, but it's the first thing to rethink if Trove ever opens up.

### 6.2 Login

A centred card with the TROVE logo, the subtitle "13F institutional tracker", email and password fields, and **Sign in**. The footer reads "Not financial advice · All trading involves risk". There's no "forgot password", no sign-up and no social login. A signed-in visitor is sent straight to Portfolio.

### 6.3 Portfolio (the home screen after login)

The page is organised around **one number**: the account's total value, shown large at the top. Above it, a label reads **PORTFOLIO** or **PAPER PORTFOLIO**. Paper accounts also get a green **SIMULATED** badge.

Under the number is the change over the selected time window (for example, "▲ $412.18 (+2.31%) Past month"), then a clean area chart with no axes or grid. The chart is interactive:

- **Hover** (or drag a finger) to read the value on any date. The marker glides along the line rather than jumping between points.
- **Press and drag** across a span to measure it. The span is shaded, and the readout shows the dollar and percentage change between the two dates.

Timeframe buttons (**1W, 1M, 3M, 6M, 1Y**) change the window. The chart is a reconstruction: it takes *what you hold today* and replays it over past prices. So it shows how your current holdings would have moved, not a true history of your account. If you bought something last week, the chart acts as though you held it all year. The code is aware of this, but the user isn't told.

Below the chart are **Buying power** and **Total return** (gain or loss across all positions against what you paid).

Then comes **Positions**, a list with one row per holding: symbol, shares and price on the left; value and gain or loss on the right. **Baskets are folded into a single row** (for example, "▶ BERKSHIRE HATHAWAY · Basket · 23 positions"), and tapping the row expands its individual stocks underneath. This matters because a $1,000 basket across 30 names leaves 30 tiny fractional positions in the brokerage account, and the basket, not those fragments, is the position the user actually took.

Tapping a **standalone position** opens the **trade sheet**. Tapping a **stock inside a basket** opens that stock's page instead. Same-looking rows, different behaviour.

**The trade sheet** (used throughout the app): a Buy/Sell toggle, the market price, a shares field (Sell shows your maximum), the estimated value, and **Preview order**. Then a confirmation step ("BUY 3 AAPL ~ $190.12 / share, est. $570.36") with **Back** and **Confirm**. Paper trades are labelled "Paper trade — no real money". Live trades carry a broker disclaimer. All orders are market orders; there are no limit or stop orders.

A **Logout** button also sits in the portfolio header, duplicating the one in the navigation.

### 6.4 Funds

This is the core of the product: the funds you follow.

The header reads **FOLLOWED FUNDS**, with a **Paper trading** badge for paper users. It has two buttons: **+ Add fund**, and (for the owner only) **Sync all**, which refreshes every followed fund from the SEC.

**Adding a fund.** **+ Add fund** opens a search panel with example queries as one-tap chips ("Ray Dalio", "Buffett", "quant funds", "activist", "tiger cubs"). Search works in layers, each appearing as you type:

1. **Directory matches** (instant): Trove's curated list of 73 funds, matched on name, manager, nicknames and strategy tags. "Ray Dalio's fund" finds Bridgewater.
2. **Matched by what they hold** (after a pause): funds whose portfolios resemble the query in meaning. "AI infrastructure" can surface funds heavy in chip and data-centre names even if their names say nothing about it. Each result shows the fund's largest holdings as evidence.
3. **Other 13F filers on SEC EDGAR**: when the directory has few matches, Trove searches the SEC's full filer list, so any filer can be followed.
4. **A CIK**: typing digits offers to follow that exact filer.

Each result has **+ Follow**, or shows "✓ Following". When you follow a fund nobody has opened before, Trove fetches its latest filing from the SEC on the spot. The card says "Loading from SEC — large filers take a minute".

**The fund cards.** Each followed fund is a collapsible card. Collapsed, it shows the fund name, CIK, latest quarter and position count, plus **Full portfolio →**, **Sync** (owner only) and **Unfollow**. Expanded, it shows:

- **The thesis**: a short AI-written paragraph explaining what the fund bets on, pitched "at a smart high schooler". It names actual companies and describes puts as bets *against* companies.
- **The top 15 holdings**, as a table with a checkbox, rank, ticker, shares, value and weight bar, plus a **Buy** button on each row. Tickers link to stock pages, and hovering a ticker shows a quick tooltip. Option lines carry a PUT or CALL tag, and their checkbox is disabled.
- **Buy basket**, the main call to action, with a count of selected holdings.

**Buying a basket.** Clicking **Buy basket** opens the basket sheet:

1. Enter a **budget** (default $1,000). Optionally turn on **fractional shares**.
2. Trove fetches a price for every selected stock and shows each line's weight, price, and how many shares the budget buys. Weights are re-normalised across just the stocks you selected.
3. With whole shares, any stock whose slice of the budget is below one share's price gets 0 shares and is dimmed. The leftover appears as **Uninvested**.
4. Confirm. Trove places one order per stock, showing *Queued → Placing… → ✓ / ✗* line by line.
5. When the orders finish, the basket is recorded and appears on the Baskets page and as a folded row in Portfolio.

### 6.5 The full fund page (`/fund/<CIK>`)

You reach it from **Full portfolio →** on a fund card, from search, or from the directory. It's the deepest view of one fund:

- **Header:** fund name, CIK, a link to the raw filings on SEC EDGAR, and any aliases ("Also known as…") and tags.
- **Notes**, when relevant: a warning if a newer filing exists but couldn't be loaded, and a callout if the fund holds puts ("Put options · 8.2% of reported value… these weights overstate the money at risk").
- **Stat strip:** reported value, number of positions, the "As of" quarter and period end, the filing date, and how much of the fund sits in its top 10 and top 25 positions.
- **What it bets on:** the AI thesis.
- **Portfolio by sector:** a bar list of the ten largest sectors plus "Other", with a note on how much of the book has a known sector.
- **By instrument:** stock, bonds and notes, warrants, puts, calls.
- **New this quarter:** positions that weren't in the previous filing.
- **Biggest weight changes:** which positions grew or shrank most since last quarter, in percentage points.
- **The full positions table:** every holding, filterable by ticker, company or sector, loaded 100 at a time. Each keeps its rank in the full book, so "#412" tells you how small it is. Securities that couldn't be matched to a ticker show their company name and CUSIP (the security's ID).

When nobody has opened a fund before, the page loads it from the SEC live. After a few seconds it explains: *"First time anyone has opened this fund — pulling its latest 13F from SEC EDGAR… can take a minute or two. Once loaded it's stored, and opens instantly after that."*

**What's missing:** this page has **no Follow button and no Buy basket button**. A user who discovers a fund here, via search or the directory, has to go back to the Funds tab, open Add fund, and search for it again in order to act.

### 6.6 Stock pages: there are two

Trove has **two different pages for one company**, built at different times, and each holds half of what a user wants.

**`/stock/<TICKER>`** is the market view. You reach it from search, portfolio rows, fund holdings and baskets.

- Name, exchange, live price and today's change.
- A price chart with ranges from **1D** to **5Y**, using the same glide-and-measure interaction as the portfolio chart.
- **Buy** and **Sell** buttons (Sell only when you hold the stock), which open the trade sheet.
- **Analysis:** an AI-written summary, a three-point bull case and a three-point bear case.
- **News:** recent headlines and an AI digest of them.
- **Fundamentals:** market cap, P/E, margins, debt, 52-week range, dividend yield, sector, employees, website and description.

**`/company/<TICKER>`** is the ownership view. You reach it from ticker links in the Analyst and on the full fund page.

- **Your position**, if you have one.
- **What it does**, **Case for**, **Case against**.
- **Which tracked funds hold it**, with each fund's weight, value, quarter, and when it first reported the position.
- A link to **Price & fundamentals →**, which goes to the other page.

The stock page, in a 13F app, never says which funds own the stock. The company page, which does, has no trade button. A user moving around the app lands on one or the other depending on where they clicked. The company page's "Your position" also always reads the paper account, so the owner sees the wrong account there.

### 6.7 Baskets

The header reads **BASKET TRACKER**. Each basket you've bought is a row: fund name, how long ago it was bought, number of positions, cost basis, current value, and profit or loss in dollars and percent. Expanding a row shows every stock with shares, entry price, current price, cost, value, gain and return. Each stock row links to its stock page.

**Sell** closes the whole basket. It opens a sheet listing each position with its estimated proceeds, then places one sell order per stock. Once sold, a basket is greyed out, marked **Closed**, and valued at what it actually sold for rather than today's prices.

If you haven't bought anything yet: *"No baskets purchased yet. Buy a basket from the Funds page to start tracking performance."*

### 6.8 Analyst (the AI chat)

The header reads **ANALYST**, with the subtitle **"Your ideas, checked against the smart money"** and the number of funds it knows about. A short introduction explains the idea: *"Bring a hunch, a theme, or a stock you own. Analyst connects it to where the biggest investors have put their money — who agrees, who's on the other side, and how the pros express the same idea. Not advice; 13F filings run up to 45 days behind."*

An empty conversation offers four starter questions:

- *I think AI power demand is underrated. Which funds are positioned for it, and how?*
- *Which of my holdings do the big funds agree with, and which am I alone in?*
- *I like a company because I use its product every day. Who's on the other side?*
- *Which names are the most funds crowding into right now?*

How it behaves, from the user's side:

- **Answers stream in.** While the model thinks, you see a summary of its reasoning rather than a frozen screen.
- **It already knows every tracked fund's portfolio** and can look up more: a fund's smaller positions, who holds a ticker, a company's description and fundamentals, market prices, your own portfolio, and a "what businesses match this theme" search.
- **It is instructed not to invent.** For a theme ("grid equipment", "GLP-1"), it must search the database of what companies actually do rather than list names from memory, and say plainly when no tracked fund has real exposure.
- **Your own idea gets taken seriously.** It finds the sharpest version of your claim, shows who agrees *with money*, who disagrees (trimmed or exited), how professionals express the same view through other names, and says honestly whether the filings strengthen, complicate or leave your thesis unconfirmed.
- **Tickers become links**, but only symbols that some tracked fund actually reports, so an invented ticker never looks real. A click opens the company page in a new tab; alt-click opens a quick side panel instead.
- **Follow-up chips** appear under the latest answer.
- **History:** a sidebar lists past conversations, which you can reopen or delete.
- **Footer:** "Not financial advice · Analyst can be wrong · Verify before acting · Terms".

The Analyst runs on Anthropic's Claude Opus 5. Usage is metered: the public demo has a daily spending cap, while signed-in use is measured but never blocked.

### 6.9 AI Search

The **✦ AI Search** button opens a panel where you type a theme or paste a headline (the placeholder suggests *"Trump and Xi agree on AI talks"*). You get back **Quick insights**, a short read on what it means for markets, and a table of **held companies it touches**, each with a reason and the number of followed funds holding it. As with the Analyst, the symbols come only from what tracked funds hold. The AI can keep or drop candidates but can't add its own.

### 6.10 The hidden pages, briefly

- **Fund directory (`/fund`):** a clean, searchable list of all 73 tracked funds with type labels (hedge fund, asset manager, endowment, sovereign wealth, corporate), aliases and tags. It's better for browsing than the Add fund panel, but nothing points to it.
- **News (`/news`):** **Daily briefing**, a three-paragraph AI market summary that mentions your big movers by name and can be regenerated. Below it, **News by position** and **All articles**, with Macro and Reuters filters and an AI **Market digest**.
- **Rebalance (`/rebalance`):** **13F filing alerts** list followed funds with a newer filing on the SEC than Trove has stored, each with a sync button. A **rebalance calculator**, with a threshold slider from 1–20%, compares your live holdings against a blend of all tracked funds and lists suggested buys and sells. It only displays suggestions and places no orders. There's also **basket purchase history**.
- **Recommendations (`/recommendations`):** **Institutional insights**, stocks scored by how many followed funds hold them, their combined weight, and how many funds added them this quarter, each with plain-English reasons ("Held by 6 of 9 funds", "Recently added by 2 funds").

---

## 7. Where the information comes from, and how fresh it is

| What you see | Source | Freshness |
|---|---|---|
| Fund holdings, quarters, filing dates | SEC EDGAR 13F filings | Quarterly, up to 45 days behind by law. Trove refreshes a fund when someone opens it and a newer filing could exist. |
| Tickers for each security | OpenFIGI (converts the filing's CUSIP IDs into ticker symbols) | Fixed at load time. Unmatched securities show the company name instead. |
| Stock prices and charts, company details | Polygon (limited to about five calls a minute), plus Yahoo Finance | Prices settle to the last completed trading day for valuations. Charts include intraday data. |
| Live account balance, positions, orders | Tastytrade brokerage (owner only) | Live. |
| Paper account | Trove's own database | Instant. Orders fill at Yahoo's live price; holdings are valued at the last settled close. |
| Fund theses, stock analyses, news digests, AI Search | Anthropic Claude models (smaller, cheaper models for summaries) | Generated once and cached. Theses are regenerated on new quarters. |
| "Matched by what they hold", theme search | Embedding index (Voyage) over fund portfolios and company descriptions | Rebuilt by scripts, not continuously. |

**About freshness:** 25 of the 73 directory funds are the ones meant to be kept up to date (they're included in bulk refreshes and history backfills); the other 48 are loaded only when someone opens them. The project's README describes an automated daily check for new filings, but no schedule is configured in the repository. In practice, new filings arrive when a user opens a fund, presses Sync, or visits the hidden Rebalance page. **Users are never told that a fund they follow has just filed**, even though "a fund I follow just bought X" is the moment the whole product exists for.

---

## 8. What the product gets right

These are the patterns the app is built around. Anyone improving it should protect them.

1. **Honesty about the data.** Puts are labelled as bets against a stock and kept out of baskets and sector charts. Option weights are explained as overstated. The 45-day lag is mentioned. Unresolved securities show their real identity rather than a guessed ticker. A sold basket is valued at its sale price, not today's.
2. **The AI is fenced in by the data.** The Analyst and AI Search may only surface tickers that tracked funds actually hold, are told to search rather than recall, and must admit when a theme has no real exposure. Invented tickers stay unclickable.
3. **One deliberate position, one row.** Baskets fold into a single portfolio line because that's how the user thinks about them.
4. **Safety around real money.** Live trading is restricted to the owner on the server side, every order has a preview-then-confirm step, and paper accounts are clearly badged.
5. **Explained waiting.** Slow operations, like loading a large fund from the SEC, say why they're slow and that it only happens once.
6. **A real phone app.** It has a bottom tab bar, full-screen search, safe-area handling, a keyboard-aware chat composer, an installed-app theme, and an offline page.

---

## 9. Where the experience falls short

Each item below describes what a user would actually see, then why it matters. They're grouped by kind, roughly most important first within each group.

### Trust and correctness

- **Buy basket quietly includes holdings you never saw.** The fund card shows 15 holdings, but Trove loads the fund's top 50 and preselects all of them. The counter reads "50 holdings — 50 selected", but only 15 are visible. Clicking Buy basket buys up to 50 stocks, 35 of which were never on screen. Users should see everything they're about to buy.
- **A basket can be half-bought with no record.** Orders are sent one by one from the browser, and the basket is only recorded after the last one. Closing the tab or losing signal midway leaves real (or paper) positions with no basket around them, and a later basket can then claim those shares.
- **Whole-share baskets leave much of a small budget idle.** With the $1,000 default spread across many names, every stock priced above its slice gets zero shares. The Uninvested line shows this, but nothing suggests turning on fractional shares.
- **The portfolio chart isn't your history.** It replays today's holdings over the past year, so a stock bought yesterday looks as if you'd held it all year. The headline figure is real; the line under it isn't, and nothing says so.
- **Paper prices disagree with themselves.** A paper buy fills at Yahoo's live price, but the account is valued at the last settled close. The account can show an instant gain or loss right after a trade.
- **Your position on company pages reads the wrong account for the owner.** It always looks at the paper account.
- **Recommendations probably come back empty.** That page looks up followed funds the way the app worked before follows became shared, so funds followed the current way may not count. It would show "No insights — sync funds first" no matter what the user does. Confirm against real data before fixing.
- **The rebalance calculator new-position bug.** For a stock you don't own yet, it has no price, so it proposes buying 1 share worth $0, and any minimum-trade filter removes every new buy.

### Dead ends and broken loops

- **You can't act from the fund page.** No Follow, no Buy basket. The deepest, most persuasive view of a fund is the one place you can't act on it.
- **New filings don't reach you.** Nothing tells a user that a followed fund has filed. The only alert list is on a page with no link to it.
- **Half a company on each page.** The stock page has price, trading and news but no fund ownership. The company page has ownership but no trading. Which one you get depends on where you clicked.
- **Unfollow uses a browser pop-up** (the plain "OK / Cancel" box), the only place in the app that breaks out of its own design.

### Discoverability

- **Four finished features are invisible.** The fund directory, Daily briefing, Rebalance and Recommendations have no link from any menu. The mobile More sheet was built to hold extra destinations but currently holds none.
- **The home page explains nothing** to anyone who isn't already on the inside.
- **New users get no explanation of 13Fs.** Terms like CIK, quarter, "as of", weight and PUT appear with no help text. The 45-day lag appears in the Analyst intro but isn't explained where the dates are shown.
- **Paper users see Sync buttons on some screens but not others.** Sync is hidden on fund headers, yet "No holdings — sync now" still appears inside empty cards.

### Consistency and polish

- **Two visual languages.** The portfolio page is calm and consumer-like; Funds, Rebalance and the tables are dense terminal screens.
- **Same-looking rows, different clicks.** On Portfolio, a standalone stock opens the trade sheet while a basket's stock opens the stock page.
- **Duplicate Logout** in the portfolio header and the nav.
- **Developer text shown to users.** The fund page's empty sector chart tells the user to run `scripts/enrich-fundamentals.js`.
- **The ticker tape only works for the owner.** It reads the live brokerage, so paper users never see it, and the space it would fill varies by account.
- **Mixed tone in messages.** Some errors are shouted in uppercase ("INSUFFICIENT FUNDS — need…"), others are plain sentences. "Not financial advice" wording varies from page to page.

---

## 10. How to think about improving it

These are working rules that follow from what the app is trying to be. Test a proposed change against them.

**1. The core loop is: discover a fund → understand it → act on it → watch it → hear when it changes.**
Most weaknesses above are breaks in this loop: acting is impossible from the fund page, watching is split across two stock pages, and hearing about changes doesn't happen. Improvements that close the loop are worth more than new features beside it.

**2. Every number should say how old it is and what it means.**
The data is quarterly, delayed and partial. A user who forgets that will over-trust it. Wherever a weight, value or "new position" is shown, the date and the lag should be one glance away. Plain language beats jargon: "Bought by 3 funds between July and September; we learned on Nov 14" works better than "Q3 · NEW · 3".

**3. Never let the user buy what they haven't seen.**
Baskets are the moment of real commitment, with real money for the owner. The confirmation should list every stock, the total, the idle cash, and what happens if something fails partway.

**4. Keep the AI on a leash made of data.**
The Analyst is persuasive because it can only cite real holdings. Any new AI feature should follow the same rule: the model may select and explain, but the facts come from the filings.

**5. One place per thing.**
One company page, one way to search funds, one tone for errors, one visual language. Duplication is the main source of the app's inconsistency.

**6. Design for the phone first.**
The tab bar, sheets and full-screen search show the app is meant to live on a home screen. Dense tables are the hardest part to make good there, and the newer portfolio page shows a direction (one number, a chart, simple rows) that the other screens could follow.

**7. A private app today, maybe a public one later.**
Several choices make sense only because the user base is a handful of allowlisted people: one real brokerage account, no sign-up, a landing page with one sentence. Opening Trove to more people would mean per-user brokerage connections, an onboarding flow that teaches 13Fs, and a home page that explains itself.

Questions worth asking about any change:

- Does a first-time user understand this screen without knowing what a 13F is?
- Can the user act on what they just learned without leaving this screen?
- Is it obvious whether this involves real money?
- Is every number's date and source one glance away?
- Does it look and behave like the rest of the app?
- Does it work one-handed on a phone?

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **13F** | Quarterly SEC filing listing an institutional investor's US stock positions. |
| **Analyst** | Trove's AI chat assistant, grounded in tracked funds' filings. |
| **Basket** | A one-click, budget-scaled copy of a fund's holdings, tracked as one position. |
| **CIK** | The SEC's ID number for a filer. |
| **CUSIP** | A nine-character ID for a specific security. Filings use it; Trove converts it to a ticker. |
| **EDGAR** | The SEC's public filing database. |
| **Filing date** | When a 13F became public. |
| **Following** | Adding a fund to your Funds tab. Fund data is shared by everyone; following is personal. |
| **On-demand fund** | A directory fund loaded only when someone opens it, never synced in the background. |
| **Paper account** | A simulated $10,000 account for every user except the owner. |
| **Period end / "As of"** | The date a 13F's positions were true, usually the last day of a quarter. |
| **Put / Call** | Options: a put bets a stock falls; a call bets it rises. Shown with labels and excluded from baskets. |
| **Sync** | Fetching a fund's latest filing from the SEC (owner-only button). |
| **Thesis** | A short AI-written explanation of what a fund bets on. |
| **Weight** | A position's share of a fund's total reported value. |
