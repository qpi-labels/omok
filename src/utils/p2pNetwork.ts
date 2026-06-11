import Peer, { DataConnection } from 'peerjs';

export interface P2PPayload {
  type: 'init' | 'gameMode' | 'omokState' | 'alkkagiState' | 'reset' | 'ping';
  gameMode?: 'omok' | 'alkkagi';
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
  user?: {
    uid: string;
    displayName: string;
    photoURL: string;
  };
}

let peer: Peer | null = null;
let currentConnection: DataConnection | null = null;

export const initializePeer = (roomId: string): Promise<Peer> => {
  return new Promise((resolve, reject) => {
    if (peer) {
      peer.destroy();
    }

    // Connect to the public PeerJS cloud server
    peer = new Peer(roomId, {
      debug: 1,
    });

    peer.on('open', (id) => {
      console.log('Peer connected with ID:', id);
      resolve(peer!);
    });

    peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      reject(err);
    });
  });
};

export const connectToPeer = (targetRoomId: string): Promise<DataConnection> => {
  return new Promise((resolve, reject) => {
    // Generate a random ID for the guest
    const guestId = 'GUEST_' + Math.random().toString(36).substring(2, 9).toUpperCase();
    
    if (peer) {
      peer.destroy();
    }

    peer = new Peer(guestId, {
      debug: 1,
    });

    peer.on('open', () => {
      const conn = peer!.connect(targetRoomId, {
        reliable: true,
      });

      conn.on('open', () => {
        currentConnection = conn;
        resolve(conn);
      });

      conn.on('error', (err) => {
        reject(err);
      });

      // Timeout safety
      setTimeout(() => {
        if (!currentConnection) {
          reject(new Error('P2P 연결 시간 초과. 방 코드가 정확한지 확인하세요.'));
        }
      }, 8000);
    });

    peer.on('error', (err) => {
      reject(err);
    });
  });
};

export const sendP2PData = (data: P2PPayload) => {
  if (currentConnection && currentConnection.open) {
    currentConnection.send(data);
  }
};

export const registerConnection = (conn: DataConnection) => {
  currentConnection = conn;
};

export const closeP2P = () => {
  if (currentConnection) {
    currentConnection.close();
    currentConnection = null;
  }
  if (peer) {
    peer.destroy();
    peer = null;
  }
};
