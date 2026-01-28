"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createGame() {
    setLoading(true);
    setError(null);
    setCreatedCode(null);

    try {
      const code = generateCode();
      const { error: gameErr } = await supabase
        .from("games")
        .insert({ code, phase: "lobby" });

      if (gameErr) throw gameErr;

      setCreatedCode(code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 min-h-screen">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {createdCode ? (
        <div className="text-center space-y-6">
          <p className="text-zinc-500 text-sm">Szoba létrehozva</p>
          <p className="text-6xl font-mono font-bold tracking-[0.3em] text-violet-400">
            {createdCode}
          </p>
          <button
            onClick={() => setCreatedCode(null)}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            Új szoba
          </button>
        </div>
      ) : (
        <button
          onClick={createGame}
          disabled={loading}
          className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
        >
          {loading ? "..." : "Szoba létrehozása"}
        </button>
      )}
    </div>
  );
}
