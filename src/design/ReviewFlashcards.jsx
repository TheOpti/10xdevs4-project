import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { X } from "lucide-react";

const CARD = {
  front: "What organelle produces most of a cell's ATP?",
  back: "The mitochondrion, through the process of cellular respiration.",
};

const RATINGS = [
  { label: "Again", sub: "<1m", color: "#C1443A", bg: "#C1443A1A" },
  { label: "Hard", sub: "6m", color: "#EE6C4D", bg: "#EE6C4D1A" },
  { label: "Good", sub: "1d", color: "#3D5A80", bg: "#3D5A801A" },
  { label: "Easy", sub: "4d", color: "#588157", bg: "#5881571A" },
];

export default function ReviewFlashcards() {
  const [revealed, setRevealed] = useState(false);

  const current = 4;
  const total = 20;

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F6F2] font-sans text-[#1C2321]">
      {/* Top bar */}
      <header className="flex h-16 items-center gap-4 px-6">
        <Button size="icon" variant="ghost" className="text-[#1C2321]/60">
          <X className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="mb-1.5 flex items-center justify-between text-xs text-[#1C2321]/50">
            <span>Cell Biology — Ch. 4</span>
            <span>
              {current} / {total}
            </span>
          </div>
          <Progress value={(current / total) * 100} className="h-1.5 bg-[#E4E2D6] [&>div]:bg-[#3D5A80]" />
        </div>
      </header>

      {/* Card */}
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-xl">
          <button
            onClick={() => {
              setRevealed(!revealed);
            }}
            className="flex min-h-[320px] w-full flex-col justify-center rounded-2xl border border-[#E4E2D6] bg-white p-10 text-left shadow-sm"
          >
            {!revealed ? (
              <div className="text-center">
                <span className="text-xs tracking-wide text-[#1C2321]/40 uppercase">Question</span>
                <p className="mt-4 text-2xl leading-snug md:text-3xl">{CARD.front}</p>
              </div>
            ) : (
              <div className="text-center">
                <span className="text-xs tracking-wide text-[#1C2321]/40 uppercase">Answer</span>
                <p className="mt-4 text-2xl leading-snug md:text-3xl">{CARD.back}</p>
              </div>
            )}
          </button>

          {!revealed ? (
            <Button
              onClick={() => {
                setRevealed(true);
              }}
              className="mt-6 h-12 w-full bg-[#3D5A80] text-white hover:bg-[#324A69]"
            >
              Show answer
            </Button>
          ) : (
            <div className="mt-6 grid grid-cols-4 gap-3">
              {RATINGS.map(({ label, sub, color, bg }) => (
                <button
                  key={label}
                  onClick={() => {
                    setRevealed(false);
                  }}
                  className="flex h-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-[#E4E2D6] transition-colors hover:brightness-95"
                  style={{ backgroundColor: bg }}
                >
                  <span className="text-sm font-medium" style={{ color }}>
                    {label}
                  </span>
                  <span className="text-xs text-[#1C2321]/40">{sub}</span>
                </button>
              ))}
            </div>
          )}

          <p className="mt-5 text-center text-xs text-[#1C2321]/35">Space to flip · 1–4 to rate</p>
        </div>
      </main>
    </div>
  );
}
