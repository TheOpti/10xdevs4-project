import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Clock, RefreshCw } from "lucide-react";

const FEATURES = [
  {
    icon: Brain,
    title: "Paste anything",
    body: "Drop in a chapter, a set of notes, an article — Memoro reads it and pulls out the ideas worth remembering.",
  },
  {
    icon: RefreshCw,
    title: "Cards that adapt",
    body: "Each card is rated as you review it, so the ones you're shaky on come back sooner than the ones you know cold.",
  },
  {
    icon: Clock,
    title: "Five minutes a day",
    body: "Short, spaced sessions beat long cram nights. Memoro tells you exactly what's due and nothing else.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Paste your text",
    body: "Lecture notes, a PDF you copied from, a Wikipedia page — anything with substance.",
  },
  {
    n: "2",
    title: "Memoro builds the deck",
    body: "It finds the key facts, definitions and relationships and turns each into a card.",
  },
  {
    n: "3",
    title: "Review on your schedule",
    body: "Flip through cards, mark what you know, and let spaced repetition handle the rest.",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-glow min-h-screen font-sans">
      <Navbar />

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-20 pb-24 md:grid-cols-2">
        <div>
          <h1 className="text-5xl leading-[1.05] tracking-tight md:text-6xl">
            Turn what you&apos;re reading into what you&apos;ll remember.
          </h1>
          <p className="mt-6 max-w-md text-lg">
            Paste in any block of text and Memoro builds a deck of flashcards from it — then reviews them with you until
            they stick.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Button size="lg" asChild>
              <a href="/auth/signup">Get started free</a>
            </Button>
            <Button size="lg" variant="outline">
              See how it works
            </Button>
          </div>
        </div>

        {/* Fanned index-card visual, standing in for a future screenshot */}
        <div className="relative h-80">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative h-56 w-80 md:h-64 md:w-96">
              <div className="absolute inset-0 -translate-x-4 translate-y-3 -rotate-6 rounded-xl border bg-white shadow-sm" />
              <div className="absolute inset-0 translate-x-3 -translate-y-2 rotate-3 rounded-xl border bg-white shadow-sm" />
              <div className="absolute inset-0 flex flex-col justify-between rounded-xl border bg-white p-6 shadow-md md:p-8">
                <span className="text-sm tracking-wide uppercase">Cell biology</span>
                <p className="text-xl leading-snug md:text-2xl">What organelle produces most of a cell&apos;s ATP?</p>
                <span className="text-sm">Tap to reveal</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="max-w-md text-3xl">Built for the way studying actually works.</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="bg-white shadow-none">
              <CardHeader>
                <div className="bg-primary/10 mb-2 flex h-9 w-9 items-center justify-center rounded-md">
                  <Icon className="text-primary h-4 w-4" strokeWidth={2} />
                </div>
                <CardTitle className="text-xl font-normal">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">{body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works — genuine sequence, so numbering is earned here */}
      <section id="how-it-works" className="mx-auto max-w-6xl border-t px-6 py-20">
        <h2 className="max-w-md text-3xl">How it works</h2>
        <div className="mt-10 grid gap-10 md:grid-cols-3">
          {STEPS.map(({ n, title, body }) => (
            <div key={n}>
              <div className="text-primary text-4xl">{n}</div>
              <h3 className="mt-3 text-lg font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-primary">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-16 md:flex-row md:items-center">
          <h3 className="text-primary-foreground max-w-sm text-3xl">Your next study session starts with one paste.</h3>
          <Button size="lg" asChild>
            <a href="/auth/signup">Create your first deck</a>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto flex max-w-6xl items-center justify-between px-6 py-10 text-sm">
        <span>© {new Date().getFullYear()} Memoro</span>
        <div className="flex gap-6">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
        </div>
      </footer>
    </div>
  );
}
