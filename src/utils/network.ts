import { doc, setDoc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Collection to store active multiplayer rooms
// A room doc has schema:
// {
//   id: string,                 // room code / doc ID
//   gameMode: 'omok' | 'alkkagi',
//   omokState: { board, lastMove, currentPlayer, winner, winningLine, decidedColor, hasStarted },
//   alkkagiState: { stones, currentPlayer, winner, isSimulating },
//   blackPlayer: { uid, displayName, photoURL },
//   whitePlayer: { uid, displayName, photoURL },
//   createdBy: string (uid),
//   status: 'waiting' | 'active' | 'closed',
//   lastActionTime: number
// }

export interface NetworkRoom {
  id: string;
  gameMode: 'omok' | 'alkkagi';
  omokState?: {
    board: any[][] | string;
    lastMove: any;
    currentPlayer: 'black' | 'white';
    winner: any;
    winningLine: any[];
    decidedColor: 'black' | 'white' | null;
    hasStarted: boolean;
  };
  alkkagiState?: {
    stones: any[];
    currentPlayer: 'black' | 'white';
    winner: any;
    isSimulating: boolean;
  };
  blackPlayer?: { uid: string; displayName: string; photoURL: string } | null;
  whitePlayer?: { uid: string; displayName: string; photoURL: string } | null;
  createdBy: string;
  status: 'waiting' | 'active' | 'closed';
  lastActionTime: number;
}

export const createNetworkRoom = async (
  roomId: string,
  user: { uid: string; displayName: string; photoURL: string },
  gameMode: 'omok' | 'alkkagi',
  initialAlkkagiStones: any[] = []
): Promise<void> => {
  if (!db) return;
  const roomRef = doc(db, 'multiplayerRooms', roomId);

  const newRoom: NetworkRoom = {
    id: roomId,
    gameMode,
    createdBy: user.uid,
    status: 'waiting',
    lastActionTime: Date.now(),
    blackPlayer: { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL },
    whitePlayer: null,
    omokState: {
      board: JSON.stringify(Array(15).fill(null).map(() => Array(15).fill(null))),
      lastMove: null,
      currentPlayer: 'black',
      winner: null,
      winningLine: [],
      decidedColor: 'black',
      hasStarted: true
    },
    alkkagiState: {
      stones: initialAlkkagiStones,
      currentPlayer: 'black',
      winner: null,
      isSimulating: false
    }
  };

  await setDoc(roomRef, newRoom);
};

export const joinNetworkRoom = async (
  roomId: string,
  user: { uid: string; displayName: string; photoURL: string }
): Promise<NetworkRoom | null> => {
  if (!db) return null;
  const roomRef = doc(db, 'multiplayerRooms', roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) {
    throw new Error('방이 존재하지 않습니다.');
  }

  const roomData = snap.data() as NetworkRoom;
  if (roomData.blackPlayer?.uid === user.uid) {
    return roomData; // Rejoining
  }

  if (roomData.whitePlayer && roomData.whitePlayer.uid !== user.uid) {
    throw new Error('방이 이미 가득 찼습니다.');
  }

  // Join as white player
  const updates: Partial<NetworkRoom> = {
    whitePlayer: { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL },
    status: 'active',
    lastActionTime: Date.now()
  };

  await updateDoc(roomRef, updates);
  return { ...roomData, ...updates };
};

export const updateRoomState = async (
  roomId: string,
  gameMode: 'omok' | 'alkkagi',
  gameState: any
): Promise<void> => {
  if (!db) return;
  const roomRef = doc(db, 'multiplayerRooms', roomId);
  const updateKey = gameMode === 'omok' ? 'omokState' : 'alkkagiState';

  await updateDoc(roomRef, {
    [updateKey]: gameState,
    gameMode, // Keep track of current game mode
    lastActionTime: Date.now()
  });
};

export const changeRoomGameMode = async (
  roomId: string,
  gameMode: 'omok' | 'alkkagi',
  initialAlkkagiStones: any[] = []
): Promise<void> => {
  if (!db) return;
  const roomRef = doc(db, 'multiplayerRooms', roomId);

  await updateDoc(roomRef, {
    gameMode,
    omokState: {
      board: JSON.stringify(Array(15).fill(null).map(() => Array(15).fill(null))),
      lastMove: null,
      currentPlayer: 'black',
      winner: null,
      winningLine: [],
      decidedColor: 'black',
      hasStarted: true
    },
    alkkagiState: {
      stones: initialAlkkagiStones,
      currentPlayer: 'black',
      winner: null,
      isSimulating: false
    },
    lastActionTime: Date.now()
  });
};

export const subscribeToRoom = (
  roomId: string,
  onUpdate: (room: NetworkRoom) => void,
  onError: (err: any) => void
) => {
  if (!db) return () => {};
  const roomRef = doc(db, 'multiplayerRooms', roomId);
  return onSnapshot(roomRef, (snapshot) => {
    if (snapshot.exists()) {
      onUpdate(snapshot.data() as NetworkRoom);
    }
  }, onError);
};
