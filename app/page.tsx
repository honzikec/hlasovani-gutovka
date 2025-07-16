'use client';

import { useState, useEffect } from 'react';
import { formatDate, formatDateCzech, getWednesdaysRange, isDateInPast, isDateToday } from '@/lib/dates';

interface Vote {
  id: number;
  user_name: string;
  vote_date: string;
  attendance: 'yes' | 'no' | 'maybe';
  min_players: 'any' | '6' | '8';
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: number;
  user_name: string;
  vote_date: string;
  comment: string;
  created_at: string;
}

interface VoteSummary {
  yes: { count: number; users: string[]; usersWithMinPlayers: Array<{name: string, minPlayers: string}> };
  no: { count: number; users: string[]; usersWithMinPlayers: Array<{name: string, minPlayers: string}> };
  maybe: { count: number; users: string[]; usersWithMinPlayers: Array<{name: string, minPlayers: string}> };
}

export default function Home() {
  const [wednesdays, setWednesdays] = useState<Date[]>([]);
  const [currentDateIndex, setCurrentDateIndex] = useState(0);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [summary, setSummary] = useState<VoteSummary>({
    yes: { count: 0, users: [], usersWithMinPlayers: [] },
    no: { count: 0, users: [], usersWithMinPlayers: [] },
    maybe: { count: 0, users: [], usersWithMinPlayers: [] }
  });
  const [userName, setUserName] = useState('');
  const [userVote, setUserVote] = useState<{attendance: 'yes' | 'no' | 'maybe', minPlayers: 'any' | '6' | '8'} | null>(null);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Initialize wednesdays and load saved username
  useEffect(() => {
    const weds = getWednesdaysRange(8);
    setWednesdays(weds);
    
    // Find current Wednesday or next Wednesday
    const today = new Date();
    const currentIndex = weds.findIndex(wed => {
      const wedDate = new Date(wed);
      wedDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      return wedDate >= today;
    });
    
    setCurrentDateIndex(currentIndex >= 0 ? currentIndex : 0);
    
    // Load saved username
    const savedName = localStorage.getItem('footballVotingUsername');
    if (savedName) {
      setUserName(savedName);
    }
  }, []);

  // Load data when date changes
  useEffect(() => {
    if (wednesdays.length > 0) {
      loadVotesAndComments();
    }
  }, [currentDateIndex, wednesdays]);

  // Update user vote when votes change
  useEffect(() => {
    if (userName && votes.length > 0) {
      const myVote = votes.find(v => v.user_name === userName);
      if (myVote) {
        setUserVote({
          attendance: myVote.attendance,
          minPlayers: myVote.min_players
        });
      } else {
        setUserVote(null);
      }
    }
  }, [votes, userName]);

  const currentDate = wednesdays[currentDateIndex];
  const currentDateString = currentDate ? formatDate(currentDate) : '';

  const loadVotesAndComments = async () => {
    if (!currentDate) return;
    
    setLoading(true);
    try {
      const [votesRes, commentsRes] = await Promise.all([
        fetch(`/api/votes?date=${formatDate(currentDate)}`),
        fetch(`/api/comments?date=${formatDate(currentDate)}`)
      ]);

      if (votesRes.ok) {
        const votesData = await votesRes.json();
        setVotes(votesData.votes);
        setSummary(votesData.summary);
      }

      if (commentsRes.ok) {
        const commentsData = await commentsRes.json();
        setComments(commentsData.comments);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Chyba při načítání dat');
    } finally {
      setLoading(false);
    }
  };

  const handleUsernameChange = (name: string) => {
    setUserName(name);
    localStorage.setItem('footballVotingUsername', name);
  };

  const handleVote = async (attendance: 'yes' | 'no' | 'maybe', minPlayers: 'any' | '6' | '8') => {
    if (!userName.trim()) {
      setError('Zadejte své jméno');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/votes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userName: userName.trim(),
          voteDate: currentDateString,
          attendance,
          minPlayers
        }),
      });

      if (response.ok) {
        await loadVotesAndComments();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Chyba při hlasování');
      }
    } catch (err) {
      console.error('Error voting:', err);
      setError('Chyba při hlasování');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!userName.trim()) {
      setError('Zadejte své jméno');
      return;
    }

    if (!newComment.trim()) {
      setError('Zadejte komentář');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userName: userName.trim(),
          voteDate: currentDateString,
          comment: newComment.trim()
        }),
      });

      if (response.ok) {
        setNewComment('');
        await loadVotesAndComments();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Chyba při přidávání komentáře');
      }
    } catch (err) {
      console.error('Error adding comment:', err);
      setError('Chyba při přidávání komentáře');
    } finally {
      setLoading(false);
    }
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentDateIndex > 0) {
      setCurrentDateIndex(currentDateIndex - 1);
    } else if (direction === 'next' && currentDateIndex < wednesdays.length - 1) {
      setCurrentDateIndex(currentDateIndex + 1);
    }
  };

  const totalPlayers = summary.yes.count + summary.maybe.count;
  const enoughPlayers = totalPlayers >= 6;

  if (!currentDate) {
    return <div className="min-h-screen flex items-center justify-center">Načítání...</div>;
  }

  return (
    <div className="min-h-screen bg-green-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-center text-green-800 mb-4">
            ⚽ Hlasování Gutovka ⚽
          </h1>
          
          {/* Date Navigation */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigateDate('prev')}
              disabled={currentDateIndex === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-green-700"
            >
              ← <span className="hidden md:inline">Předchozí středa</span>
            </button>
            
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-800">
                {formatDateCzech(currentDate)}
              </h2>
              {isDateToday(currentDate) && (
                <span className="text-sm text-green-600 font-medium">Dnes</span>
              )}
              {isDateInPast(currentDate) && (
                <span className="text-sm text-gray-500">Minulost</span>
              )}
            </div>
            
            <button
              onClick={() => navigateDate('next')}
              disabled={currentDateIndex === wednesdays.length - 1}
              className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-green-700"
            >
              <span className="hidden md:inline">Další středa</span> →
            </button>
          </div>

          {/* User Name Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Vaše jméno:
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => handleUsernameChange(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Zadejte své jméno"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Voting Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Hlasování</h3>
          
          {userVote && (
            <div className="mb-4 p-3 bg-blue-100 border border-blue-400 text-blue-700 rounded-lg">
              Váš hlas: <strong>
                {userVote.attendance === 'yes' ? 'Přijdu' : 
                 userVote.attendance === 'no' ? 'Nepřijdu' : 'Možná přijdu'}
              </strong>
              {userVote.attendance !== 'no' && (
                <>, minimum hráčů: <strong>
                  {userVote.minPlayers === 'any' ? 'bez minima' : userVote.minPlayers}
                </strong></>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* Yes Vote */}
            <div className="border border-green-300 rounded-lg p-4">
              <h4 className="font-semibold text-green-700 mb-3">✅ Přijdu</h4>
              <div className="space-y-2">
                {['any', '6', '8'].map((minPlayers) => (
                  <button
                    key={minPlayers}
                    onClick={() => handleVote('yes', minPlayers as 'any' | '6' | '8')}
                    disabled={loading}
                    className="w-full p-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
                  >
                    Min. {minPlayers === 'any' ? 'bez minima' : minPlayers} hráčů
                  </button>
                ))}
              </div>
            </div>

            {/* Maybe Vote */}
            <div className="border border-yellow-300 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-700 mb-3">🤔 Možná přijdu</h4>
              <div className="space-y-2">
                {['any', '6', '8'].map((minPlayers) => (
                  <button
                    key={minPlayers}
                    onClick={() => handleVote('maybe', minPlayers as 'any' | '6' | '8')}
                    disabled={loading}
                    className="w-full p-2 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-300"
                  >
                    Min. {minPlayers === 'any' ? 'bez minima' : minPlayers} hráčů
                  </button>
                ))}
              </div>
            </div>

            {/* No Vote */}
            <div className="border border-red-300 rounded-lg p-4">
              <h4 className="font-semibold text-red-700 mb-3">❌ Nepřijdu</h4>
              <button
                onClick={() => handleVote('no', 'any')}
                disabled={loading}
                className="w-full p-3 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300"
              >
                Nepřijdu
              </button>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Přehled účasti</h3>
          
          <div className={`text-center p-4 rounded-lg mb-4 ${
            enoughPlayers ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
          }`}>
            <div className="text-2xl font-bold">
              {totalPlayers} {totalPlayers === 1 ? 'hráč' : totalPlayers < 5 ? 'hráči' : 'hráčů'}
            </div>
            <div className="text-sm">
              {enoughPlayers ? '✅ Dostatek hráčů na hru!' : '⚠️ Málo hráčů na hru'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-lg font-semibold text-green-700">✅ Přijdou</div>
              <div className="text-2xl font-bold text-green-800">{summary.yes.count}</div>
              {summary.yes.usersWithMinPlayers.length > 0 && (
                <div className="text-sm text-gray-600 mt-1">
                  {summary.yes.usersWithMinPlayers.map((user, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span>{user.name}</span>
                      <span className="text-xs bg-green-100 px-2 py-1 rounded ml-2">
                        {user.minPlayers === 'any' ? 'bez minima' : `min. ${user.minPlayers}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <div className="text-lg font-semibold text-yellow-700">🤔 Možná</div>
              <div className="text-2xl font-bold text-yellow-800">{summary.maybe.count}</div>
              {summary.maybe.usersWithMinPlayers.length > 0 && (
                <div className="text-sm text-gray-600 mt-1">
                  {summary.maybe.usersWithMinPlayers.map((user, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span>{user.name}</span>
                      <span className="text-xs bg-yellow-100 px-2 py-1 rounded ml-2">
                        {user.minPlayers === 'any' ? 'bez minima' : `min. ${user.minPlayers}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-lg font-semibold text-red-700">❌ Nepřijdou</div>
              <div className="text-2xl font-bold text-red-800">{summary.no.count}</div>
              {summary.no.users.length > 0 && (
                <div className="text-sm text-gray-600 mt-1">
                  {summary.no.users.join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Comments Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Komentáře</h3>
          
          {/* Add Comment */}
          <div className="mb-6">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Přidejte komentář..."
                onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
              />
              <button
                onClick={handleAddComment}
                disabled={loading || !newComment.trim() || !userName.trim()}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300"
              >
                Přidat
              </button>
            </div>
          </div>

          {/* Comments List */}
          <div className="space-y-3">
            {comments.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Zatím žádné komentáře</p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="border-l-4 border-green-500 bg-gray-50 p-4 rounded-r-lg">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-gray-800">{comment.user_name}</span>
                    <span className="text-sm text-gray-500">
                      {new Date(comment.created_at).toLocaleDateString('cs-CZ', {
                        day: 'numeric',
                        month: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="text-gray-700">{comment.comment}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
