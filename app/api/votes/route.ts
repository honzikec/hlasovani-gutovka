import { NextRequest, NextResponse } from 'next/server';
import { getVotesForDate, upsertVote, getVoteSummary, initializeDatabase } from '@/lib/db';

// Initialize database on first request
let dbInitialized = false;

async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initializeDatabase();
    dbInitialized = true;
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();
    
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    
    if (!date) {
      return NextResponse.json({ error: 'Datum je povinný' }, { status: 400 });
    }
    
    const [votes, summary] = await Promise.all([
      getVotesForDate(date),
      getVoteSummary(date)
    ]);
    
    return NextResponse.json({ votes, summary });
  } catch (error) {
    console.error('Error fetching votes:', error);
    return NextResponse.json({ error: 'Chyba při načítání hlasování' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDbInitialized();
    
    const body = await request.json();
    const { userName, voteDate, attendance, minPlayers, guests = 0 } = body;
    
    if (!userName || !voteDate || !attendance || !minPlayers) {
      return NextResponse.json({ error: 'Všechna pole jsou povinná' }, { status: 400 });
    }
    
    if (!['yes', 'no'].includes(attendance)) {
      return NextResponse.json({ error: 'Neplatná hodnota účasti' }, { status: 400 });
    }
    
    if (!['any', '6', '8'].includes(minPlayers)) {
      return NextResponse.json({ error: 'Neplatná hodnota minimálního počtu hráčů' }, { status: 400 });
    }
    
    if (typeof guests !== 'number' || guests < 0 || guests > 10) {
      return NextResponse.json({ error: 'Neplatný počet hostů (0-10)' }, { status: 400 });
    }
    
    const vote = await upsertVote(userName, voteDate, attendance, minPlayers, guests);
    
    return NextResponse.json({ vote });
  } catch (error) {
    console.error('Error saving vote:', error);
    return NextResponse.json({ error: 'Chyba při ukládání hlasování' }, { status: 500 });
  }
} 