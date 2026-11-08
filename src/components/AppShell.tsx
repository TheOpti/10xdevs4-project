import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BarChart3, Layers, LayoutGrid, LogOut, Plus, Settings } from "lucide-react";
import React from "react";

const NAV_ITEMS = [
  { label: "Collections", icon: LayoutGrid, active: true, href: "/dashboard" },
  { label: "Stats", icon: BarChart3, active: false, href: undefined },
  { label: "Settings", icon: Settings, active: false, href: undefined },
];

export default function AppShell({
  children,
  onNewSet,
  newSetHref,
  email,
}: {
  children: React.ReactNode;
  onNewSet?: () => void;
  newSetHref?: string;
  email?: string;
}) {
  const displayEmail = email ?? "user@email.com";
  const initials = displayEmail.substring(0, 2).toUpperCase();

  return (
    <div className="bg-background text-foreground min-h-screen font-sans">
      <div className="flex">
        {/* Sidebar */}
        <aside className="bg-background hidden border-r md:fixed md:inset-y-0 md:flex md:w-60 md:flex-col">
          <div className="flex h-16 items-center gap-2 px-6">
            <div className="bg-primary flex h-7 w-7 items-center justify-center rounded-[6px]">
              <Layers className="text-primary-foreground h-4 w-4" strokeWidth={2.25} />
            </div>
            <span className="text-lg tracking-tight">Memoro</span>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV_ITEMS.map(({ label, icon: Icon, active, href }) => (
              <a
                href={href}
                aria-disabled={!href || undefined}
                key={label}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                {label}
              </a>
            ))}
          </nav>

          <div className="p-3">
            <Separator className="mb-3" />
            <div className="flex items-center gap-3 px-2 py-1.5">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground truncate text-xs">{displayEmail}</p>
              </div>
            </div>
            <form method="POST" action="/api/auth/signout" className="mt-2">
              <button
                type="submit"
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors"
              >
                <LogOut className="h-4 w-4" strokeWidth={2} />
                Sign out
              </button>
            </form>
          </div>
        </aside>

        {/* Main column */}
        <div className="min-w-0 flex-1 md:ml-60">
          {/* Topbar */}
          <header className="bg-background/90 sticky top-0 z-10 border-b backdrop-blur">
            <div className="flex h-16 items-center gap-4 px-6">
              <a href="/dashboard" className="text-primary text-sm font-medium md:hidden">
                Collections
              </a>
              <div className="flex-1" />
              {newSetHref ? (
                <Button asChild className="gap-2">
                  <a href={newSetHref}>
                    <Plus className="h-4 w-4" />
                    New set
                  </a>
                </Button>
              ) : (
                <Button onClick={onNewSet} className="gap-2">
                  <Plus className="h-4 w-4" />
                  New set
                </Button>
              )}
            </div>
          </header>

          <main className="max-w-6xl px-6 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
