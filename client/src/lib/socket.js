// ONE shared socket for the whole app. Pages import connectSocket(); they never call io() themselves.
import { io } from 'socket.io-client';
import { getToken } from './api';

let socket = null;

export function connectSocket() {
  if (!socket) {
    socket = io({
      auth: (cb) => cb({ token: getToken() }),   // fresh token on every (re)connect
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 10000,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
