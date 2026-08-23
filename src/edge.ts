/**
 * The edge: where events over time become state.
 * Streams (websockets, timers, pointer events) live out here; each event
 * lands in the store as a batched signal write.
 */
import { batch, computed, signal, type Computed, type Signal } from './signals';

export interface Series {
  /** Append a sample; null marks a gap (a dead source draws a hole, not a frozen line). */
  push(v: number | null): void;
  clear(): void;
  /** Reactive read — an effect that calls read() re-runs on every push/clear. */
  read(): readonly (number | null)[];
  readonly capacity: number;
}

/**
 * Fixed-capacity rolling buffer for live metrics (sparklines, loss curves).
 * Mutates in place — no per-sample copying — and notifies through one
 * internal version signal, so consumers never call trigger() themselves.
 */
export function series(capacity = 600): Series {
  const buffer: (number | null)[] = [];
  const version = signal(0);
  return Object.freeze({
    capacity,
    push(v: number | null) {
      buffer.push(v);
      if (buffer.length > capacity) buffer.shift();
      version(version() + 1);
    },
    clear() {
      buffer.length = 0;
      version(version() + 1);
    },
    read() {
      version();
      return buffer as readonly (number | null)[];
    },
  });
}

export interface SocketOptions {
  /** Called with JSON.parse'd data, inside a batch — write signals freely. */
  onMessage: (data: unknown) => void;
  /** Reconnect delay after a drop. Default 1000ms. Infinite retries until close(). */
  reconnectMs?: number;
}

export interface Socket {
  readonly connected: Computed<boolean>;
  /** Sends JSON; returns false (and drops the message) when not connected. */
  send(data: unknown): boolean;
  close(): void;
}

/**
 * WebSocket → store, with auto-reconnect. `url` may be a function so each
 * (re)connect can build a cursor query like `?since=${lastSeq()}`.
 */
export function connect(url: string | (() => string), opts: SocketOptions): Socket {
  const reconnectMs = opts.reconnectMs ?? 1000;
  const isConnected: Signal<boolean> = signal(false);
  let ws: WebSocket | null = null;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    try {
      ws = new WebSocket(typeof url === 'function' ? url() : url);
    } catch (err) {
      // A synchronous constructor throw (bad URL, mixed content on https) is
      // a config error, not a network drop: report once, stop, and leave the
      // rest of the app running — no retry storm against a URL that can
      // never work. connected() stays false.
      console.error('plainpanel: connect() failed —', err);
      return;
    }
    ws.onopen = () => isConnected(true);
    ws.onmessage = (e) => batch(() => opts.onMessage(JSON.parse(e.data)));
    ws.onclose = () => {
      isConnected(false);
      if (!closed) timer = setTimeout(open, reconnectMs);
    };
    ws.onerror = () => ws?.close(); // funnel errors into the reconnect path
  };
  open();

  return {
    connected: computed(() => isConnected()),
    send(data: unknown) {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(data));
      return true;
    },
    close() {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    },
  };
}
