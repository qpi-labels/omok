import { useState, useEffect, useCallback } from 'react';
import { auth, db, googleProvider } from '../firebase';
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, increment } from 'firebase/firestore';
import { updateGlobalLeaderboard, getRankBadge } from '../utils/leaderboard';
import { Difficulty } from './useOmok';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  points: number;
  wins: number;
  losses: number;
  alkkagiPoints?: number;
  alkkagiWins?: number;
  alkkagiLosses?: number;
  govatarGamesPlayed?: number;
  govatarAvgTurns?: number;
  govatarAvgSkill?: number;
  govatarPlayStyle?: number | null;
  govatarDifficulty?: Difficulty | null;
  govatarTrainingMode?: boolean;
  govatarRewardReceived?: boolean;
}

export const useFirebase = () => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser && db) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userRef);
          
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              displayName: currentUser.displayName || 'Guest',
              photoURL: currentUser.photoURL || '',
              points: 0,
              wins: 0,
              losses: 0,
              alkkagiPoints: 0,
              alkkagiWins: 0,
              alkkagiLosses: 0,
              govatarGamesPlayed: 0,
              govatarAvgTurns: 0,
              govatarAvgSkill: 0,
              govatarPlayStyle: null,
              govatarDifficulty: null,
              govatarTrainingMode: false,
              govatarRewardReceived: false
            };
            await setDoc(userRef, newProfile);
            setProfile(newProfile);
          }
        } catch (e) {
          console.error("Failed to sync user profile. Check Firebase config.", e);
        }
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    if (!auth) return;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error logging in with Google', error);
    }
  };

  const logout = async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
  };

  const updateGameResult = useCallback(async (difficulty: Difficulty, isWin: boolean, turnsPlayed: number = 0, govatarOpponent?: { uid: string; name: string; playStyle: number; difficulty: Difficulty } | null) => {
    if (!user || !profile || !db) return;

    const pointsMap: Record<Difficulty, { win: number; loss: number }> = {
      'easy': { win: 10, loss: -5 },
      'normal': { win: 20, loss: -10 },
      'hard': { win: 40, loss: -20 },
      'expert': { win: 80, loss: -40 },
      'god': { win: 200, loss: -100 },
      'transcendent': { win: 500, loss: -200 }
    };

    let govatarGamesPlayed = profile.govatarGamesPlayed || 0;
    let govatarAvgTurns = profile.govatarAvgTurns || 0;
    let govatarAvgSkill = profile.govatarAvgSkill || 0;
    
    let govatarPlayStyle = profile.govatarPlayStyle || null;
    let govatarDifficulty = profile.govatarDifficulty || null;
    let govatarTrainingMode = profile.govatarTrainingMode || false;
    let govatarRewardReceived = profile.govatarRewardReceived || false;

    // During training mode, regular win/loss points and stats are NOT updated.
    const deltaPoints = govatarTrainingMode ? 0 : (isWin ? pointsMap[difficulty].win : pointsMap[difficulty].loss);
    let newPoints = Math.max(0, profile.points + deltaPoints);
    let actualDelta = newPoints - profile.points;

    const difficultyScores: Record<Difficulty, number> = {
      'easy': 1, 'normal': 2, 'hard': 3, 'expert': 4, 'god': 5, 'transcendent': 6
    };
    const diffScore = difficultyScores[difficulty] || 2;
    const gameSkillScore = isWin ? diffScore : Math.max(1, diffScore - 1);

    if (govatarTrainingMode) {
      govatarGamesPlayed += 1;
      govatarAvgTurns += turnsPlayed;
      govatarAvgSkill += gameSkillScore;

      if (govatarGamesPlayed === 5) {
        const avgTurns = govatarAvgTurns / 5;
        // Short games (<20) = 1.0 (aggressive), Long games (>60) = 0.0 (defensive)
        govatarPlayStyle = Math.max(0, Math.min(1, 1 - (avgTurns - 20) / 40));
        
        const avgSkill = Math.round(govatarAvgSkill / 5);
        const diffMap: Record<number, Difficulty> = { 1: 'easy', 2: 'normal', 3: 'hard', 4: 'expert', 5: 'god', 6: 'transcendent' };
        govatarDifficulty = diffMap[avgSkill] || 'normal';
        govatarTrainingMode = false; // Turn off training mode after completing
      }
    }

    if (govatarDifficulty && !govatarRewardReceived && govatarGamesPlayed >= 5) {
      const rewardMap: Record<Difficulty, number> = {
        'easy': 50,
        'normal': 150,
        'hard': 400,
        'expert': 1000,
        'god': 2500,
        'transcendent': 5000
      };
      const bonusPoints = rewardMap[govatarDifficulty];
      govatarRewardReceived = true;
      newPoints += bonusPoints;
      actualDelta += bonusPoints;
      // Optional: Could trigger a notification here if we had a toast system
    }

    const userRef = doc(db, 'users', user.uid);
    
    const incrementWins = govatarTrainingMode ? 0 : (isWin ? 1 : 0);
    const incrementLosses = govatarTrainingMode ? 0 : (isWin ? 0 : 1);

    // Optimistic UI update
    const updatedProfile = {
      ...profile,
      points: newPoints,
      wins: profile.wins + incrementWins,
      losses: profile.losses + incrementLosses,
      govatarGamesPlayed,
      govatarAvgTurns,
      govatarAvgSkill,
      govatarPlayStyle,
      govatarDifficulty,
      govatarTrainingMode,
      govatarRewardReceived
    };
    setProfile(updatedProfile);

    try {
      // 1. Update user document
      await setDoc(userRef, {
        points: increment(actualDelta),
        wins: increment(incrementWins),
        losses: increment(incrementLosses),
        govatarGamesPlayed,
        govatarAvgTurns,
        govatarAvgSkill,
        ...(govatarPlayStyle !== null && { govatarPlayStyle }),
        ...(govatarDifficulty !== null && { govatarDifficulty }),
        govatarTrainingMode,
        govatarRewardReceived
        // We do NOT overwrite displayName or photoURL here to preserve custom nicknames
      }, { merge: true });

      // 2. Conditionally update global leaderboard
      await updateGlobalLeaderboard({
        uid: user.uid,
        displayName: profile.displayName || user.displayName || 'Guest',
        points: newPoints,
        rankBadge: getRankBadge(newPoints),
        ...(govatarPlayStyle !== null && { govatarPlayStyle }),
        ...(govatarDifficulty !== null && { govatarDifficulty: govatarDifficulty as string })
      });

      // 3. Passive Income for Govatar Owner (if player loses against a Govatar)
      if (!isWin && govatarOpponent && govatarOpponent.uid !== user.uid) {
        try {
          const ownerRef = doc(db, 'users', govatarOpponent.uid);
          const ownerSnap = await getDoc(ownerRef);
          if (ownerSnap.exists()) {
            const ownerData = ownerSnap.data() as UserProfile;
            const passivePointsMap: Record<Difficulty, number> = {
              'easy': 2, 'normal': 5, 'hard': 10, 'expert': 20, 'god': 50, 'transcendent': 100
            };
            const passivePoints = passivePointsMap[govatarOpponent.difficulty] || 5;
            const newOwnerPoints = (ownerData.points || 0) + passivePoints;
            
            await setDoc(ownerRef, { points: increment(passivePoints) }, { merge: true });
            
            await updateGlobalLeaderboard({
              uid: ownerData.uid,
              displayName: ownerData.displayName || 'Player',
              points: newOwnerPoints,
              rankBadge: getRankBadge(newOwnerPoints),
              ...(ownerData.govatarPlayStyle !== null && ownerData.govatarPlayStyle !== undefined && { govatarPlayStyle: ownerData.govatarPlayStyle }),
              ...(ownerData.govatarDifficulty !== null && ownerData.govatarDifficulty !== undefined && { govatarDifficulty: ownerData.govatarDifficulty as string })
            });
          }
        } catch (e) {
          console.error("Failed to give passive income:", e);
        }
      }
    } catch (error) {
      console.error('Error updating game result:', error);
      setProfile(profile); // Revert optimistic update
    }
  }, [user, profile]);

  const updateAlkkagiResult = useCallback(async (isWin: boolean) => {
    if (!user || !profile || !db) return;

    // Simple Alkkagi Elo: Win gives +20, Loss gives -10
    const currentAlkkagiPoints = profile.alkkagiPoints || 0;
    const deltaPoints = isWin ? 20 : -10;
    const newPoints = Math.max(0, currentAlkkagiPoints + deltaPoints);
    const actualDelta = newPoints - currentAlkkagiPoints;

    const incrementWins = isWin ? 1 : 0;
    const incrementLosses = isWin ? 0 : 1;

    const userRef = doc(db, 'users', user.uid);

    // Optimistic UI update
    const updatedProfile = {
      ...profile,
      alkkagiPoints: newPoints,
      alkkagiWins: (profile.alkkagiWins || 0) + incrementWins,
      alkkagiLosses: (profile.alkkagiLosses || 0) + incrementLosses,
    };
    setProfile(updatedProfile);

    try {
      await setDoc(userRef, {
        alkkagiPoints: increment(actualDelta),
        alkkagiWins: increment(incrementWins),
        alkkagiLosses: increment(incrementLosses),
      }, { merge: true });

      await updateGlobalLeaderboard({
        uid: user.uid,
        displayName: profile.displayName || user.displayName || 'Guest',
        points: newPoints,
        rankBadge: getRankBadge(newPoints),
      }, 'alkkagi');

    } catch (error) {
      console.error('Error updating alkkagi result:', error);
      setProfile(profile); // Revert optimistic update
    }
  }, [user, profile]);

  const updateNickname = async (newNickname: string) => {
    if (!user || !profile || !db) return;
    const userRef = doc(db, 'users', user.uid);
    
    // Optimistic UI update
    setProfile({ ...profile, displayName: newNickname });
    
    try {
      await setDoc(userRef, { displayName: newNickname }, { merge: true });
      
      // Update global leaderboard so their new name shows up
      await updateGlobalLeaderboard({
        uid: user.uid,
        displayName: newNickname,
        points: profile.points,
        rankBadge: getRankBadge(profile.points)
      }, 'omok');

      if (profile.alkkagiPoints !== undefined) {
        await updateGlobalLeaderboard({
          uid: user.uid,
          displayName: newNickname,
          points: profile.alkkagiPoints || 0,
          rankBadge: getRankBadge(profile.alkkagiPoints || 0)
        }, 'alkkagi');
      }
    } catch (error) {
      console.error('Error updating nickname:', error);
      setProfile(profile); // Revert on failure
    }
  };

  const startGovatarTraining = async () => {
    if (!user || !profile || !db) return;
    const userRef = doc(db, 'users', user.uid);
    const newProfileState = { 
      ...profile, 
      govatarGamesPlayed: 0, 
      govatarAvgTurns: 0, 
      govatarAvgSkill: 0, 
      govatarPlayStyle: null, 
      govatarDifficulty: null, 
      govatarTrainingMode: true 
    };
    setProfile(newProfileState);
    await setDoc(userRef, {
      govatarGamesPlayed: 0,
      govatarAvgTurns: 0,
      govatarAvgSkill: 0,
      govatarPlayStyle: null,
      govatarDifficulty: null,
      govatarTrainingMode: true
    }, { merge: true });
  };

  const cancelGovatarTraining = async () => {
    if (!user || !profile || !db) return;
    const userRef = doc(db, 'users', user.uid);
    setProfile({ 
      ...profile, 
      govatarGamesPlayed: 0, 
      govatarAvgTurns: 0, 
      govatarAvgSkill: 0, 
      govatarTrainingMode: false 
    });
    await setDoc(userRef, {
      govatarGamesPlayed: 0,
      govatarAvgTurns: 0,
      govatarAvgSkill: 0,
      govatarTrainingMode: false
    }, { merge: true });
  };

  return {
    user,
    profile,
    isLoading,
    loginWithGoogle,
    logout,
    updateGameResult,
    updateAlkkagiResult,
    updateNickname,
    startGovatarTraining,
    cancelGovatarTraining,
    rankBadge: profile ? getRankBadge(profile.points) : 'Unranked'
  };
};
