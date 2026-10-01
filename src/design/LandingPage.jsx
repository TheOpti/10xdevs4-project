import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Layers, Brain, Clock, RefreshCw } from "lucide-react";

const FEATURES = [
  {
    icon: Brain,
    title: "Paste anything",
    body: "Drop in a chapter, a set of notes, an article — Stax reads it and pulls out the ideas worth remembering.",
  },
  {
    icon: RefreshCw,
    title: "Cards that adapt",
    body: "Each card is rated as you review it, so the ones you're shaky on come back sooner than the ones you know cold.",
  },
  {
    icon: Clock,
    title: "Five minutes a day",
    body: "Short, spaced sessions beat long cram nights. Stax tells you exactly what's due and nothing else.",
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
    title: "Stax builds the deck",
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
    <div className="min-h-screen bg-[#F5F6F2] font-sans text-[#1C2321]">
      {/* Navbar */}
      <header className="border-b border-[#E4E2D6]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#3D5A80]">
              <Layers className="h-4 w-4 text-[#F5F6F2]" strokeWidth={2.25} />
            </div>
            <span className="text-lg tracking-tight">Stax</span>
          </div>

          <nav className="hidden items-center gap-8 text-sm text-[#1C2321]/70 md:flex">
            <a href="#features" className="hover:text-[#1C2321]">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-[#1C2321]">
              How it works
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" className="text-[#1C2321]">
              Sign in
            </Button>
            <Button className="bg-[#3D5A80] text-white hover:bg-[#324A69]">Sign up</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-20 pb-24 md:grid-cols-2">
        <div>
          <h1 className="text-5xl leading-[1.05] tracking-tight md:text-6xl">
            Turn what you're reading into what you'll remember.
          </h1>
          <p className="mt-6 max-w-md text-lg text-[#1C2321]/70">
            Paste in any block of text and Stax builds a deck of flashcards from it — then reviews them with you until
            they stick.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Button size="lg" className="bg-[#3D5A80] text-white hover:bg-[#324A69]">
              Get started free
            </Button>
            <Button size="lg" variant="outline" className="border-[#E4E2D6]">
              See how it works
            </Button>
          </div>
        </div>

        {/* Fanned index-card visual, standing in for a future screenshot */}
        <div className="relative h-80">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative h-40 w-64">
              <div className="absolute inset-0 -translate-x-4 translate-y-3 -rotate-6 rounded-lg border border-[#E4E2D6] bg-white shadow-sm" />
              <div className="absolute inset-0 translate-x-3 -translate-y-2 rotate-3 rounded-lg border border-[#E4E2D6] bg-white shadow-sm" />
              <div className="absolute inset-0 flex flex-col justify-between rounded-lg border border-[#E4E2D6] bg-white p-5 shadow-md">
                <span className="text-xs tracking-wide text-[#1C2321]/40 uppercase">Cell biology</span>
                <p className="text-lg leading-snug">What organelle produces most of a cell's ATP?</p>
                <span className="text-xs text-[#1C2321]/40">Tap to reveal</span>
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
            <Card key={title} className="border-[#E4E2D6] bg-white shadow-none">
              <CardHeader>
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-[#3D5A80]/10">
                  <Icon className="h-4 w-4 text-[#3D5A80]" strokeWidth={2} />
                </div>
                <CardTitle className="text-xl font-normal">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed text-[#1C2321]/60">{body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works — genuine sequence, so numbering is earned here */}
      <section id="how-it-works" className="mx-auto max-w-6xl border-t border-[#E4E2D6] px-6 py-20">
        <h2 className="max-w-md text-3xl">How it works</h2>
        <div className="mt-10 grid gap-10 md:grid-cols-3">
          {STEPS.map(({ n, title, body }) => (
            <div key={n}>
              <div className="text-4xl text-[#3D5A80]">{n}</div>
              <h3 className="mt-3 text-lg font-medium">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#1C2321]/60">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-[#3D5A80]">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-16 md:flex-row md:items-center">
          <h3 className="max-w-sm text-3xl text-white">Your next study session starts with one paste.</h3>
          <Button size="lg" className="bg-[#EE6C4D] text-white hover:bg-[#DD5A3C]">
            Create your first deck
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto flex max-w-6xl items-center justify-between px-6 py-10 text-sm text-[#1C2321]/50">
        <span>© {new Date().getFullYear()} Stax</span>
        <div className="flex gap-6">
          <a href="#" className="hover:text-[#1C2321]">
            Privacy
          </a>
          <a href="#" className="hover:text-[#1C2321]">
            Terms
          </a>
        </div>
      </footer>
    </div>
  );
}
