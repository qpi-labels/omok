import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  points: number;
  rankBadge: string;
}

export const getRankBadge = (points: number) => {
  if (points >= 4000) return 'Diamond';
  if (points >= 2000) return 'Platinum';
  if (points >= 1000) return 'Gold';
  if (points >= 500) return 'Silver';
  return 'Bronze';
};

export const updateGlobalLeaderboard = async (userEntry: LeaderboardEntry) => {
  // If db is not initialized properly (e.g. env vars missing), silently fail
  if (!db) return;

  const leaderboardRef = doc(db, 'leaderboard', 'global');

  try {
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(leaderboardRef);
      
      let topPlayers: LeaderboardEntry[] = [];
      if (docSnap.exists()) {
        topPlayers = docSnap.data().topPlayers || [];
      }

      // Check if user qualifies for top 100
      const existingUserIndex = topPlayers.findIndex(p => p.uid === userEntry.uid);
      
      if (existingUserIndex !== -1) {
        // User is already in leaderboard, update their score
        topPlayers[existingUserIndex] = userEntry;
      } else {
        // User not in leaderboard, check if they qualify
        if (topPlayers.length < 100 || userEntry.points > topPlayers[topPlayers.length - 1].points) {
          topPlayers.push(userEntry);
        } else {
          // Doesn't qualify, don't write anything to save write cost!
          return;
        }
      }

      // Sort and keep top 100
      topPlayers.sort((a, b) => b.points - a.points);
      topPlayers = topPlayers.slice(0, 100);

      transaction.set(leaderboardRef, { topPlayers });
    });
  } catch (error) {
    console.error('Error updating leaderboard:', error);
  }
};
