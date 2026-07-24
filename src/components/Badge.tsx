import React from "react";
import { getBadge } from "../lib/badges";

export default function Badge({ slug, size = 20 }: { slug: string; size?: number }) {
  const def = getBadge(slug);
  if (!def) return null;
  return (
    <span
      title={def.label}
      className={"badge-icon" + (def.animated ? " badge-animated" : "")}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.6,
        background: `linear-gradient(135deg, ${def.gradient[0]}, ${def.gradient[1]})`,
        boxShadow: `0 0 ${size * 0.5}px ${def.glow}66, inset 0 0 ${size * 0.2}px rgba(255,255,255,0.4)`,
        ["--glow-color" as any]: def.glow
      }}
    >
      {def.icon}
    </span>
  );
}

export function BadgeRow({ slugs, size }: { slugs: string[]; size?: number }) {
  if (!slugs || slugs.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {slugs.map((s) => (
        <Badge key={s} slug={s} size={size} />
      ))}
    </span>
  );
}
