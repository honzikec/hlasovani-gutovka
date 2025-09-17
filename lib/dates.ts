// Utility functions for handling Wednesday dates

// Get current date/time in Czech timezone
export function getCurrentCzechTime(): Date {
  const now = new Date();
  // Get the current time in Prague timezone
  const czechTimeString = now.toLocaleString('en-US', { timeZone: 'Europe/Prague' });
  const czechTime = new Date(czechTimeString);
  
  // Fallback to current time if conversion fails
  if (isNaN(czechTime.getTime())) {
    return new Date();
  }
  
  return czechTime;
}

export function formatDate(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return ''; // Return empty string for invalid dates
  }
  return date.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' }); // YYYY-MM-DD format in Czech timezone
}

export function formatDateCzech(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return ''; // Return empty string for invalid dates
  }
  return date.toLocaleDateString('cs-CZ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Prague'
  });
}

export function getNextWednesday(fromDate: Date = new Date()): Date {
  const date = new Date(fromDate);
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysUntilWednesday = (3 - dayOfWeek + 7) % 7; // 3 = Wednesday
  
  // If today is Wednesday, get next Wednesday
  const daysToAdd = daysUntilWednesday === 0 ? 7 : daysUntilWednesday;
  
  date.setDate(date.getDate() + daysToAdd);
  return date;
}

export function getPreviousWednesday(fromDate: Date = new Date()): Date {
  const date = new Date(fromDate);
  const dayOfWeek = date.getDay();
  const daysSinceWednesday = (dayOfWeek - 3 + 7) % 7;
  
  // If today is Wednesday, get previous Wednesday
  const daysToSubtract = daysSinceWednesday === 0 ? 7 : daysSinceWednesday;
  
  date.setDate(date.getDate() - daysToSubtract);
  return date;
}

export function getCurrentWednesday(fromDate: Date = new Date()): Date {
  const date = new Date(fromDate);
  // Normalize to start of day to avoid timezone issues
  date.setHours(12, 0, 0, 0); // Use noon to avoid DST issues
  const dayOfWeek = date.getDay();
  
  if (dayOfWeek === 3) { // Today is Wednesday
    return date;
  } else if (dayOfWeek < 3) { // Before Wednesday this week
    const daysUntilWednesday = 3 - dayOfWeek;
    date.setDate(date.getDate() + daysUntilWednesday);
    return date;
  } else { // After Wednesday this week
    return getNextWednesday(date);
  }
}

export function getWednesdaysRange(weeks: number = 8): Date[] {
  const wednesdays: Date[] = [];
  const today = getCurrentCzechTime();
  // Normalize to start of day to avoid timezone issues
  today.setHours(12, 0, 0, 0);
  
  // Get past Wednesdays (half of the range)
  const pastWeeks = Math.floor(weeks / 2);
  const currentWednesday = getCurrentWednesday(today);
  
  // Go back to get past Wednesdays
  for (let i = pastWeeks; i > 0; i--) {
    const pastWednesday = new Date(currentWednesday);
    pastWednesday.setDate(currentWednesday.getDate() - (i * 7));
    wednesdays.push(pastWednesday);
  }
  
  // Add current and future Wednesdays
  const futureWeeks = weeks - pastWeeks;
  for (let i = 0; i < futureWeeks; i++) {
    const futureWednesday = new Date(currentWednesday);
    futureWednesday.setDate(currentWednesday.getDate() + (i * 7));
    wednesdays.push(futureWednesday);
  }
  
  return wednesdays;
}

export function getMorePastWednesdays(fromDate: string, count: number = 4): Date[] {
  const date = new Date(fromDate);
  const wednesdays: Date[] = [];
  
  for (let i = 1; i <= count; i++) {
    const pastWednesday = new Date(date);
    pastWednesday.setDate(date.getDate() - (i * 7));
    wednesdays.unshift(pastWednesday); // Add to beginning
  }
  
  return wednesdays;
}

export function getMoreFutureWednesdays(fromDate: string, count: number = 4): Date[] {
  const date = new Date(fromDate);
  const wednesdays: Date[] = [];
  
  for (let i = 1; i <= count; i++) {
    const futureWednesday = new Date(date);
    futureWednesday.setDate(date.getDate() + (i * 7));
    wednesdays.push(futureWednesday);
  }
  
  return wednesdays;
}

export function isDateInPast(date: Date): boolean {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return false; // Treat invalid dates as not in the past
  }
  
  const today = getCurrentCzechTime();
  // Use Czech timezone for comparison
  const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' }); // YYYY-MM-DD format in Czech timezone
  const compareDateStr = date.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' }); // YYYY-MM-DD format in Czech timezone
  return compareDateStr < todayStr;
}

export function isDateToday(date: Date): boolean {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return false; // Treat invalid dates as not today
  }
  
  const today = getCurrentCzechTime();
  // Use Czech timezone for comparison
  const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' }); // YYYY-MM-DD format in Czech timezone
  const compareDateStr = date.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' }); // YYYY-MM-DD format in Czech timezone
  return todayStr === compareDateStr;
} 