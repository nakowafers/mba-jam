import { NextRequest, NextResponse } from 'next/server';
import { HttpSleeperGateway } from '@/lib/gateway/http-sleeper-gateway';
import { MBA_LEAGUE_ID_2026 } from '@/lib/types/mba';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('force') === '1';
  const legParam = searchParams.get('leg');
  const leg = legParam ? Number.parseInt(legParam, 10) : undefined;

  const gateway = new HttpSleeperGateway(MBA_LEAGUE_ID_2026);
  const bundle = await gateway.fetchLeagueBundle({
    forceRefresh,
    leg: Number.isNaN(leg) ? undefined : leg,
  });

  return NextResponse.json(bundle);
}
