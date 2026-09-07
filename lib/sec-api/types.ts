export type InstrumentType = 'equity' | 'debt' | 'warrant' | 'unknown';

export interface Holding {
  ticker: string;
  shares: number;
  value: number;
  weight: number; // Percentage of fund
  cusip?: string;
  cusip6?: string;          // Issuer half — same company across instruments
  instrumentType?: InstrumentType;
  name?: string;
}

export interface FundHoldings {
  cik: string;
  fundName: string;
  quarter: string; // Format: "2024-Q1" — derived from periodEnd, NOT filingDate
  filingDate: string;
  periodEnd: string; // Report period the holdings are as of (EDGAR reportDate)
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
