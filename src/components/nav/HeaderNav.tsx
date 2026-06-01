"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV_LINKS = [
  { href: "/", label: "Extractor" },
  { href: "/ingestor/upload", label: "Ingestor / Upload" },
  { href: "/ingestor/database", label: "Ingestor / Database" },
  { href: "/ingestor/evidence", label: "Ingestor / Evidence" },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-2">
        <span className="mr-4 text-sm font-semibold text-zinc-400 select-none">
          Zuo-Ran Tools
        </span>
        {NAV_LINKS.map(({ href, label }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
