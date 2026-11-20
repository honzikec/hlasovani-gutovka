import { NextRequest, NextResponse } from 'next/server';
import { getVotesForDate, upsertVote } from '@/lib/db';
import { buildVoteSummary } from '@/lib/types';
import { isValidDateString } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date || !isValidDateString(date)) {
      return NextResponse.json({ error: 'Datum je povinný' }, { status: 400 });
    }

    const votes = await getVotesForDate(date);
    const summary = buildVoteSummary(votes);

    return NextResponse.json(
      { votes, summary },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Error fetching votes:', error);
    return NextResponse.json(
      { error: 'Chyba při načítání hlasování' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userName, voteDate, attendance, minPlayers, guests = 0 } = body;

    const cleanName = typeof userName === 'string' ? userName.trim() : '';
    if (!cleanName || !voteDate || !attendance || !minPlayers) {
      return NextResponse.json(
        { error: 'Všechna pole jsou povinná' },
        { status: 400 }
      );
    }

    if (cleanName.length > 100) {
      return NextResponse.json(
        { error: 'Jméno může mít maximálně 100 znaků' },
        { status: 400 }
      );
    }

    if (!isValidDateString(voteDate)) {
      return NextResponse.json({ error: 'Neplatné datum' }, { status: 400 });
    }

    if (!['yes', 'no'].includes(attendance)) {
      return NextResponse.json(
        { error: 'Neplatná hodnota účasti' },
        { status: 400 }
      );
    }

    if (!['any', '6', '8'].includes(minPlayers)) {
      return NextResponse.json(
        { error: 'Neplatná hodnota minimálního počtu hráčů' },
        { status: 400 }
      );
    }

    if (
      typeof guests !== 'number' ||
      !Number.isInteger(guests) ||
      guests < 0 ||
      guests > 10
    ) {
      return NextResponse.json(
        { error: 'Neplatný počet hostů (0-10)' },
        { status: 400 }
      );
    }

    const vote = await upsertVote(
      cleanName,
      voteDate,
      attendance,
      minPlayers,
      attendance === 'no' ? 0 : guests
    );
    const votes = await getVotesForDate(voteDate);
    const summary = buildVoteSummary(votes);

    return NextResponse.json({ vote, votes, summary });
  } catch (error) {
    console.error('Error saving vote:', error);
    return NextResponse.json(
      { error: 'Chyba při ukládání hlasování' },
      { status: 500 }
    );
  }
}
