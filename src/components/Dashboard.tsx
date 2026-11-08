import AppShell from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import type { SetListView } from "@/lib/flashcard-views";

export default function Dashboard({ email, view }: { email?: string; view: SetListView }) {
  return (
    <AppShell email={email} newSetHref="/dashboard/new">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Your collections</h1>
        <p className="text-muted-foreground mt-2">Open a set to review, edit, or delete saved cards.</p>
      </div>
      {view.status === "unavailable" ? (
        <div role="alert">
          <p>We could not load your collections. Please try again.</p>
          <a href="/dashboard" className="text-primary mt-3 inline-block underline">
            Retry loading collections
          </a>
        </div>
      ) : view.sets.length === 0 ? (
        <Card>
          <CardContent>
            <h2 className="text-lg font-medium">No sets yet</h2>
            <p className="text-muted-foreground">Create your first set from source text.</p>
            <a href="/dashboard/new" className="text-primary underline">
              Create a set
            </a>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2">
          {view.sets.map((set) => (
            <li key={set.id}>
              <Card className="h-full">
                <CardContent>
                  <h2 className="text-lg font-medium wrap-anywhere">
                    <a href={`/dashboard/sets/${set.id}`} className="text-primary underline-offset-4 hover:underline">
                      {set.title}
                    </a>
                  </h2>
                  <p className="text-muted-foreground text-sm">Open saved set</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
