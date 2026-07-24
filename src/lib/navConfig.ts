export interface NavItem {
  path: string;
  label: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Browse",
    items: [
      { path: "/live-tv", label: "Live TV" },
      { path: "/movies", label: "Movies" },
      { path: "/tv-shows", label: "TV Shows" },
      { path: "/sports", label: "Sports" },
      { path: "/news", label: "News" },
      { path: "/kids", label: "Kids" },
      { path: "/trending", label: "Trending" },
      { path: "/new-releases", label: "New Releases" },
      { path: "/guide", label: "Channel Guide" }
    ]
  },
  {
    label: "Your Library",
    items: [
      { path: "/my-list", label: "My List" },
      { path: "/favorites", label: "Favorites" },
      { path: "/continue-watching", label: "Continue Watching" },
      { path: "/recently-watched", label: "Recently Watched" },
      { path: "/downloads", label: "Downloads" },
      { path: "/playlists", label: "Playlists" }
    ]
  },
  {
    label: "Connected",
    items: [
      { path: "/discord-integration", label: "Discord Integration" },
      { path: "/kodi-sync", label: "Kodi Sync" },
      { path: "/cast-remote", label: "Cast & Remote" },
      { path: "/notifications", label: "Notifications" },
      { path: "/profiles", label: "Profiles" }
    ]
  },
  {
    label: "System",
    items: [
      { path: "/stats", label: "Stats for Nerds" },
      { path: "/help", label: "Help & Support" },
      { path: "/legal/privacy", label: "Privacy Policy" },
      { path: "/legal/terms", label: "Terms of Service" },
      { path: "/settings/general", label: "Settings" }
    ]
  }
];

export const PLACEHOLDER_ROUTES: { path: string; title: string; description: string }[] = [
  { path: "/movies", title: "Movies", description: "VOD movie catalog — will use the TMDB-backed artwork proxy once a movie source is wired in." },
  { path: "/tv-shows", title: "TV Shows", description: "VOD/episodic catalog with season/episode browsing, using the FULL_PROJECT_DOCUMENTATION.md episode-resolution design." },
  { path: "/sports", title: "Sports", description: "Sports channel category view." },
  { path: "/news", title: "News", description: "News channel category view." },
  { path: "/kids", title: "Kids", description: "Kids category view, intended to respect Parental Controls once ratings data exists." },
  { path: "/trending", title: "Trending", description: "Most-watched channels/content, ranked by aggregate watch_history once there's enough data to rank." },
  { path: "/new-releases", title: "New Releases", description: "Recently added catalog entries." },
  { path: "/guide", title: "Channel Guide", description: "Full EPG grid view — the M3U8Parser-style EPG data model needs to be rebuilt server-side for this." },
  { path: "/favorites", title: "Favorites", description: "Distinct from My List — quick-access starred channels." },
  { path: "/continue-watching", title: "Continue Watching", description: "Needs per-channel resume-position tracking, which doesn't exist yet — watch_history currently only logs event timestamps, not playback offsets." },
  { path: "/recently-watched", title: "Recently Watched", description: "Backed by the watch_history table already recording plays server-side." },
  { path: "/downloads", title: "Downloads", description: "Offline VOD downloads — not applicable to live channels, relevant once VOD exists." },
  { path: "/discord-integration", title: "Discord Integration", description: "Full Discord integration overview — Rich Presence is live; voice-relay bot code is deployed on Flex-2 but not activated." },
  { path: "/kodi-sync", title: "Kodi Sync", description: "Optional Kodi companion sync, per the original 25-feature scope." },
  { path: "/cast-remote", title: "Cast & Remote", description: "Mobile remote control / casting to other devices." },
  { path: "/notifications", title: "Notifications", description: "Notification center — toggles live in Settings > Notifications, this is the inbox view." },
  { path: "/profiles", title: "Profiles", description: "Multiple viewer profiles per account, Netflix-style." },
  { path: "/stats", title: "Stats for Nerds", description: "Live diagnostics: fps, buffer health, bandwidth — successor to the old Roblox NetworkingPanel." },
  { path: "/help", title: "Help & Support", description: "Support/FAQ content." },
  { path: "/legal/privacy", title: "Privacy Policy", description: "Legal placeholder." },
  { path: "/legal/terms", title: "Terms of Service", description: "Legal placeholder." }
];
