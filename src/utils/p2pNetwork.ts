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
    turnCount: number;
  };
  assignedRole?: 'black' | 'white';
  user?: {
    uid: string;
    displayName: string;
    photoURL: string;
  };
}

let peer: Peer | null = null;
let currentConnection: DataConnection | null = null;

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

export const initializePeer = (roomId: string): Promise<Peer> => {
  return new Promise((resolve, reject) => {
    // Clean up previous state completely
    if (currentConnection) {
      currentConnection.close();
      currentConnection = null;
    }
    if (peer) {
      peer.destroy();
      peer = null;
    }

    peer = new Peer(roomId, {
      debug: 2,
      config: ICE_SERVERS
    });

    const timeoutId = setTimeout(() => {
      console.error('[P2P] Signaling server connection timed out (15s)');
      if (peer) {
        peer.destroy();
        peer = null;
      }
      reject(new Error('시그널링 서버 연결 시간 초과. 네트워크를 확인하세요.'));
    }, 15000);

    peer.on('open', (id) => {
      clearTimeout(timeoutId);
      console.log('[P2P] Host peer registered with ID:', id);
      resolve(peer!);
    });

    peer.on('disconnected', () => {
      console.warn('[P2P] Host disconnected from signaling server, attempting reconnect...');
      if (peer && !peer.destroyed) {
        peer.reconnect();
      }
    });

    peer.on('error', (err) => {
      clearTimeout(timeoutId);
      console.error('[P2P] Host peer error:', err.type, err.message);

      // If the ID is taken, retry with a different suffix
      if ((err as any).type === 'unavailable-id') {
        console.warn('[P2P] Room ID taken, retrying with new ID...');
        const newId = roomId + '_' + Math.random().toString(36).substring(2, 4).toUpperCase();
        if (peer) { peer.destroy(); peer = null; }
        // Retry once with modified ID
        const retryPeer = new Peer(newId, { debug: 2, config: ICE_SERVERS });
        retryPeer.on('open', (id) => {
          peer = retryPeer;
          console.log('[P2P] Host peer registered with retry ID:', id);
          resolve(retryPeer);
        });
        retryPeer.on('error', (retryErr) => {
          console.error('[P2P] Retry also failed:', retryErr);
          reject(retryErr);
        });
      } else {
        reject(err);
      }
    });
  });
};

export const connectToPeer = (targetRoomId: string): Promise<DataConnection> => {
  return new Promise((resolve, reject) => {
    let settled = false;

    // Clean up previous state completely
    if (currentConnection) {
      currentConnection.close();
      currentConnection = null;
    }
    if (peer) {
      peer.destroy();
      peer = null;
    }

    const guestId = 'GUEST_' + Math.random().toString(36).substring(2, 9).toUpperCase();

    peer = new Peer(guestId, {
      debug: 2,
      config: ICE_SERVERS
    });

    const finish = (error?: Error, conn?: DataConnection) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimeout);
      if (error) {
        reject(error);
      } else if (conn) {
        currentConnection = conn;
        resolve(conn);
      }
    };

    const connectTimeout = setTimeout(() => {
      console.error('[P2P] Connection timed out (15s). Target:', targetRoomId);
      finish(new Error('P2P 연결 시간 초과 (15초). 방 코드가 정확한지, 방장이 대기 중인지 확인하세요.'));
    }, 15000);

    peer.on('open', () => {
      console.log('[P2P] Guest peer connected to signaling server, connecting to room:', targetRoomId);

      const conn = peer!.connect(targetRoomId, {
        reliable: true,
      });

      conn.on('open', () => {
        console.log('[P2P] Data channel opened to host successfully');
        finish(undefined, conn);
      });

      conn.on('error', (err) => {
        console.error('[P2P] Data connection error:', err);
        finish(new Error('데이터 연결 오류: ' + err.message));
      });
    });

    peer.on('disconnected', () => {
      console.warn('[P2P] Guest disconnected from signaling server, attempting reconnect...');
      if (peer && !peer.destroyed) {
        peer.reconnect();
      }
    });

    peer.on('error', (err) => {
      console.error('[P2P] Guest peer error:', (err as any).type, err.message);

      if ((err as any).type === 'peer-unavailable') {
        finish(new Error('해당 방을 찾을 수 없습니다. 방 코드가 정확한지, 방장이 아직 대기 중인지 확인하세요.'));
      } else {
        finish(new Error('P2P 오류: ' + err.message));
      }
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
