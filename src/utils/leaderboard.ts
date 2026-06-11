import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';

let omokCache: { topUids: Set<string>, minPoints: number } | null = null;
let alkkagiCache: { topUids: Set<string>, minPoints: number } | null = null;

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  points: number;
  rankBadge: string;
  govatarPlayStyle?: number;
  govatarDifficulty?: string;
}

export const getRankBadge = (points: number) => {
  if (points >= 4000) return 'Diamond';
  if (points >= 2000) return 'Platinum';
  if (points >= 1000) return 'Gold';
  if (points >= 500) return 'Silver';
  return 'Bronze';
};

export const updateGlobalLeaderboard = async (userEntry: LeaderboardEntry, category: 'omok' | 'alkkagi' = 'omok') => {
  // If db is not initialized properly (e.g. env vars missing), silently fail
  if (!db) return;

  const currentCache = category === 'omok' ? omokCache : alkkagiCache;

  // Optimistic cache check to avoid unnecessary transaction reads
  if (currentCache) {
    if (!currentCache.topUids.has(userEntry.uid) && userEntry.points <= currentCache.minPoints) {
      return; // Does not qualify, skip read
    }
  }

  const docKey = category === 'omok' ? 'global' : 'alkkagi';
  const leaderboardRef = doc(db, 'leaderboard', docKey);

  try {
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(leaderboardRef);
      
      let topPlayers: LeaderboardEntry[] = [];
      if (docSnap.exists()) {
        topPlayers = docSnap.data().topPlayers || [];
      }

      const existingUserIndex = topPlayers.findIndex(p => p.uid === userEntry.uid);
      
      if (existingUserIndex !== -1) {
        topPlayers[existingUserIndex] = userEntry;
      } else {
        if (topPlayers.length < 100 || userEntry.points > topPlayers[topPlayers.length - 1].points) {
          topPlayers.push(userEntry);
        } else {
          // Cache the state even if not written, to prevent future reads
          const newCache = {
            topUids: new Set(topPlayers.map(p => p.uid)),
            minPoints: topPlayers.length === 100 ? topPlayers[99].points : 0
          };
          if (category === 'omok') omokCache = newCache;
          else alkkagiCache = newCache;
          return;
        }
      }

      topPlayers.sort((a, b) => b.points - a.points);
      topPlayers = topPlayers.slice(0, 100);

      // Update cache
      const updatedCache = {
        topUids: new Set(topPlayers.map(p => p.uid)),
        minPoints: topPlayers.length === 100 ? topPlayers[99].points : 0
      };
      if (category === 'omok') omokCache = updatedCache;
      else alkkagiCache = updatedCache;

      transaction.set(leaderboardRef, { topPlayers });
    });
  } catch (error) {
    console.error('Error updating leaderboard:', error);
  }
};
