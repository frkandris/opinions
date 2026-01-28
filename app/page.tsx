"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Game = {
  id: string;
  code: string;
  phase: string;
  current_opinion_index: number;
  current_voter_index: number;
};

type Player = {
  id: string;
  game_id: string;
  name: string;
  is_host: boolean;
};

type Opinion = {
  id: string;
  game_id: string;
  player_id: string;
  text: string;
  order_index: number;
};

type Vote = {
  id: string;
  game_id: string;
  opinion_id: string;
  voter_player_id: string;
  agree: boolean;
  guessed_author_id: string;
};

type Screen = "home" | "name" | "lobby" | "game";

function clampName(name: string) {
  return name.trim().slice(0, 24);
}

function clampOpinion(text: string) {
  return text.trim().slice(0, 220);
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>("home");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [opinions, setOpinions] = useState<Opinion[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");

  const [opinionDraft, setOpinionDraft] = useState("");
  const [agreeDraft, setAgreeDraft] = useState<boolean | null>(null);
  const [guessDraft, setGuessDraft] = useState("");

  const myPlayer = players.find((p) => p.id === myPlayerId);
  const isHost = myPlayer?.is_host ?? false;
  const sortedPlayers = useMemo(() => [...players].sort((a, b) => (a.is_host ? -1 : 1)), [players]);
  const sortedOpinions = useMemo(() => [...opinions].sort((a, b) => a.order_index - b.order_index), [opinions]);

  const currentOpinion = sortedOpinions[game?.current_opinion_index ?? 0];
  const currentVoter = sortedPlayers[game?.current_voter_index ?? 0];

  const myOpinion = opinions.find((o) => o.player_id === myPlayerId);
  const myVoteForCurrentOpinion = votes.find(
    (v) => v.opinion_id === currentOpinion?.id && v.voter_player_id === myPlayerId
  );

  const allPlayersSubmittedOpinions = players.length > 0 && opinions.length === players.length;
  const totalTurns = sortedOpinions.length * sortedPlayers.length;
  const completedTurns = votes.length;

  const subscribeToGame = useCallback((gameId: string) => {
    const channels: RealtimeChannel[] = [];

    const gameChannel = supabase
      .channel(`game-${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, (payload) => {
        if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
          setGame(payload.new as Game);
        } else if (payload.eventType === "DELETE") {
          setGame(null);
          setScreen("home");
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `game_id=eq.${gameId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          setPlayers((prev) => [...prev.filter((p) => p.id !== (payload.new as Player).id), payload.new as Player]);
        } else if (payload.eventType === "UPDATE") {
          setPlayers((prev) => prev.map((p) => (p.id === (payload.new as Player).id ? (payload.new as Player) : p)));
        } else if (payload.eventType === "DELETE") {
          setPlayers((prev) => prev.filter((p) => p.id !== (payload.old as Player).id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "opinions", filter: `game_id=eq.${gameId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          setOpinions((prev) => [...prev.filter((o) => o.id !== (payload.new as Opinion).id), payload.new as Opinion]);
        } else if (payload.eventType === "UPDATE") {
          setOpinions((prev) => prev.map((o) => (o.id === (payload.new as Opinion).id ? (payload.new as Opinion) : o)));
        } else if (payload.eventType === "DELETE") {
          setOpinions((prev) => prev.filter((o) => o.id !== (payload.old as Opinion).id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "votes", filter: `game_id=eq.${gameId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          setVotes((prev) => [...prev.filter((v) => v.id !== (payload.new as Vote).id), payload.new as Vote]);
        } else if (payload.eventType === "UPDATE") {
          setVotes((prev) => prev.map((v) => (v.id === (payload.new as Vote).id ? (payload.new as Vote) : v)));
        } else if (payload.eventType === "DELETE") {
          setVotes((prev) => prev.filter((v) => v.id !== (payload.old as Vote).id));
        }
      })
      .subscribe();

    channels.push(gameChannel);

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, []);

  useEffect(() => {
    if (!game?.id) return;
    const unsub = subscribeToGame(game.id);
    return unsub;
  }, [game?.id, subscribeToGame]);

  async function checkCode() {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) return;

    setLoading(true);
    setError(null);

    try {
      const { data: existingGame, error: findErr } = await supabase
        .from("games")
        .select()
        .eq("code", code)
        .single();

      if (findErr || !existingGame) throw new Error("Nincs ilyen kód.");

      if (existingGame.phase !== "lobby") {
        throw new Error("A játék már elkezdődött.");
      }

      setGame(existingGame);
      setScreen("name");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function joinGame() {
    const name = clampName(playerName);
    if (!name || !game) return;

    setLoading(true);
    setError(null);

    try {
      const { data: existingPlayers } = await supabase
        .from("players")
        .select()
        .eq("game_id", game.id);

      if (existingPlayers?.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        throw new Error("Ez a név már foglalt.");
      }

      const { data: newPlayer, error: playerErr } = await supabase
        .from("players")
        .insert({ game_id: game.id, name, is_host: false })
        .select()
        .single();

      if (playerErr) throw playerErr;

      const { data: allPlayers } = await supabase.from("players").select().eq("game_id", game.id);
      const { data: allOpinions } = await supabase.from("opinions").select().eq("game_id", game.id);
      const { data: allVotes } = await supabase.from("votes").select().eq("game_id", game.id);

      setPlayers(allPlayers ?? []);
      setOpinions(allOpinions ?? []);
      setVotes(allVotes ?? []);
      setMyPlayerId(newPlayer.id);
      setScreen("lobby");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function startOpinionsPhase() {
    if (!game || !isHost) return;
    await supabase.from("games").update({ phase: "opinions" }).eq("id", game.id);
  }

  async function submitOpinion() {
    if (!game || !myPlayerId) return;
    const text = clampOpinion(opinionDraft);
    if (!text) return;

    setLoading(true);
    try {
      await supabase.from("opinions").insert({
        game_id: game.id,
        player_id: myPlayerId,
        text,
        order_index: opinions.length,
      });
      setOpinionDraft("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function startPlayPhase() {
    if (!game || !isHost) return;
    await supabase.from("games").update({ phase: "play", current_opinion_index: 0, current_voter_index: 0 }).eq("id", game.id);
  }

  async function submitVote() {
    if (!game || !myPlayerId || !currentOpinion) return;
    if (agreeDraft === null || !guessDraft) return;

    setLoading(true);
    try {
      await supabase.from("votes").insert({
        game_id: game.id,
        opinion_id: currentOpinion.id,
        voter_player_id: myPlayerId,
        agree: agreeDraft,
        guessed_author_id: guessDraft,
      });

      setAgreeDraft(null);
      setGuessDraft("");

      const newVotesCount = votes.length + 1;
      const expectedVotesForCurrentOpinion = sortedPlayers.length;
      const votesForCurrentOpinion = votes.filter((v) => v.opinion_id === currentOpinion.id).length + 1;

      if (votesForCurrentOpinion >= expectedVotesForCurrentOpinion) {
        const nextOpinionIndex = (game.current_opinion_index ?? 0) + 1;
        if (nextOpinionIndex >= sortedOpinions.length) {
          await supabase.from("games").update({ phase: "results" }).eq("id", game.id);
        } else {
          await supabase.from("games").update({ current_opinion_index: nextOpinionIndex, current_voter_index: 0 }).eq("id", game.id);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function resetGame() {
    setGame(null);
    setPlayers([]);
    setOpinions([]);
    setVotes([]);
    setMyPlayerId(null);
    setScreen("home");
    setError(null);
  }

  const scores = useMemo(() => {
    const byPlayer: Record<string, { correctGuesses: number; totalGuesses: number }> = {};
    for (const p of players) {
      byPlayer[p.id] = { correctGuesses: 0, totalGuesses: 0 };
    }

    for (const v of votes) {
      const opinion = opinions.find((o) => o.id === v.opinion_id);
      if (!opinion) continue;
      if (!byPlayer[v.voter_player_id]) continue;
      byPlayer[v.voter_player_id].totalGuesses += 1;
      if (v.guessed_author_id === opinion.player_id) {
        byPlayer[v.voter_player_id].correctGuesses += 1;
      }
    }

    return byPlayer;
  }, [opinions, players, votes]);

  const opinionStats = useMemo(() => {
    const stats: Record<string, { agree: number; disagree: number }> = {};
    for (const o of opinions) {
      stats[o.id] = { agree: 0, disagree: 0 };
    }
    for (const v of votes) {
      const s = stats[v.opinion_id];
      if (!s) continue;
      if (v.agree) s.agree += 1;
      else s.disagree += 1;
    }
    return stats;
  }, [opinions, votes]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Vélemények</h1>
        {game && (
          <div className="flex items-center gap-3">
            <span className="text-zinc-500 font-mono text-sm">{game.code}</span>
            <button
              onClick={resetGame}
              className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-xs text-zinc-500 hover:text-zinc-300"
          >
            Bezárás
          </button>
        </div>
      )}

      {/* Home Screen - csak kód beírás */}
      {screen === "home" && (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-full max-w-xs space-y-6">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="KÓD"
              maxLength={4}
              className="w-full bg-transparent border-b-2 border-white/20 pb-3 text-4xl font-mono tracking-[0.3em] outline-none placeholder:text-zinc-700 focus:border-violet-500 transition-colors text-center uppercase"
            />
            <button
              onClick={checkCode}
              disabled={loading || joinCode.length < 4}
              className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {loading ? "..." : "Tovább"}
            </button>
          </div>
        </div>
      )}

      {/* Name Screen - név megadása csatlakozás előtt */}
      {screen === "name" && game && (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-full max-w-xs space-y-6">
            <p className="text-center text-zinc-500 font-mono tracking-widest">{game.code}</p>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Neved"
              className="w-full bg-transparent border-b-2 border-white/20 pb-3 text-2xl outline-none placeholder:text-zinc-700 focus:border-violet-500 transition-colors text-center"
              autoFocus
            />
            <button
              onClick={joinGame}
              disabled={loading || !clampName(playerName)}
              className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {loading ? "..." : "Csatlakozás"}
            </button>
            <button
              onClick={() => { setScreen("home"); setGame(null); setError(null); }}
              className="w-full text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
            >
              Vissza
            </button>
          </div>
        </div>
      )}

      {/* Lobby */}
      {screen === "lobby" && game?.phase === "lobby" && (
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-zinc-500 text-sm mb-2">Kód</p>
            <p className="text-4xl font-mono font-bold tracking-widest text-violet-400">{game.code}</p>
          </div>

          <div className="space-y-2">
            {sortedPlayers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10"
              >
                <span className="font-medium">
                  {p.name}
                  {p.id === myPlayerId && <span className="text-zinc-500 ml-2">te</span>}
                </span>
                {p.is_host && <span className="text-amber-400">👑</span>}
              </div>
            ))}
          </div>

          {isHost ? (
            <button
              onClick={startOpinionsPhase}
              disabled={players.length < 2}
              className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
            >
              Indítás
            </button>
          ) : (
            <p className="text-center text-zinc-500 text-sm">Várakozás...</p>
          )}
        </div>
      )}

      {/* Opinions Phase */}
      {game?.phase === "opinions" && (
        <div className="space-y-6">
          {!myOpinion ? (
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <textarea
                value={opinionDraft}
                onChange={(e) => setOpinionDraft(e.target.value)}
                placeholder="Írd ide a véleményed..."
                className="w-full bg-transparent resize-none h-32 outline-none placeholder:text-zinc-600 text-lg"
              />
              <button
                onClick={submitOpinion}
                disabled={loading || !clampOpinion(opinionDraft)}
                className="mt-4 w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
              >
                Küldés
              </button>
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-emerald-400 text-sm mb-2">✓ Elküldve</p>
              <p className="text-zinc-300">{myOpinion.text}</p>
            </div>
          )}

          <div className="flex items-center gap-2 justify-center">
            {sortedPlayers.map((p) => {
              const done = opinions.some((o) => o.player_id === p.id);
              return (
                <div
                  key={p.id}
                  className={`w-3 h-3 rounded-full transition-colors ${done ? "bg-emerald-500" : "bg-zinc-700"}`}
                  title={p.name}
                />
              );
            })}
          </div>

          {isHost && allPlayersSubmittedOpinions && (
            <button
              onClick={startPlayPhase}
              className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 font-medium transition-colors"
            >
              Tovább
            </button>
          )}
        </div>
      )}

      {/* Play Phase */}
      {game?.phase === "play" && currentOpinion && (
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-zinc-500 text-xs mb-4">
              {(game.current_opinion_index ?? 0) + 1} / {sortedOpinions.length}
            </p>
            <p className="text-xl font-medium leading-relaxed">„{currentOpinion.text}"</p>
          </div>

          {!myVoteForCurrentOpinion ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setAgreeDraft(true)}
                  className={`py-4 rounded-xl font-medium transition-all ${
                    agreeDraft === true
                      ? "bg-emerald-500 text-white"
                      : "bg-white/5 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  Igen
                </button>
                <button
                  onClick={() => setAgreeDraft(false)}
                  className={`py-4 rounded-xl font-medium transition-all ${
                    agreeDraft === false
                      ? "bg-red-500 text-white"
                      : "bg-white/5 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  Nem
                </button>
              </div>

              <select
                value={guessDraft}
                onChange={(e) => setGuessDraft(e.target.value)}
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 outline-none appearance-none cursor-pointer"
              >
                <option value="" className="bg-zinc-900">Ki mondta?</option>
                {sortedPlayers
                  .filter((p) => p.id !== myPlayerId)
                  .map((p) => (
                    <option key={p.id} value={p.id} className="bg-zinc-900">
                      {p.name}
                    </option>
                  ))}
              </select>

              <button
                onClick={submitVote}
                disabled={loading || agreeDraft === null || !guessDraft}
                className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
              >
                Küldés
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-emerald-400">✓ Szavaztál</p>
              <p className="text-zinc-500 text-sm mt-2">Várakozás...</p>
            </div>
          )}

          <div className="flex items-center gap-2 justify-center">
            {sortedPlayers.map((p) => {
              const done = votes.some(
                (v) => v.opinion_id === currentOpinion.id && v.voter_player_id === p.id
              );
              return (
                <div
                  key={p.id}
                  className={`w-3 h-3 rounded-full transition-colors ${done ? "bg-emerald-500" : "bg-zinc-700"}`}
                  title={p.name}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {game?.phase === "results" && (
        <div className="space-y-8">
          <div className="space-y-2">
            {players
              .map((p) => ({
                player: p,
                score: scores[p.id]?.correctGuesses ?? 0,
              }))
              .sort((a, b) => b.score - a.score)
              .map(({ player, score }, idx) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10"
                >
                  <span className="font-medium">
                    {idx === 0 && "🏆 "}
                    {player.name}
                    {player.id === myPlayerId && <span className="text-zinc-500 ml-2">te</span>}
                  </span>
                  <span className="text-violet-400 font-mono">{score}</span>
                </div>
              ))}
          </div>

          <div className="h-px bg-white/10" />

          <div className="space-y-3">
            {sortedOpinions.map((o) => {
              const author = players.find((p) => p.id === o.player_id);
              const s = opinionStats[o.id] ?? { agree: 0, disagree: 0 };
              return (
                <div key={o.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-zinc-300 mb-3">„{o.text}"</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">{author?.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-400">{s.agree}↑</span>
                      <span className="text-red-400">{s.disagree}↓</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={resetGame}
            className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 font-medium transition-colors"
          >
            Új játék
          </button>
        </div>
      )}
    </div>
  );
}
