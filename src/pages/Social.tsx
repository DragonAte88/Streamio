import React from "react";
import { Outlet } from "react-router-dom";
import SectionTabs from "../components/SectionTabs";

const TABS = [
  { path: "/social/friends", label: "Friends" },
  { path: "/social/requests", label: "Requests" },
  { path: "/social/invites", label: "Watch Invites" },
  { path: "/social/rooms", label: "Rooms" },
  { path: "/social/roadmap", label: "Roadmap" }
];

export default function Social() {
  return (
    <>
      <SectionTabs tabs={TABS} />
      <Outlet />
    </>
  );
}
