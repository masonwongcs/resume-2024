import { NextRequest, NextResponse } from 'next/server';

import { fetchDataForAllYears } from '@/utils/fetchGithub';

export async function GET(req: NextRequest) {
  try {
    const data = await fetchDataForAllYears('masonwongcs', 'nested');
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
