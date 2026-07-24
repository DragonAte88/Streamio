import React from "react";
import SectionTabs from "../components/SectionTabs";
import Placeholder from "./Placeholder";
import { BROWSE_TABS } from "../lib/navConfig";

export default function BrowsePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <>
      <SectionTabs tabs={BROWSE_TABS} end />
      <Placeholder title={title} description={description} />
    </>
  );
}
