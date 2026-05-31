/**
 * socket.js
 * All Socket.IO logic for CF Duels arena.
 *
 * Usage:
 *   import { initSocket } from '/js/socket.js';
 *
 *   const { emitStartDuel } = initSocket({
 *     roomId, handle,
 *     onConnect, onDisconnect,
 *     onOpponentJoined, onDuelStarted, onDuelEnded, onError
 *   });
 *
 * This module owns the socket instance — arena.html never touches
 * the socket directly, it only calls the exported functions.
 */

const SOCKET_URL = window.location.origin; // Connects back to same host:port

let socket = null;

// ── Public: initialise ────────────────────────────────────────────────────────

export function initSocket({
  roomId,
  handle,
  onConnect    = () => {},
  onDisconnect = () => {},
  onOpponentJoined = () => {},
  onDuelStarted    = () => {},
  onDuelEnded      = () => {},
  onError          = () => {},
}) {
  if (!roomId || !handle) {
    onError('Cannot connect: roomId or handle is missing.');
    return { emitStartDuel: () => {} };
  }

  // ── Connect ──────────────────────────────────────────
  socket = io(SOCKET_URL, {
    reconnectionAttempts: 5,
    reconnectionDelay:    1500,
  });

  // ── Lifecycle events ─────────────────────────────────

  socket.on('connect', () => {
    console.log('[socket] Connected:', socket.id);
    onConnect();

    // Announce ourselves to the server room immediately
    socket.emit('join_room', { roomId, handle });
    console.log('[socket] Emitted join_room:', { roomId, handle });
  });

  socket.on('disconnect', (reason) => {
    console.warn('[socket] Disconnected:', reason);
    onDisconnect(reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[socket] Connection error:', err.message);
    onError(`Socket error: ${err.message}`);
  });

  // ── Game events ──────────────────────────────────────

  /**
   * room_update: fires when the second player joins via REST + socket.
   * Payload: { message: string }
   *
   * We infer the opponent's handle from the message because the current
   * backend sends only a message string. If your backend is updated to
   * send structured data ({ handle, participants }), update this handler.
   */
  socket.on('room_update', (data) => {
    console.log('[socket] room_update:', data);

    // Extract opponent handle from message if present
    // Expected message format: "<handle> has joined the room"
    const match = (data.message || '').match(/^(\S+)\s+has joined/i);
    const opponentHandle = match ? match[1] : data.handle ?? 'Opponent';

    // Only trigger phase B if it was actually someone else who joined
    if (opponentHandle.toLowerCase() !== handle.toLowerCase()) {
      onOpponentJoined(opponentHandle);
    }
  });

  /**
   * duel_started: fires when server has selected a fair problem.
   * Payload: { problem: { name, contest_id, index, rating? } }
   */
  socket.on('duel_started', (data) => {
    console.log('[socket] duel_started:', data);
    onDuelStarted(data);
  });

  /**
   * duel_ended: fires when a player solves the problem.
   * Payload: { winner: string, loser: string, message: string, problemId: string, timeTaken?: number }
   */
  socket.on('duel_ended', (data) => {
    console.log('[socket] duel_ended:', data);
    onDuelEnded(data);
  });

  // ── Return public emitters ────────────────────────────
  return { emitStartDuel };
}

// ── Public: start the duel (host only) ───────────────────────────────────────

/**
 * Emit start_duel to the server.
 * @param {{ roomId: string, handle1: string, handle2: string, targetRating: number }} params
 */
export function emitStartDuel({ roomId, handle1, handle2, targetRating }) {
  if (!socket?.connected) {
    console.error('[socket] Cannot start duel — socket not connected.');
    return;
  }

  const payload = { roomId, handle1, handle2, targetRating };
  console.log('[socket] Emitting start_duel:', payload);
  socket.emit('start_duel', payload);
}