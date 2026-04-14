import { NextResponse } from 'next/server';
import { getRecommendations } from '@/lib/recommendations/analyzer';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    const limit = searchParams.get('limit')
      ? parseInt(searchParams.get('limit')!)
      : 20;
    
    const minFundCount = searchParams.get('minFundCount')
      ? parseInt(searchParams.get('minFundCount')!)
      : undefined;
    
    const minWeight = searchParams.get('minWeight')
      ? parseFloat(searchParams.get('minWeight')!)
      : undefined;

    const recommendations = await getRecommendations(limit, minFundCount, minWeight);

    return NextResponse.json({
      success: true,
      data: recommendations,
    });
  } catch (error: any) {
    console.error('Error getting recommendations:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get recommendations',
      },
      { status: 500 }
    );
  }
}



