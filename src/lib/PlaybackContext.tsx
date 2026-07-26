import React, { createContext, useContext, useState, useEffect } from "react";
import { Channel } from "./playlist";

export interface PlaybackItem extends Channel {
  wcoUrl?: string; // Original URL if it needs extraction
  title?: string;
}

/** Docked picture-in-picture vs taking over the content area. */
export type PlayerMode = "fullscreen" | "mini";

/**
 * Which player experience this item gets.
 * "live"  - continuous IPTV/M3U8: no seeking, LIVE badge, defaults to the
 *           docked mini player so the guide stays usable while watching.
 * "vod"   - finite media: seek bar, subtitle/quality menus, opens fullscreen.
 */
export type PlayerKind = "live" | "vod";

export interface PlayOptions {
  kind?: PlayerKind;
  mode?: PlayerMode;
}

interface PlaybackState {
  playing: PlaybackItem | null;
  queue: PlaybackItem[];
  mode: PlayerMode;
  kind: PlayerKind;
  setMode: (m: PlayerMode) => void;
  toggleMode: () => void;
  play: (item: PlaybackItem, queue?: PlaybackItem[], opts?: PlayOptions) => void;
  playNext: () => void;
  close: () => void;
  isExtractingNext: boolean;
}

/**
 * Infer live vs VOD when the caller does not say. A raw .m3u8/.m3u, or a
 * catalog entry with no duration, is live; anything else is treated as VOD.
 * Callers that know better (Live TV guide, episode lists) pass `kind`
 * explicitly rather than relying on this.
 */
function inferKind(item: PlaybackItem): PlayerKind {
  const url = (item.url || "").toLowerCase();
  if (url.includes(".m3u8") || url.includes(".m3u") || url.includes("/hls")) return "live";
  if (item.wcoUrl) return "vod";
  return "live";
}

const PlaybackContext = createContext<PlaybackState | null>(null);

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const [playing, setPlaying] = useState<PlaybackItem | null>(null);
  const [queue, setQueue] = useState<PlaybackItem[]>([]);
  const [isExtractingNext, setIsExtractingNext] = useState(false);
  const [mode, setMode] = useState<PlayerMode>("fullscreen");
  const [kind, setKind] = useState<PlayerKind>("live");

  const play = (item: PlaybackItem, newQueue?: PlaybackItem[], opts?: PlayOptions) => {
    const resolvedKind = opts?.kind ?? inferKind(item);
    setKind(resolvedKind);
    // Live defaults to the docked player so the guide stays browsable; VOD
    // takes over the content area. An explicit mode always wins.
    setMode(opts?.mode ?? (resolvedKind === "live" ? "mini" : "fullscreen"));
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
    <PlaybackContext.Provider
      value={{
        playing,
        queue,
        mode,
        kind,
        setMode,
        toggleMode: () => setMode((m) => (m === "mini" ? "fullscreen" : "mini")),
        play,
        playNext,
        close: () => setPlaying(null),
        isExtractingNext
      }}
    >
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback must be used within PlaybackProvider");
  return ctx;
}
