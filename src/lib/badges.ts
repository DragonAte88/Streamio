export interface BadgeDef {
  slug: string;
  label: string;
  icon: string;
  gradient: [string, string];
  glow: string;
  animated?: boolean;
}

// Starter catalog - extend freely. Adding a badge here needs no migration;
// user_badges.badge_slug is just a string the admin panel can grant against
// any slug defined here.
export const BADGE_DEFINITIONS: BadgeDef[] = [
  { slug: "owner", label: "Owner", icon: "👑", gradient: ["#f5d76e", "#c9971f"], glow: "#f5d76e", animated: true },
  { slug: "administrator", label: "Administrator", icon: "🛡️", gradient: ["#ff4d4d", "#8b0000"], glow: "#ff4d4d", animated: true },
  { slug: "developer", label: "Developer", icon: "⚙️", gradient: ["#3ea6ff", "#0059b3"], glow: "#3ea6ff" },
  { slug: "moderator", label: "Moderator", icon: "🔨", gradient: ["#ff9d3d", "#b35c00"], glow: "#ff9d3d" },
  { slug: "support", label: "Support Team", icon: "🧰", gradient: ["#4de0e0", "#0f8a8a"], glow: "#4de0e0" },
  { slug: "qa_tester", label: "QA Tester", icon: "🧪", gradient: ["#c084fc", "#7c3aed"], glow: "#c084fc" },
  { slug: "beta_staff", label: "Beta Staff", icon: "🚧", gradient: ["#fbbf24", "#b45309"], glow: "#fbbf24" },
  { slug: "premium", label: "Premium", icon: "⭐", gradient: ["#f5d76e", "#d4a017"], glow: "#f5d76e" },
  { slug: "founder", label: "Founder", icon: "🚀", gradient: ["#f5d76e", "#3ea6ff"], glow: "#f5d76e", animated: true },
  { slug: "supporter", label: "Supporter", icon: "❤️", gradient: ["#ff6b6b", "#c92a2a"], glow: "#ff6b6b" },
  { slug: "early_adopter", label: "Early Adopter", icon: "🎉", gradient: ["#63e6be", "#0ca678"], glow: "#63e6be" },
  { slug: "veteran", label: "Veteran", icon: "🔥", gradient: ["#ff8787", "#e8590c"], glow: "#ff8787", animated: true },
  { slug: "verified", label: "Verified", icon: "✔", gradient: ["#3ea6ff", "#1864ab"], glow: "#3ea6ff", animated: true },
  { slug: "streamer", label: "Streamer", icon: "📺", gradient: ["#845ef7", "#5f3dc4"], glow: "#845ef7" },
  { slug: "anime_fan", label: "Anime Fan", icon: "🎌", gradient: ["#ff8fab", "#c2255c"], glow: "#ff8fab" }
];

export function getBadge(slug: string): BadgeDef | undefined {
  return BADGE_DEFINITIONS.find((b) => b.slug === slug);
}
