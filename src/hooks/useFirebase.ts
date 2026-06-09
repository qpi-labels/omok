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
              losses: 0
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

  const updateGameResult = useCallback(async (difficulty: Difficulty, isWin: boolean) => {
    if (!user || !profile || !db) return;

    const pointsMap = {
      'easy': { win: 10, loss: -5 },
      'normal': { win: 20, loss: -10 },
      'hard': { win: 40, loss: -20 },
      'expert': { win: 80, loss: -40 },
      'god': { win: 200, loss: -100 }
    };

    const deltaPoints = isWin ? pointsMap[difficulty].win : pointsMap[difficulty].loss;
    const newPoints = Math.max(0, profile.points + deltaPoints);
    const actualDelta = newPoints - profile.points;

    const userRef = doc(db, 'users', user.uid);
    
    // Optimistic UI update
    const updatedProfile = {
      ...profile,
      points: newPoints,
      wins: profile.wins + (isWin ? 1 : 0),
      losses: profile.losses + (isWin ? 0 : 1)
    };
    setProfile(updatedProfile);

    try {
      // 1. Update user document
      await setDoc(userRef, {
        points: increment(actualDelta),
        wins: increment(isWin ? 1 : 0),
        losses: increment(isWin ? 0 : 1),
        displayName: user.displayName || 'Guest',
        photoURL: user.photoURL || ''
      }, { merge: true });

      // 2. Conditionally update global leaderboard
      await updateGlobalLeaderboard({
        uid: user.uid,
        displayName: user.displayName || 'Guest',
        points: newPoints,
        rankBadge: getRankBadge(newPoints)
      });
    } catch (error) {
      console.error('Error updating game result:', error);
      setProfile(profile); // Revert optimistic update
    }
  }, [user, profile]);

  return {
    user,
    profile,
    isLoading,
    loginWithGoogle,
    logout,
    updateGameResult,
    rankBadge: profile ? getRankBadge(profile.points) : 'Unranked'
  };
};
