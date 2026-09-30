import { Button } from "@/components/ui/button";
import { Layers } from "lucide-react";

export default function Navbar() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <a href="/" className="flex items-center gap-2 text-inherit no-underline">
            <div className="bg-primary flex h-7 w-7 items-center justify-center rounded-[6px]">
              <Layers className="text-primary-foreground h-4 w-4" strokeWidth={2.25} />
            </div>
            <h2 className="text-lg tracking-tight">Memoro</h2>
          </a>
        </div>

        <nav className="hidden items-center gap-8 text-sm md:flex">
          <a href="/#features">Features</a>
          <a href="/#how-it-works">How it works</a>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <a href="/auth/signin">Sign in</a>
          </Button>
          <Button asChild>
            <a href="/auth/signup">Sign up</a>
          </Button>
        </div>
      </div>
    </header>
  );
}
