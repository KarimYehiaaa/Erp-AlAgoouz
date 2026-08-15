/**
 * Augmentation for the `ws` WebSocket instances that the app extends with
 * custom fields in websocketService.
 */
declare module 'ws' {
  interface WebSocket {
    userId?: number;
    isAlive?: boolean;
  }
}

export {};
