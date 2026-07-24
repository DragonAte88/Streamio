export {};

declare global {
  interface Window {
    player: {
      start: () => Promise<boolean>;
      load: (url: string) => Promise<boolean>;
      play: () => Promise<void>;
      pause: () => Promise<void>;
      seek: (seconds: number, mode?: string) => Promise<void>;
      setVolume: (vol: number) => Promise<void>;
      stop: () => Promise<boolean>;
      setBounds: (bounds: { x: number; y: number; width: number; height: number; visible: boolean }) => void;
      onPropertyChange: (cb: (msg: any) => void) => () => void;
      onExit: (cb: (msg: any) => void) => () => void;
    };
    discord: {
      setWatching: (channelName: string) => Promise<void>;
      clear: () => Promise<void>;
    };
  }
}
