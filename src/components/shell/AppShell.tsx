"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useDemo } from "@/demo/context";
import { setRole } from "@/demo/logic";
import type { DemoRole } from "@/demo/types";
import { IconBell, IconCalendar, IconCard, IconClaims, IconGear, IconHome, IconPeople, Logo } from "../icons";

const coordinator = [
  { href: "/demo", label: "Home", icon: IconHome, exact: true },
  { href: "/demo/review", label: "Claims Review", icon: IconClaims },
  { href: "/demo/volunteers", label: "Volunteers", icon: IconPeople },
  { href: "/demo/activities", label: "Activities", icon: IconCalendar },
  { href: "/demo/finance", label: "Reimbursements", icon: IconCard },
  { href: "/demo/settings", label: "Settings", icon: IconGear },
];

const volunteer = [
  { href: "/demo/claims", label: "My claims", icon: IconClaims },
  { href: "/demo/capture", label: "New claim", icon: IconCard },
  { href: "/demo/activities", label: "Activities", icon: IconCalendar },
  { href: "/demo/settings", label: "Settings", icon: IconGear },
];

const finance = [
  { href: "/demo/finance", label: "Reimbursements", icon: IconCard },
  { href: "/demo/review", label: "Claims Review", icon: IconClaims },
  { href: "/demo/volunteers", label: "Volunteers", icon: IconPeople },
  { href: "/demo/settings", label: "Settings", icon: IconGear },
];

export function DemoShell({ children }: { children: React.ReactNode }) {
  const { ready, state, replace, reset } = useDemo();
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState<"role" | "bell" | null>(null);
  const roleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menu) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(null);
        roleRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  if (!ready || !state) {
    return <div className="loading-screen" role="status">Loading demo seed…</div>;
  }

  const items = state.role === "volunteer" ? volunteer : state.role === "finance" ? finance : coordinator;
  const roleLabel = state.role === "volunteer" ? "Volunteer" : state.role === "finance" ? "Finance" : "Coordinator";

  function choose(role: DemoRole) {
    replace(setRole(state!, role));
    setMenu(null);
    if (role === "volunteer") router.push("/demo/claims");
    if (role === "coordinator") router.push("/demo/review");
    if (role === "finance") router.push("/demo/finance");
  }

  return (
    <div className="app">
      <a className="sr-only" href="#content">Skip to content</a>
      <header className="topbar">
        <div className="brand">
          <Logo />
          <div>
            <strong>TrialPulse</strong>
            <span>NGO Volunteer Expense Reimbursement</span>
          </div>
        </div>
        <div className="top-actions">
          <button className="icon-btn" aria-label="Notifications" aria-expanded={menu === "bell"} onClick={() => setMenu(menu === "bell" ? null : "bell")}>
            <IconBell />
          </button>
          <button ref={roleRef} className="role-btn" aria-haspopup="menu" aria-expanded={menu === "role"} aria-controls={menuId} onClick={() => setMenu(menu === "role" ? null : "role")}>
            <span className="avatar" aria-hidden="true">{roleLabel.slice(0, 1)}</span>
            {roleLabel}
            <span aria-hidden="true">▾</span>
          </button>
        </div>
        {menu === "bell" ? (
          <div className="popover" role="dialog" aria-label="Notifications">
            <p className="empty">No notifications.</p>
          </div>
        ) : null}
        {menu === "role" ? (
          <div className="popover" id={menuId} role="menu">
            {(["coordinator", "volunteer", "finance"] as DemoRole[]).map((role) => (
              <button key={role} role="menuitemradio" aria-checked={state.role === role} className="menu-item" aria-current={state.role === role} onClick={() => choose(role)}>
                {role === "coordinator" ? "Coordinator" : role === "volunteer" ? "Volunteer" : "Finance"}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      <div className="body">
        <nav className="sidenav" aria-label="Primary">
          {items.map((item) => {
            const exact = "exact" in item && item.exact;
            const active = exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link key={item.label} href={item.href} className={active ? "nav-link active" : "nav-link"} aria-current={active ? "page" : undefined}>
                <Icon />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main id="content" className="main">
          <div className="seed-bar">
            <span>Demo seed loaded. These claims and payouts are illustrative and stay in this browser.</span>
            <button type="button" onClick={reset}>Reset demo</button>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
