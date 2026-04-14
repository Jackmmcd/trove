# 13F Follower Web App

A Next.js web application that connects to your Tastytrade account, tracks institutional funds via 13F filings, and provides automated rebalancing recommendations based on fund holdings changes.

## Features

- **Tastytrade Integration**: Access your account balance and current positions
- **13F Tracking**: Follow institutional funds and track their quarterly 13F filings
- **Rebalancing Engine**: Calculate target portfolio weights from followed funds and generate rebalancing recommendations
- **Best Companies Recommendations**: Identify stocks with high diversification value across followed funds
- **Daily Sync**: Automated daily checks for new 13F filings

## Setup

### Prerequisites

- Node.js 18+ and npm
- Tastytrade API credentials
- (Optional) SEC API key for enhanced 13F data access

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Set up environment variables:

Create a `.env.local` file in the root directory:

```env
# Tastytrade API Credentials
TASTYTRADE_API_KEY=your_tastytrade_api_key_here
TASTYTRADE_USERNAME=your_tastytrade_username_here

# SEC API (optional - can use free SEC EDGAR API)
SEC_API_KEY=your_sec_api_key_here

# Database
DATABASE_URL="file:./dev.db"

# Cron Secret (for scheduled sync jobs)
CRON_SECRET=your_random_secret_here
```

3. Set up the database:

```bash
npx prisma migrate dev
npx prisma generate
```

4. Configure funds to follow:

Edit `config/funds.json` to add the CIK numbers of funds you want to track:

```json
{
  "funds": [
    {
      "cik": "0001067983",
      "name": "Berkshire Hathaway",
      "enabled": true
    }
  ]
}
```

You can find CIK numbers on the SEC website or by searching for institutional investors.

5. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Dashboard

View your Tastytrade account balance, total equity, available cash, and current positions.

### Funds

- View all followed funds and their latest 13F holdings
- Sync funds to fetch the latest 13F filing data
- Add new funds via the API or config file

### Rebalance

- Calculate rebalancing recommendations based on target weights from followed funds
- Adjust rebalancing threshold (default: 5%)
- View buy and sell recommendations with trade details

### Recommendations

- View best companies to buy based on diversification across followed funds
- See scores, fund counts, aggregate weights, and recent additions
- Filter and sort recommendations

## API Endpoints

### Tastytrade

- `GET /api/tastytrade/balance` - Get account balance
- `GET /api/tastytrade/positions` - Get current positions

### Funds

- `GET /api/funds` - List all followed funds
- `POST /api/funds` - Add a new fund
- `PUT /api/funds` - Sync all funds (fetch latest 13F data)
- `GET /api/funds/[cik]/holdings` - Get holdings for a specific fund

### Rebalancing

- `GET /api/rebalance/calculate` - Calculate rebalancing recommendations
  - Query params: `rebalanceThreshold`, `minTradeValue`, `maxPositionWeight`

### Recommendations

- `GET /api/recommendations` - Get best companies recommendations
  - Query params: `limit`, `minFundCount`, `minWeight`

### Cron

- `GET /api/cron/sync` - Trigger daily sync (requires CRON_SECRET)

## Scheduled Jobs

Set up a daily cron job to sync fund data:

- **Vercel**: Use Vercel Cron Jobs in `vercel.json`
- **External**: Call `GET /api/cron/sync` with `Authorization: Bearer <CRON_SECRET>`
- **Manual**: Use the "Sync Funds" button in the Funds page

## Notes

- **13F Filing Lag**: 13F filings reflect holdings as of quarter-end but are filed ~45 days later
- **Tastytrade API**: The Tastytrade API integration may need adjustment based on actual API documentation
- **13F XML Parsing**: The 13F XML parser is a placeholder - you may need to implement proper XML parsing or use a paid API service
- **CUSIP to Ticker**: CUSIP-to-ticker conversion requires a mapping service (Polygon.io, IEX Cloud, etc.)

## Development

### Database

The app uses SQLite for development. To view the database:

```bash
npx prisma studio
```

### Adding New Funds

1. Find the fund's CIK number (10 digits, zero-padded)
2. Add to `config/funds.json` or use the API
3. Sync funds to fetch holdings data

## License

MIT
