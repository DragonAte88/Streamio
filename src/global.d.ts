export {};

declare global {
  interface Window {
    player: {
      start: (meta?: { channelName: string; backLabel: string }) => Promise<boolean>;
      load: (url: string) => Promise<boolean>;
      play: () => Promise<void>;
      pause: () => Promise<void>;
      seek: (seconds: number, mode?: string) => Promise<void>;
      setVolume: (vol: number) => Promise<void>;
      stop: () => Promise<boolean>;
      setBounds: (bounds: { x: number; y: number; width: number; height: number; visible: boolean }) => void;
      onPropertyChange: (cb: (msg: any) => void) => () => void;
      onExit: (cb: (msg: any) => void) => () => void;
      onEndFile: (cb: (msg: any) => void) => () => void;
      onBack: (cb: () => void) => () => void;
    };
    discord: {
      setWatching: (channelName: string) => Promise<void>;
      clear: () => Promise<void>;
      startOAuth: () => Promise<string>;
      isConnected: () => Promise<{ connected: boolean; username: string | null }>;
    };
    system: {
      getStats: () => Promise<{
        cpu: { percent: number; model?: string; cores: number };
        memory: { totalBytes: number; freeBytes: number };
        disk: { totalBytes: number; freeBytes: number } | null;
        network: { totalReceivedBytes: number; totalSentBytes: number } | null;
        gpu: any;
        platform: string;
        arch: string;
        hostname: string;
        uptimeSeconds: number;
      }>;
    };
    updater: {
      check: () => Promise<void>;
      download: () => Promise<void>;
      install: () => Promise<void>;
      onStatus: (
        cb: (status: { state: string; version?: string; percent?: number; message?: string; releaseNotes?: string }) => void
      ) => () => void;
      onRestartCountdown: (cb: (payload: { secondsLeft: number }) => void) => () => void;
    };
    wco: {
      search: (query: string, filter: "dub"|"sub"|"cartoon"|"all") => Promise<{title: string, url: string}[]>;
      getEpisodes: (url: string) => Promise<{title: string, url: string}[]>;
      extractVideo: (url: string) => Promise<string | null>;
      getList: (type: string) => Promise<{title: string, url: string}[]>;
      refresh: () => Promise<{ ok: boolean; ts: number }>;
    };
  }
}
