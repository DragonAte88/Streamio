import React, { useEffect, useRef } from "react";

export interface ContextMenuOption {
  label: string;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  options: ContextMenuOption[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, options, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    const timeoutId = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("contextmenu", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("contextmenu", handleClickOutside);
    };
  }, [onClose]);

  const estimatedHeight = options.length * 35 + 8;
  const estimatedWidth = 160;
  
  let top = y;
  let left = x;
  if (top + estimatedHeight > window.innerHeight) {
    top = window.innerHeight - estimatedHeight - 10;
  }
  if (left + estimatedWidth > window.innerWidth) {
    left = window.innerWidth - estimatedWidth - 10;
  }

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top,
        left,
        background: "#16161d",
        border: "1px solid #2a2a35",
        borderRadius: 8,
        padding: "4px 0",
        minWidth: 160,
        zIndex: 10000,
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
      }}
    >
      {options.map((opt, i) => (
        <div
          key={i}
          className="context-menu-item"
          style={{
            padding: "8px 16px",
            cursor: "pointer",
            fontSize: 14,
            color: "#e2e2e4",
            transition: "background 0.1s"
          }}
          onClick={(e) => {
            e.stopPropagation();
            opt.onClick();
            onClose();
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#2a2a35"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        >
          {opt.label}
        </div>
      ))}
    </div>
  );
}
