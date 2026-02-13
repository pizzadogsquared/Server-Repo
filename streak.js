// streak.js
import db from "./db.js";

export async function markDayComplete(userId, dateStr) {
  // dateStr must be "YYYY-MM-DD"
  await db.query(
    `INSERT IGNORE INTO daily_checkins (user_id, checkin_date)
     VALUES (?, ?)`,
    [userId, dateStr]
  );
}

export async function getCurrentStreak(userId) {
  const [rows] = await db.query(
    `SELECT checkin_date
       FROM daily_checkins
      WHERE user_id = ?
      ORDER BY checkin_date DESC`,
    [userId]
  );

  const set = new Set(rows.map(r => toYMD(r.checkin_date)));

  // If today isn't complete, start from yesterday
  let cursor = new Date();
  if (!set.has(toYMD(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (set.has(toYMD(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function toYMD(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
