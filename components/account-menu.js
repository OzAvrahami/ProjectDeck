"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { logoutAction } from "../app/login/actions.js";

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function closeOnOutsidePointer(event) {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function focusFirstItem() {
    requestAnimationFrame(() => {
      containerRef.current?.querySelector('[role="menuitem"]')?.focus();
    });
  }

  function handleTriggerKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      focusFirstItem();
    }
  }

  function handleMenuKeyDown(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    const items = [...containerRef.current.querySelectorAll('[role="menuitem"]')];
    const currentIndex = items.indexOf(document.activeElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + direction + items.length) % items.length;

    event.preventDefault();
    items[nextIndex]?.focus();
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-transparent bg-avatar text-[13px] font-semibold text-subtle transition hover:border-line hover:text-foreground"
        type="button"
        aria-label="Open account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        O
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+0.6rem)] z-50 min-w-44 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-[0_16px_40px_-18px_oklch(0%_0_0_/_0.45)]"
          role="menu"
          aria-label="Account"
          onKeyDown={handleMenuKeyDown}
        >
          <Link
            className="block rounded-lg px-3 py-2 text-sm font-medium text-subtle hover:bg-avatar hover:text-foreground"
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <div className="my-1 border-t border-line" />
          <form action={logoutAction}>
            <button
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-subtle hover:bg-avatar hover:text-foreground"
              type="submit"
              role="menuitem"
            >
              Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
