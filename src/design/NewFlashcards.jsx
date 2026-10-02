import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sparkles, Pencil, Trash2 } from "lucide-react";

const MOCK_GENERATED = [
  {
    front: "What is the powerhouse of the cell?",
    back: "The mitochondrion — it generates most of the cell's ATP through cellular respiration.",
  },
  {
    front: "What are the two membranes of a mitochondrion?",
    back: "An outer membrane and a highly folded inner membrane, which forms structures called cristae.",
  },
  {
    front: "Why do mitochondria have their own DNA?",
    back: "They likely originated from free-living bacteria absorbed by an ancestral cell — the endosymbiotic theory.",
  },
];

export default function NewFlashcards() {
  const [generated, setGenerated] = useState(false);

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-3xl">New set</h1>
        <p className="mt-1 text-sm text-[#1C2321]/50">
          Paste in text and Stax will draft a deck of cards for you to review and edit.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Left: source text */}
        <div className="space-y-5">
          <div>
            <Label htmlFor="set-title" className="text-sm text-[#1C2321]/70">
              Set title
            </Label>
            <Input
              id="set-title"
              placeholder="e.g. Cell Biology — Ch. 4"
              className="mt-1.5 border-[#E4E2D6] bg-white"
            />
          </div>

          <div>
            <Label htmlFor="set-desc" className="text-sm text-[#1C2321]/70">
              Description <span className="font-normal text-[#1C2321]/40">(optional)</span>
            </Label>
            <Input id="set-desc" placeholder="What is this set for?" className="mt-1.5 border-[#E4E2D6] bg-white" />
          </div>

          <div>
            <Label htmlFor="source-text" className="text-sm text-[#1C2321]/70">
              Source text
            </Label>
            <Textarea
              id="source-text"
              placeholder="Paste your notes, an article, a textbook passage — anything you want turned into flashcards."
              className="mt-1.5 min-h-[280px] border-[#E4E2D6] bg-white leading-relaxed"
              defaultValue="Mitochondria are membrane-bound organelles found in most eukaryotic cells. Often called the powerhouse of the cell, they generate most of the cell's supply of ATP through cellular respiration..."
            />
            <p className="mt-1.5 text-xs text-[#1C2321]/40">1,240 characters</p>
          </div>

          <Button
            onClick={() => {
              setGenerated(true);
            }}
            className="gap-2 bg-[#3D5A80] text-white hover:bg-[#324A69]"
          >
            <Sparkles className="h-4 w-4" />
            Generate flashcards
          </Button>

          {generated && (
            <div className="pt-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-[#1C2321]/70">
                  {MOCK_GENERATED.length} cards generated — review before saving
                </h2>
              </div>
              <div className="space-y-3">
                {MOCK_GENERATED.map((card, i) => (
                  <Card key={i} className="border-[#E4E2D6] bg-white shadow-none">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div>
                            <span className="text-xs tracking-wide text-[#1C2321]/40 uppercase">Front</span>
                            <p className="mt-0.5 text-sm">{card.front}</p>
                          </div>
                          <div>
                            <span className="text-xs tracking-wide text-[#1C2321]/40 uppercase">Back</span>
                            <p className="mt-0.5 text-sm text-[#1C2321]/70">{card.back}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <Pencil className="h-3.5 w-3.5 text-[#1C2321]/50" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <Trash2 className="h-3.5 w-3.5 text-[#1C2321]/50" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button className="mt-5 bg-[#588157] text-white hover:bg-[#4B7048]">Save set</Button>
            </div>
          )}
        </div>

        {/* Right: generation settings */}
        <div className="space-y-5">
          <Card className="border-[#E4E2D6] bg-white shadow-none">
            <CardContent className="space-y-5 p-5">
              <h2 className="text-sm font-medium">Generation settings</h2>

              <div>
                <Label className="text-sm text-[#1C2321]/70">Number of cards</Label>
                <Select defaultValue="auto">
                  <SelectTrigger className="mt-1.5 border-[#E4E2D6] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="10">10 cards</SelectItem>
                    <SelectItem value="20">20 cards</SelectItem>
                    <SelectItem value="30">30 cards</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm text-[#1C2321]/70">Card style</Label>
                <Select defaultValue="qa">
                  <SelectTrigger className="mt-1.5 border-[#E4E2D6] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qa">Question &amp; answer</SelectItem>
                    <SelectItem value="term">Term &amp; definition</SelectItem>
                    <SelectItem value="cloze">Fill in the blank</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm text-[#1C2321]/70">Difficulty</Label>
                <Select defaultValue="mixed">
                  <SelectTrigger className="mt-1.5 border-[#E4E2D6] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recall">Simple recall</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                    <SelectItem value="deep">Deep understanding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
