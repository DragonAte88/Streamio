import React from "react";

export default function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={"switch" + (on ? " on" : "")} onClick={() => onChange(!on)} type="button" />;
}
