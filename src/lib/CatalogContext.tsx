import React, { createContext, useContext, useEffect, useState } from "react";
import { Channel, groupChannels, parseM3U } from "./playlist";
import { DEMO_M3U } from "./demoPlaylist";
import { fetchCatalog } from "./api";

interface CatalogState {
  channels: Channel[];
  groups: ReturnType<typeof groupChannels>;
  source: "backend" | "demo" | null;
  loading: boolean;
  reload: () => void;
}

const CatalogContext = createContext<CatalogState | null>(null);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [source, setSource] = useState<"backend" | "demo" | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetchCatalog()
      .then((apiChannels) => {
        if (apiChannels.length === 0) throw new Error("empty catalog");
        setChannels(
          apiChannels.map((c) => ({
            id: String(c.id),
            name: c.name,
            url: c.url,
            logo: c.logo || undefined,
            group: c.group_name,
            tvgId: c.tvg_id || undefined
          }))
        );
        setSource("backend");
      })
      .catch(() => {
        setChannels(parseM3U(DEMO_M3U));
        setSource("demo");
      })
      .finally(() => setLoading(false));
  }, [tick]);

  const groups = groupChannels(channels);

  return (
    <CatalogContext.Provider value={{ channels, groups, source, loading, reload: () => setTick((t) => t + 1) }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}
