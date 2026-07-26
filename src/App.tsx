import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { SettingsProvider } from "./lib/SettingsContext";
import { CatalogProvider } from "./lib/CatalogContext";
import { PlaybackProvider } from "./lib/PlaybackContext";

import Layout from "./components/Layout";
import PersistenceHeartbeat from "./components/PersistenceHeartbeat";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Setup from "./pages/Setup";
import Home from "./pages/Home";
import LiveTV from "./pages/LiveTV";
import Anime from "./pages/Anime";
import Search from "./pages/Search";
import Library from "./pages/Library";
import Social from "./pages/Social";
import Friends from "./pages/social/Friends";
import Requests from "./pages/social/Requests";
import Rooms from "./pages/social/Rooms";
import RoomDetail from "./pages/social/RoomDetail";
import Roadmap from "./pages/social/Roadmap";
import Invites from "./pages/social/Invites";
import Admin from "./pages/Admin";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminAssets from "./pages/admin/AdminAssets";
import DevDashboard from "./pages/admin/DevDashboard";
import MyList from "./pages/MyList";
import Playlists from "./pages/Playlists";
import PlaylistAdd from "./pages/PlaylistAdd";
import RecentlyWatched from "./pages/RecentlyWatched";
import KidsShow from "./pages/KidsShow";
import Settings from "./pages/Settings";
import General from "./pages/settings/General";
import Playback from "./pages/settings/Playback";
import Appearance from "./pages/settings/Appearance";
import Account from "./pages/settings/Account";
import Backend from "./pages/settings/Backend";
import Discord from "./pages/settings/Discord";
import Subtitles from "./pages/settings/Subtitles";
import Audio from "./pages/settings/Audio";
import Parental from "./pages/settings/Parental";
import Notifications from "./pages/settings/Notifications";
import Shortcuts from "./pages/settings/Shortcuts";
import About from "./pages/settings/About";
import Placeholder from "./pages/Placeholder";
import BrowsePlaceholder from "./pages/BrowsePlaceholder";
import Trending from "./pages/Trending";
import DynamicCategoryList from "./pages/DynamicCategoryList";
import { M3U_SOURCES } from "./lib/m3uFetcher";
import { BROWSE_PLACEHOLDERS, LIBRARY_PLACEHOLDERS, SETTINGS_PLACEHOLDERS } from "./lib/navConfig";

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <CatalogProvider>
          <PlaybackProvider>
            <PersistenceHeartbeat />
            <HashRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/setup" element={<Setup />} />

                <Route element={<Layout />}>
                  <Route path="/" element={<Navigate to="/home" replace />} />
                  <Route path="/home" element={<Home />} />
                  <Route path="/anime" element={<Anime />} />
                  <Route path="/live-tv" element={<LiveTV />} />
                  <Route path="/search" element={<Search />} />
                  {/* Dynamic M3U Categories */}
                  <Route path="/movies" element={<DynamicCategoryList title="Movies" urls={[{ url: M3U_SOURCES.movies, group: "Movies" }]} wcoTypes={['movie']} />} />
                  <Route path="/tv-shows" element={<DynamicCategoryList title="TV Shows" urls={[{ url: M3U_SOURCES.animation, group: "Animation" }]} wcoTypes={['dub', 'sub']} />} />
                  <Route path="/sports" element={<DynamicCategoryList title="Sports" urls={[{ url: M3U_SOURCES.sports, group: "Sports" }]} />} />
                  <Route path="/news" element={<DynamicCategoryList title="News" urls={[{ url: M3U_SOURCES.news, group: "News" }]} />} />
                  <Route path="/kids" element={<DynamicCategoryList title="Kids & Retro" urls={[
                    { url: M3U_SOURCES.kids, group: "Kids" },
                    { url: M3U_SOURCES.toonamiPst, group: "Toonami PST" },
                    { url: M3U_SOURCES.toonamiEst, group: "Toonami EST" }
                  ]} wcoTypes={['cartoon']} />} />
                  <Route path="/kids/show" element={<KidsShow />} />
                  <Route path="/trending" element={<Trending />} />

                  {/* Leftover placeholders (New Releases, Guide) */}
                  {BROWSE_PLACEHOLDERS.filter(r => !["/trending", "/movies", "/tv-shows", "/sports", "/news", "/kids"].includes(r.path)).map((r) => (
                    <Route key={r.path} path={r.path} element={<BrowsePlaceholder title={r.title} description={r.description} />} />
                  ))}

                  <Route path="/library" element={<Library />}>
                    <Route index element={<Navigate to="my-list" replace />} />
                    <Route path="my-list" element={<MyList />} />
                    <Route path="playlists" element={<Playlists />} />
                    <Route path="playlists/add" element={<PlaylistAdd />} />
                    <Route path="recently-watched" element={<RecentlyWatched />} />
                    {LIBRARY_PLACEHOLDERS.map((r) => (
                      <Route
                        key={r.path}
                        path={r.path.replace("/library/", "")}
                        element={<Placeholder title={r.title} description={r.description} />}
                      />
                    ))}
                  </Route>

                  <Route path="/social" element={<Social />}>
                    <Route index element={<Navigate to="friends" replace />} />
                    <Route path="friends" element={<Friends />} />
                    <Route path="requests" element={<Requests />} />
                    <Route path="rooms" element={<Rooms />} />
                    <Route path="rooms/:roomId" element={<RoomDetail />} />
                    <Route path="roadmap" element={<Roadmap />} />
                    <Route path="invites" element={<Invites />} />
                  </Route>

                  <Route path="/admin" element={<Admin />}>
                    <Route index element={<Navigate to="users" replace />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="assets" element={<AdminAssets />} />
                    <Route path="dashboard" element={<DevDashboard />} />
                  </Route>

                  <Route path="/settings" element={<Settings />}>
                    <Route index element={<Navigate to="general" replace />} />
                    <Route path="general" element={<General />} />
                    <Route path="playback" element={<Playback />} />
                    <Route path="appearance" element={<Appearance />} />
                    <Route path="account" element={<Account />} />
                    <Route path="backend" element={<Backend />} />
                    <Route path="discord" element={<Discord />} />
                    <Route path="subtitles" element={<Subtitles />} />
                    <Route path="audio" element={<Audio />} />
                    <Route path="parental" element={<Parental />} />
                    <Route path="notifications" element={<Notifications />} />
                    <Route path="shortcuts" element={<Shortcuts />} />
                    <Route path="about" element={<About />} />
                    {SETTINGS_PLACEHOLDERS.map((r) => (
                      <Route key={r.path} path={r.path} element={<Placeholder title={r.title} description={r.description} />} />
                    ))}
                  </Route>

                  <Route path="*" element={<Navigate to="/home" replace />} />
                </Route>
              </Routes>
            </HashRouter>
          </PlaybackProvider>
        </CatalogProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
