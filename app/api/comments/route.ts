import { NextRequest, NextResponse } from 'next/server';
import { getCommentsForDate, addComment } from '@/lib/db';
import { isValidDateString } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date || !isValidDateString(date)) {
      return NextResponse.json({ error: 'Datum je povinný' }, { status: 400 });
    }

    const comments = await getCommentsForDate(date);
    return NextResponse.json(
      { comments },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Chyba při načítání komentářů' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userName, voteDate, comment } = body;

    const cleanName = typeof userName === 'string' ? userName.trim() : '';
    const cleanComment = typeof comment === 'string' ? comment.trim() : '';

    if (!cleanName || !voteDate || !cleanComment) {
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

    const newComment = await addComment(cleanName, voteDate, cleanComment);
    const comments = await getCommentsForDate(voteDate);

    return NextResponse.json({ comment: newComment, comments });
  } catch (error) {
    console.error('Error saving comment:', error);
    return NextResponse.json(
      { error: 'Chyba při ukládání komentáře' },
      { status: 500 }
    );
  }
}
