import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { SettingsProvider } from "./lib/SettingsContext";
import { CatalogProvider } from "./lib/CatalogContext";
import { PlaybackProvider } from "./lib/PlaybackContext";

import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import LiveTV from "./pages/LiveTV";
import Search from "./pages/Search";
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
import { PLACEHOLDER_ROUTES } from "./lib/navConfig";

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

                <Route element={<Layout />}>
                  <Route path="/" element={<Navigate to="/home" replace />} />
                  <Route path="/home" element={<Home />} />
                  <Route path="/live-tv" element={<LiveTV />} />
                  <Route path="/search" element={<Search />} />
                  <Route path="/my-list" element={<MyList />} />
                  <Route path="/playlists" element={<Playlists />} />
                  <Route path="/playlists/add" element={<PlaylistAdd />} />

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
                  </Route>

                  {PLACEHOLDER_ROUTES.map((r) => (
                    <Route key={r.path} path={r.path} element={<Placeholder title={r.title} description={r.description} />} />
                  ))}

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
