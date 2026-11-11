import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatSetHref, type SetListView } from "@/lib/flashcard-views";

export default function Dashboard({ email, view }: { email?: string; view: SetListView }) {
  const currentFilterValue =
    view.status === "ready"
      ? view.filter.type === "untagged"
        ? "untagged"
        : view.filter.type === "tag"
          ? `tag:${view.filter.tag}`
          : "all"
      : "all";

  function handleFilterChange(value: string) {
    if (value === "untagged") {
      window.location.href = "/dashboard?untagged=1";
    } else if (value.startsWith("tag:")) {
      const tag = value.slice(4);
      window.location.href = `/dashboard?tag=${encodeURIComponent(tag)}`;
    } else {
      window.location.href = "/dashboard";
    }
  }

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
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="catalog-filter" className="text-sm font-medium">
                Filter by tag:
              </Label>
              <select
                id="catalog-filter"
                aria-label="Filter sets by tag"
                value={currentFilterValue}
                onChange={(e) => {
                  handleFilterChange(e.target.value);
                }}
                className="border-input dark:bg-input/30 focus-visible:ring-ring rounded-md border bg-transparent px-3 py-1.5 text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <option value="all">All sets</option>
                <option value="untagged">Untagged</option>
                {view.availableTags.map((tag) => (
                  <option key={tag} value={`tag:${tag}`}>
                    {tag}
                  </option>
                ))}
                {view.filter.type === "tag" && !view.availableTags.includes(view.filter.tag) && (
                  <option value={`tag:${view.filter.tag}`}>{view.filter.tag}</option>
                )}
              </select>
            </div>
            {view.filter.type !== "all" && (
              <a href="/dashboard" className="text-primary text-sm hover:underline">
                Clear filter
              </a>
            )}
          </div>

          {view.totalSetsCount === 0 && view.filter.type === "all" ? (
            <Card>
              <CardContent className="space-y-3">
                <h2 className="text-lg font-medium">No sets yet</h2>
                <p className="text-muted-foreground">Create your first set from source text.</p>
                <a href="/dashboard/new" className="text-primary underline">
                  Create a set
                </a>
              </CardContent>
            </Card>
          ) : view.sets.length === 0 ? (
            <Card>
              <CardContent className="space-y-3 py-6">
                <h2 className="text-lg font-medium">No matching sets</h2>
                <p className="text-muted-foreground text-sm">
                  {view.filter.type === "tag"
                    ? `No sets are tagged with "${view.filter.tag}".`
                    : "No sets match the selected filter."}
                </p>
                <div>
                  <a href="/dashboard" className="text-primary text-sm underline">
                    Clear filter
                  </a>
                </div>
              </CardContent>
            </Card>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2">
              {view.sets.map((set) => (
                <li key={set.id}>
                  <Card className="h-full">
                    <CardContent className="space-y-3">
                      <div>
                        <h2 className="text-lg font-medium wrap-anywhere">
                          <a
                            href={formatSetHref(set.id, view.filter)}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {set.title}
                          </a>
                        </h2>
                        <p className="text-muted-foreground text-sm">Open saved set</p>
                      </div>
                      {set.tags.length > 0 ? (
                        <ul className="flex flex-wrap gap-1.5" aria-label={`Tags for ${set.title}`}>
                          {set.tags.map((tag) => (
                            <li key={tag}>
                              <Badge variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground text-xs">Untagged</p>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AppShell>
  );
}
