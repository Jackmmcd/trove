export interface Holding {
  ticker: string;
  shares: number;
  value: number;
  weight: number; // Percentage of fund
  cusip?: string;
  name?: string;
}

export interface FundHoldings {
  cik: string;
  fundName: string;
  quarter: string; // Format: "2024-Q1"
  filingDate: string;
  holdings: Holding[];
  totalValue: number;
}

export interface SEC13FData {
  cik: string;
  name: string;
  formType: string;
  dateFiled: string;
  holdings: {
    nameOfIssuer: string;
    titleOfClass: string;
    cusip: string;
    value: number;
    shares: number;
    putCall?: string;
    investmentDiscretion?: string;
    otherManagers?: string;
    sole?: number;
    shared?: number;
    none?: number;
  }[];
}
