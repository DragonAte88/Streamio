export interface TabItem {
  path: string;
  label: string;
}

// Home page's Browse category chips (top-level routes, real content pages)
export const BROWSE_TABS: TabItem[] = [
  { path: "/home", label: "For You" },
  { path: "/live-tv", label: "Live TV" },
  { path: "/movies", label: "Movies" },
  { path: "/tv-shows", label: "TV Shows" },
  { path: "/sports", label: "Sports" },
  { path: "/news", label: "News" },
  { path: "/kids", label: "Kids" },
  { path: "/trending", label: "Trending" },
  { path: "/new-releases", label: "New Releases" },
  { path: "/guide", label: "Channel Guide" }
];

// Your Library page's tabs
export const LIBRARY_TABS: TabItem[] = [
  { path: "/library/my-list", label: "My List" },
  { path: "/library/favorites", label: "Favorites" },
  { path: "/library/continue-watching", label: "Continue Watching" },
  { path: "/library/recently-watched", label: "Recently Watched" },
  { path: "/library/downloads", label: "Downloads" },
  { path: "/library/playlists", label: "Playlists" }
];

// Settings page's tabs
export const SETTINGS_TABS: TabItem[] = [
  { path: "general", label: "General" },
  { path: "playback", label: "Playback" },
  { path: "appearance", label: "Appearance" },
  { path: "subtitles", label: "Subtitles" },
  { path: "audio", label: "Audio" },
  { path: "parental", label: "Parental Controls" },
  { path: "account", label: "Account" },
  { path: "backend", label: "Backend / Sync" },
  { path: "discord", label: "Discord" },
  { path: "kodi-sync", label: "Kodi Sync" },
  { path: "cast-remote", label: "Cast & Remote" },
  { path: "profiles", label: "Profiles" },
  { path: "notifications", label: "Notifications" },
  { path: "shortcuts", label: "Keyboard Shortcuts" },
  { path: "stats", label: "Stats for Nerds" },
  { path: "help", label: "Help & Support" },
  { path: "privacy", label: "Privacy Policy" },
  { path: "terms", label: "Terms of Service" },
  { path: "about", label: "About" }
];

export const BROWSE_PLACEHOLDERS: { path: string; title: string; description: string }[] = [
  { path: "/movies", title: "Movies", description: "VOD movie catalog — will use the TMDB-backed artwork proxy once a movie source is wired in." },
  { path: "/tv-shows", title: "TV Shows", description: "VOD/episodic catalog with season/episode browsing, using the FULL_PROJECT_DOCUMENTATION.md episode-resolution design." },
  { path: "/sports", title: "Sports", description: "Sports channel category view." },
  { path: "/news", title: "News", description: "News channel category view." },
  { path: "/kids", title: "Kids", description: "Kids category view, intended to respect Parental Controls once ratings data exists." },
  { path: "/trending", title: "Trending", description: "Most-watched channels/content, ranked by aggregate watch_history once there's enough data to rank." },
  { path: "/new-releases", title: "New Releases", description: "Recently added catalog entries." },
  { path: "/guide", title: "Channel Guide", description: "Full EPG grid view — the M3U8Parser-style EPG data model needs to be rebuilt server-side for this." }
];

export const LIBRARY_PLACEHOLDERS: { path: string; title: string; description: string }[] = [
  { path: "/library/favorites", title: "Favorites", description: "Distinct from My List — quick-access starred channels." },
  { path: "/library/continue-watching", title: "Continue Watching", description: "Needs per-channel resume-position tracking, which doesn't exist yet — watch_history currently only logs event timestamps, not playback offsets." },
  { path: "/library/downloads", title: "Downloads", description: "Offline VOD downloads — not applicable to live channels, relevant once VOD exists." }
];

export const SETTINGS_PLACEHOLDERS: { path: string; title: string; description: string }[] = [
  { path: "kodi-sync", title: "Kodi Sync", description: "Optional Kodi companion sync, per the original 25-feature scope." },
  { path: "cast-remote", title: "Cast & Remote", description: "Mobile remote control / casting to other devices." },
  { path: "profiles", title: "Profiles", description: "Multiple viewer profiles per account, Netflix-style." },
  { path: "stats", title: "Stats for Nerds", description: "Live diagnostics: fps, buffer health, bandwidth — successor to the old Roblox NetworkingPanel." },
  { path: "help", title: "Help & Support", description: "Support/FAQ content." },
  { path: "privacy", title: "Privacy Policy", description: "Legal placeholder." },
  { path: "terms", title: "Terms of Service", description: "Legal placeholder." }
];
