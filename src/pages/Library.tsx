import React from "react";
import { Outlet } from "react-router-dom";
import SectionTabs from "../components/SectionTabs";
import { LIBRARY_TABS } from "../lib/navConfig";

export default function Library() {
  return (
    <>
      <SectionTabs tabs={LIBRARY_TABS} />
      <Outlet />
    </>
  );
}
