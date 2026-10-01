import React from "react";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Flame, CheckCircle2, Clock3 } from "lucide-react";

const STATS = [
  { label: "Day streak", value: "12", icon: Flame, tint: "#EE6C4D" },
  { label: "Cards mastered", value: "284", icon: CheckCircle2, tint: "#588157" },
  { label: "Due today", value: "37", icon: Clock3, tint: "#3D5A80" },
];

const COLLECTIONS = [
  {
    title: "Cell Biology — Ch. 4",
    count: 42,
    due: 12,
    progress: 68,
    lastStudied: "Yesterday",
  },
  {
    title: "Spanish Verbs: Subjunctive",
    count: 60,
    due: 25,
    progress: 34,
    lastStudied: "2 days ago",
  },
  {
    title: "US History — Reconstruction",
    count: 28,
    due: 0,
    progress: 100,
    lastStudied: "Today",
  },
  {
    title: "Org Chem Reaction Mechanisms",
    count: 51,
    due: 0,
    progress: 12,
    lastStudied: "5 days ago",
  },
];

function StackedCardPreview({ title, count, due, progress, lastStudied }) {
  return (
    <div className="group relative cursor-pointer">
      {/* stacked layers behind, visible on hover */}
      <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-xl border border-[#E4E2D6] bg-white transition-transform group-hover:translate-x-2 group-hover:translate-y-2" />
      <Card className="relative rounded-xl border-[#E4E2D6] bg-white shadow-none">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg leading-snug">{title}</h3>
            {due > 0 ? (
              <Badge className="shrink-0 border-0 bg-[#EE6C4D]/10 text-[#EE6C4D] hover:bg-[#EE6C4D]/10">
                {due} due
              </Badge>
            ) : (
              <Badge className="shrink-0 border-0 bg-[#588157]/10 text-[#588157] hover:bg-[#588157]/10">
                Caught up
              </Badge>
            )}
          </div>

          <p className="mt-1 text-sm text-[#1C2321]/50">
            {count} cards · studied {lastStudied}
          </p>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-[#1C2321]/50">
              <span>Mastery</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5 bg-[#E4E2D6] [&>div]:bg-[#3D5A80]" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl">Good afternoon, Jordan</h1>
        <p className="mt-1 text-sm text-[#1C2321]/50">You've got 37 cards due across 2 collections today.</p>
      </div>

      {/* Stats row */}
      <div className="mb-10 grid grid-cols-3 gap-4">
        {STATS.map(({ label, value, icon: Icon, tint }) => (
          <Card key={label} className="border-[#E4E2D6] bg-white shadow-none">
            <CardContent className="flex items-center gap-4 p-5">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
                style={{ backgroundColor: `${tint}1A` }}
              >
                <Icon className="h-5 w-5" style={{ color: tint }} strokeWidth={2} />
              </div>
              <div>
                <p className="text-2xl leading-none">{value}</p>
                <p className="mt-1 text-xs text-[#1C2321]/50">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Collections */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-[#1C2321]/70">Your collections</h2>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {COLLECTIONS.map((c) => (
          <StackedCardPreview key={c.title} {...c} />
        ))}
      </div>
    </AppShell>
  );
}
