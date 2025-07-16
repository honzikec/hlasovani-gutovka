import { NextRequest, NextResponse } from 'next/server';
import { getCommentsForDate, addComment, initializeDatabase } from '@/lib/db';

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
    
    const comments = await getCommentsForDate(date);
    
    return NextResponse.json({ comments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json({ error: 'Chyba při načítání komentářů' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDbInitialized();
    
    const body = await request.json();
    const { userName, voteDate, comment } = body;
    
    if (!userName || !voteDate || !comment) {
      return NextResponse.json({ error: 'Všechna pole jsou povinná' }, { status: 400 });
    }
    
    if (comment.trim().length === 0) {
      return NextResponse.json({ error: 'Komentář nemůže být prázdný' }, { status: 400 });
    }
    
    const newComment = await addComment(userName, voteDate, comment.trim());
    
    return NextResponse.json({ comment: newComment });
  } catch (error) {
    console.error('Error saving comment:', error);
    return NextResponse.json({ error: 'Chyba při ukládání komentáře' }, { status: 500 });
  }
} 