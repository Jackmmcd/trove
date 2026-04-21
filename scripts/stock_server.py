"""
Lightweight FastAPI stock data server using yfinance.
Run: python scripts/stock_server.py
Serves on http://localhost:3002
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/stock/{ticker}")
def get_stock(ticker: str):
    sym = ticker.upper()
    try:
        t = yf.Ticker(sym)
        info = t.info or {}
    except Exception:
        info = {}

    def safe(key, default=None):
        v = info.get(key, default)
        return None if v in ("Infinity", float("inf"), float("-inf")) else v

    return {
        "success": True,
        "data": {
            "name": safe("longName") or safe("shortName"),
            "exchange": safe("exchange") or safe("fullExchangeName"),
            "currency": safe("currency", "USD"),
            "currentPrice": safe("currentPrice") or safe("regularMarketPrice"),
            "previousClose": safe("previousClose") or safe("regularMarketPreviousClose"),
            "open": safe("open") or safe("regularMarketOpen"),
            "dayLow": safe("dayLow") or safe("regularMarketDayLow"),
            "dayHigh": safe("dayHigh") or safe("regularMarketDayHigh"),
            "volume": safe("volume") or safe("regularMarketVolume"),
            "avgVolume": safe("averageVolume"),
            "marketCap": safe("marketCap"),
            "enterpriseValue": safe("enterpriseValue"),
            "peRatio": safe("trailingPE"),
            "forwardPE": safe("forwardPE"),
            "priceToBook": safe("priceToBook"),
            "priceToSales": safe("priceToSalesTrailing12Months"),
            "evToEbitda": safe("enterpriseToEbitda"),
            "evToRevenue": safe("enterpriseToRevenue"),
            "revenue": safe("totalRevenue"),
            "grossMargin": safe("grossMargins"),
            "operatingMargin": safe("operatingMargins"),
            "profitMargin": safe("profitMargins"),
            "returnOnEquity": safe("returnOnEquity"),
            "returnOnAssets": safe("returnOnAssets"),
            "debtToEquity": safe("debtToEquity"),
            "freeCashFlow": safe("freeCashflow"),
            "eps": safe("trailingEps"),
            "week52High": safe("fiftyTwoWeekHigh"),
            "week52Low": safe("fiftyTwoWeekLow"),
            "beta": safe("beta"),
            "dividendYield": safe("dividendYield"),
            "payoutRatio": safe("payoutRatio"),
            "sector": safe("sector"),
            "industry": safe("industry"),
            "employees": safe("fullTimeEmployees"),
            "website": safe("website"),
            "description": safe("longBusinessSummary"),
            "country": safe("country"),
            "city": safe("city"),
            "state": safe("state"),
        },
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=3002, log_level="warning")
