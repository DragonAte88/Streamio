import React from "react";

export default function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
      <p style={{ opacity: 0.5, fontSize: 13, marginTop: 24 }}>This section is scaffolded but not built out yet.</p>
    </div>
  );
}
