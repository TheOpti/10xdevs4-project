import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock3, Flame } from "lucide-react";

const STATS = [
  { label: "Day streak", value: "12", icon: Flame, tint: "text-orange-500", bgTint: "bg-orange-500/10" },
  { label: "Cards mastered", value: "284", icon: CheckCircle2, tint: "text-green-600", bgTint: "bg-green-600/10" },
  { label: "Due today", value: "37", icon: Clock3, tint: "text-blue-500", bgTint: "bg-blue-500/10" },
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

interface StackedCardPreviewProps {
  title: string;
  count: number;
  due: number;
  progress: number;
  lastStudied: string;
}

function StackedCardPreview({ title, count, due, progress, lastStudied }: StackedCardPreviewProps) {
  return (
    <div className="group relative cursor-pointer">
      {/* stacked layers behind, visible on hover */}
      <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-xl border bg-card transition-transform group-hover:translate-x-2 group-hover:translate-y-2" />
      <Card className="relative rounded-xl bg-card shadow-sm transition-shadow group-hover:shadow-md">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-medium leading-snug">{title}</h3>
            {due > 0 ? (
              <Badge variant="secondary" className="shrink-0 bg-orange-500/10 text-orange-600 hover:bg-orange-500/20">
                {due} due
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0 bg-green-500/10 text-green-700 hover:bg-green-500/20">
                Caught up
              </Badge>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {count} cards · studied {lastStudied}
          </p>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Mastery</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard({ email }: { email?: string }) {
  return (
    <AppShell email={email}>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">You&apos;ve got 37 cards due across 2 collections today.</p>
      </div>

      {/* Stats row */}
      <div className="mb-10 grid grid-cols-3 gap-4">
        {STATS.map(({ label, value, icon: Icon, tint, bgTint }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${bgTint}`}
              >
                <Icon className={`h-5 w-5 ${tint}`} strokeWidth={2} />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Collections */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Your collections</h2>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {COLLECTIONS.map((c) => (
          <StackedCardPreview key={c.title} {...c} />
        ))}
      </div>
    </AppShell>
  );
}
