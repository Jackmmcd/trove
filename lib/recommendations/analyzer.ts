import { prisma } from '@/lib/prisma';

export interface CompanyRecommendation {
  ticker: string;
  score: number;
  fundCount: number; // Number of funds holding this stock
  aggregateWeight: number; // Total weight across all funds
  averageWeight: number; // Average weight per fund
  totalValue: number; // Total value across all funds
  recentAdditions: number; // Number of funds that recently added this
  reasons: string[]; // Reasons for recommendation
}

/**
 * Analyze diversification across followed funds
 */
export async function analyzeDiversification(): Promise<Map<string, {
  fundCount: number;
  totalValue: number;
  totalWeight: number;
  funds: string[];
}>> {
  const funds = await prisma.fund.findMany({
    where: { enabled: true },
    include: {
      holdings: {
        where: {
          quarter: await getLatestQuarter(),
        },
      },
    },
  });

  const tickerMap = new Map<string, {
    fundCount: number;
    totalValue: number;
    totalWeight: number;
    funds: string[];
  }>();

  for (const fund of funds) {
    for (const holding of fund.holdings) {
      const existing = tickerMap.get(holding.ticker) || {
        fundCount: 0,
        totalValue: 0,
        totalWeight: 0,
        funds: [],
      };

      if (!existing.funds.includes(fund.name)) {
        existing.fundCount++;
        existing.funds.push(fund.name);
      }
      existing.totalValue += holding.value;
      existing.totalWeight += holding.weight;

      tickerMap.set(holding.ticker, existing);
    }
  }

  return tickerMap;
}

/**
 * Score companies based on diversification metrics
 */
export async function scoreCompanies(
  limit: number = 20
): Promise<CompanyRecommendation[]> {
  const diversification = await analyzeDiversification();
  const funds = await prisma.fund.findMany({ where: { enabled: true } });
  const fundCount = funds.length;

  // Get previous quarter to detect recent additions
  const previousQuarter = await getPreviousQuarter();
  const previousHoldings = await prisma.holding.findMany({
    where: { quarter: previousQuarter },
    select: { ticker: true, fundId: true },
  });

  const previousTickerSet = new Set(
    previousHoldings.map(h => `${h.fundId}-${h.ticker}`)
  );

  const recommendations: CompanyRecommendation[] = [];

  for (const [ticker, data] of diversification.entries()) {
    // Calculate recent additions
    const currentHoldings = await prisma.holding.findMany({
      where: {
        ticker,
        quarter: await getLatestQuarter(),
      },
      select: { fundId: true },
    });

    let recentAdditions = 0;
    for (const holding of currentHoldings) {
      const key = `${holding.fundId}-${ticker}`;
      if (!previousTickerSet.has(key)) {
        recentAdditions++;
      }
    }

    // Calculate scores
    const fundDiversityScore = (data.fundCount / fundCount) * 100; // Higher = more funds hold it
    const aggregateWeightScore = data.totalWeight; // Higher = more total weight
    const recentAdditionsScore = recentAdditions * 20; // Bonus for recent additions

    // Combined score (weighted)
    const score = 
      fundDiversityScore * 0.4 + // 40% weight on diversification
      aggregateWeightScore * 0.4 + // 40% weight on aggregate holding size
      recentAdditionsScore * 0.2; // 20% weight on recent additions

    const reasons: string[] = [];
    if (data.fundCount >= fundCount * 0.5) {
      reasons.push(`Held by ${data.fundCount} of ${fundCount} funds`);
    }
    if (data.totalWeight > 5) {
      reasons.push(`High aggregate weight (${data.totalWeight.toFixed(2)}%)`);
    }
    if (recentAdditions > 0) {
      reasons.push(`Recently added by ${recentAdditions} fund(s)`);
    }

    recommendations.push({
      ticker,
      score,
      fundCount: data.fundCount,
      aggregateWeight: data.totalWeight,
      averageWeight: data.totalWeight / data.fundCount,
      totalValue: data.totalValue,
      recentAdditions,
      reasons,
    });
  }

  // Sort by score and return top recommendations
  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get recommendations with additional filtering
 */
export async function getRecommendations(
  limit: number = 20,
  minFundCount?: number,
  minWeight?: number
): Promise<CompanyRecommendation[]> {
  let recommendations = await scoreCompanies(limit * 2); // Get more to filter

  // Apply filters
  if (minFundCount !== undefined) {
    recommendations = recommendations.filter(r => r.fundCount >= minFundCount);
  }

  if (minWeight !== undefined) {
    recommendations = recommendations.filter(r => r.aggregateWeight >= minWeight);
  }

  return recommendations.slice(0, limit);
}

/**
 * Get the latest quarter from holdings
 */
async function getLatestQuarter(): Promise<string> {
  const latestHolding = await prisma.holding.findFirst({
    orderBy: { quarter: 'desc' },
    select: { quarter: true },
  });

  return latestHolding?.quarter || getCurrentQuarter();
}

/**
 * Get previous quarter
 */
async function getPreviousQuarter(): Promise<string> {
  const latestQuarter = await getLatestQuarter();
  const [year, quarter] = latestQuarter.split('-Q');
  const quarterNum = parseInt(quarter);

  if (quarterNum === 1) {
    return `${parseInt(year) - 1}-Q4`;
  } else {
    return `${year}-Q${quarterNum - 1}`;
  }
}

/**
 * Get current quarter string
 */
function getCurrentQuarter(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month >= 1 && month <= 3) return `${year}-Q1`;
  if (month >= 4 && month <= 6) return `${year}-Q2`;
  if (month >= 7 && month <= 9) return `${year}-Q3`;
  return `${year}-Q4`;
}

