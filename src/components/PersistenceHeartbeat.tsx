import { useEffect } from "react";
import { useAuth } from "../lib/auth";
import { usePlayback } from "../lib/PlaybackContext";
import { setPresence, recordHistory } from "../lib/api";

const INTERVAL_MS = 1.7 * 60 * 1000; // 1.7 minutes, as specified

export default function PersistenceHeartbeat() {
  const { token, user } = useAuth();
  const { playing } = usePlayback();

  useEffect(() => {
    const tick = () => {
      if (!token || !user) return;
      if (user.status !== "offline" && user.status !== "invisible") {
        setPresence(token, user.status).catch(() => {});
      }
      if (playing) {
        recordHistory(token, playing.id).catch(() => {});
      }
    };
    const interval = setInterval(tick, INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token, user, playing]);

  return null;
}
