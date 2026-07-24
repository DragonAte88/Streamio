import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { SettingsProvider } from "./lib/SettingsContext";
import { CatalogProvider } from "./lib/CatalogContext";
import { PlaybackProvider } from "./lib/PlaybackContext";

import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Setup from "./pages/Setup";
import Home from "./pages/Home";
import LiveTV from "./pages/LiveTV";
import Search from "./pages/Search";
import Library from "./pages/Library";
import Social from "./pages/Social";
import Friends from "./pages/social/Friends";
import Requests from "./pages/social/Requests";
import Rooms from "./pages/social/Rooms";
import RoomDetail from "./pages/social/RoomDetail";
import Roadmap from "./pages/social/Roadmap";
import MyList from "./pages/MyList";
import Playlists from "./pages/Playlists";
import PlaylistAdd from "./pages/PlaylistAdd";
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
import { BROWSE_PLACEHOLDERS, LIBRARY_PLACEHOLDERS, SETTINGS_PLACEHOLDERS } from "./lib/navConfig";

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <CatalogProvider>
          <PlaybackProvider>
            <HashRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/setup" element={<Setup />} />

                <Route element={<Layout />}>
                  <Route path="/" element={<Navigate to="/home" replace />} />
                  <Route path="/home" element={<Home />} />
                  <Route path="/live-tv" element={<LiveTV />} />
                  <Route path="/search" element={<Search />} />

                  {BROWSE_PLACEHOLDERS.map((r) => (
                    <Route key={r.path} path={r.path} element={<BrowsePlaceholder title={r.title} description={r.description} />} />
                  ))}

                  <Route path="/library" element={<Library />}>
                    <Route index element={<Navigate to="my-list" replace />} />
                    <Route path="my-list" element={<MyList />} />
                    <Route path="playlists" element={<Playlists />} />
                    <Route path="playlists/add" element={<PlaylistAdd />} />
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
