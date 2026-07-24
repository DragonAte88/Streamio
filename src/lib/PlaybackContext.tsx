import React, { createContext, useContext, useState, useEffect } from "react";
import { Channel } from "./playlist";

export interface PlaybackItem extends Channel {
  wcoUrl?: string; // Original URL if it needs extraction
  title?: string;
}

interface PlaybackState {
  playing: PlaybackItem | null;
  queue: PlaybackItem[];
  play: (item: PlaybackItem, queue?: PlaybackItem[]) => void;
  playNext: () => void;
  close: () => void;
  isExtractingNext: boolean;
}

const PlaybackContext = createContext<PlaybackState | null>(null);

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const [playing, setPlaying] = useState<PlaybackItem | null>(null);
  const [queue, setQueue] = useState<PlaybackItem[]>([]);
  const [isExtractingNext, setIsExtractingNext] = useState(false);

  const play = (item: PlaybackItem, newQueue?: PlaybackItem[]) => {
    setPlaying(item);
    if (newQueue) setQueue(newQueue);
  };

  const playNext = async () => {
    if (queue.length === 0) {
      setPlaying(null);
      return;
    }
    
    const nextItem = queue[0];
    const newQueue = queue.slice(1);
    
    if (nextItem.wcoUrl) {
      setIsExtractingNext(true);
      try {
        const videoUrl = await window.wco.extractVideo(nextItem.wcoUrl);
        if (videoUrl) {
          setPlaying({ ...nextItem, url: videoUrl });
          setQueue(newQueue);
        } else {
          console.error("Failed to extract video for next item");
          // Skip to next?
          setQueue(newQueue);
        }
      } catch (err) {
        console.error("Extraction error:", err);
        setQueue(newQueue);
      } finally {
        setIsExtractingNext(false);
      }
    } else {
      setPlaying(nextItem);
      setQueue(newQueue);
    }
  };

  useEffect(() => {
    // Listen for EOF from MPV
    const handleMpvEvent = (msg: any) => {
      if (msg.event === 'end-file' && msg.reason === 'eof') {
        playNext();
      }
    };
    
    // We need to attach this to player if possible, but player.onExit is the only thing currently exposed?
    // Let's assume we can add onEvent to window.player
    let cleanup = () => {};
    if (window.player && window.player.onEndFile) {
       cleanup = window.player.onEndFile(handleMpvEvent);
    }

    return () => cleanup();
  }, [queue]); // Re-bind when queue changes to have latest playNext closure

  return (
    <PlaybackContext.Provider value={{ playing, queue, play, playNext, close: () => setPlaying(null), isExtractingNext }}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback must be used within PlaybackProvider");
  return ctx;
}
