import React from "react";
import { Outlet, Navigate } from "react-router-dom";
import SectionTabs from "../components/SectionTabs";
import { useAuth } from "../lib/auth";

const TABS = [
  { path: "/admin/users", label: "Users" },
  { path: "/admin/assets", label: "Assets" }
];

export default function Admin() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return <Navigate to="/home" replace />;
  return (
    <>
      <SectionTabs tabs={TABS} />
      <Outlet />
    </>
  );
}
