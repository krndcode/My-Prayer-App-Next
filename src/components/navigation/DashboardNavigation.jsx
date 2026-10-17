"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/prayer", label: "Prayer", icon: "prayer" },
  { href: "/schedule", label: "Schedule", icon: "schedule" },
  { href: "/heat-room", label: "Heat Room", icon: "community" },
  { href: "/profile", label: "Profile", icon: "profile" }
];

function NavigationIcon({ name }) {
  const paths = {
    prayer: <><path d="M12 21v-8" /><path d="M12 13c-4.4 0-7-2.5-7-6 4.5 0 7 2.2 7 6Z" /><path d="M12 11c0-4 2.8-6.5 7-6.5 0 3.7-2.5 6.5-7 6.5Z" /></>,
    schedule: <><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" /></>,
    community: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" /><circle cx="9.5" cy="7" r="3.5" /><path d="M17 11a3.5 3.5 0 1 0-1.2-6.8M21 20v-1.5a4 4 0 0 0-3-3.9" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    moderation: <><path d="M12 3 20 6v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

export default function DashboardNavigation({ mobile = false, isModerator = false }) {
  const pathname = usePathname();
  const items = isModerator
    ? [...ITEMS, { href: "/moderation", label: "Moderation", icon: "moderation" }]
    : ITEMS;
  const mobileColumns = items.length > 5 ? "grid-cols-6" : items.length === 5 ? "grid-cols-5" : "grid-cols-4";

  return (
    <nav aria-label="Main navigation" className={mobile ? `grid ${mobileColumns} gap-1` : "space-y-1"}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`dashboard-nav-link flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
              mobile ? "flex-col gap-1 px-1 py-2 text-xs" : ""
            } ${
              active
                ? "nav-active"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            }`}
          >
            <span
              aria-hidden="true"
              className={`dashboard-nav-icon grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                active ? "bg-teal-800 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              <NavigationIcon name={item.icon} />
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
