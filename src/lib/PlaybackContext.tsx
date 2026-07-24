import React, { createContext, useContext, useState } from "react";
import { Channel } from "./playlist";

interface PlaybackState {
  playing: Channel | null;
  play: (ch: Channel) => void;
  close: () => void;
}

const PlaybackContext = createContext<PlaybackState | null>(null);

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const [playing, setPlaying] = useState<Channel | null>(null);
  return (
    <PlaybackContext.Provider value={{ playing, play: setPlaying, close: () => setPlaying(null) }}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback must be used within PlaybackProvider");
  return ctx;
}
