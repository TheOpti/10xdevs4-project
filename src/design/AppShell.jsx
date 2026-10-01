import React from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Layers, LayoutGrid, BarChart3, Settings, Plus, Search } from "lucide-react";

const NAV_ITEMS = [
  { label: "Collections", icon: LayoutGrid, active: true },
  { label: "Stats", icon: BarChart3, active: false },
  { label: "Settings", icon: Settings, active: false },
];

export default function AppShell({ children, onNewSet }) {
  return (
    <div className="min-h-screen bg-[#F5F6F2] font-sans text-[#1C2321]">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden border-r border-[#E4E2D6] bg-[#F5F6F2] md:fixed md:inset-y-0 md:flex md:w-60 md:flex-col">
          <div className="flex h-16 items-center gap-2 px-6">
            <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#3D5A80]">
              <Layers className="h-4 w-4 text-[#F5F6F2]" strokeWidth={2.25} />
            </div>
            <span className="text-lg tracking-tight">Stax</span>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV_ITEMS.map(({ label, icon: Icon, active }) => (
              <button
                key={label}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[#3D5A80] text-[#F5F6F2]"
                    : "text-[#1C2321]/70 hover:bg-[#E4E2D6]/60 hover:text-[#1C2321]"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                {label}
              </button>
            ))}
          </nav>

          <div className="p-3">
            <Separator className="mb-3 bg-[#E4E2D6]" />
            <div className="flex items-center gap-3 px-2 py-1.5">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-[#EE6C4D] text-xs font-medium text-white">JM</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">Jordan Mills</p>
                <p className="truncate text-xs text-[#1C2321]/50">jordan@email.com</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex-1 md:ml-60">
          {/* Topbar */}
          <header className="sticky top-0 z-10 border-b border-[#E4E2D6] bg-[#F5F6F2]/90 backdrop-blur">
            <div className="flex h-16 items-center gap-4 px-6">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#1C2321]/40" />
                <input
                  placeholder="Search collections…"
                  className="h-9 w-full rounded-md border border-[#E4E2D6] bg-white pr-3 pl-9 text-sm placeholder:text-[#1C2321]/40 focus:ring-2 focus:ring-[#3D5A80]/30 focus:outline-none"
                />
              </div>
              <div className="flex-1" />
              <Button onClick={onNewSet} className="gap-2 bg-[#3D5A80] text-white hover:bg-[#324A69]">
                <Plus className="h-4 w-4" />
                New set
              </Button>
            </div>
          </header>

          <main className="max-w-6xl px-6 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
