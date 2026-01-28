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

type Screen = "home" | "lobby" | "game";

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

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

  async function createGame() {
    const name = clampName(playerName);
    if (!name) return;

    setLoading(true);
    setError(null);

    try {
      const code = generateCode();
      const { data: newGame, error: gameErr } = await supabase
        .from("games")
        .insert({ code, phase: "lobby" })
        .select()
        .single();

      if (gameErr) throw gameErr;

      const { data: newPlayer, error: playerErr } = await supabase
        .from("players")
        .insert({ game_id: newGame.id, name, is_host: true })
        .select()
        .single();

      if (playerErr) throw playerErr;

      setGame(newGame);
      setPlayers([newPlayer]);
      setMyPlayerId(newPlayer.id);
      setScreen("lobby");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function joinGame() {
    const name = clampName(playerName);
    const code = joinCode.trim().toUpperCase();
    if (!name || !code) return;

    setLoading(true);
    setError(null);

    try {
      const { data: existingGame, error: findErr } = await supabase
        .from("games")
        .select()
        .eq("code", code)
        .single();

      if (findErr || !existingGame) throw new Error("Játék nem található ezzel a kóddal.");

      if (existingGame.phase !== "lobby") {
        throw new Error("Ez a játék már elkezdődött, nem lehet csatlakozni.");
      }

      const { data: existingPlayers } = await supabase
        .from("players")
        .select()
        .eq("game_id", existingGame.id);

      if (existingPlayers?.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        throw new Error("Már van ilyen nevű játékos ebben a játékban.");
      }

      const { data: newPlayer, error: playerErr } = await supabase
        .from("players")
        .insert({ game_id: existingGame.id, name, is_host: false })
        .select()
        .single();

      if (playerErr) throw playerErr;

      const { data: allPlayers } = await supabase.from("players").select().eq("game_id", existingGame.id);
      const { data: allOpinions } = await supabase.from("opinions").select().eq("game_id", existingGame.id);
      const { data: allVotes } = await supabase.from("votes").select().eq("game_id", existingGame.id);

      setGame(existingGame);
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
    <div className="container">
      <div className="header">
        <div>
          <h1 className="h1">Vélemények — party játék</h1>
          <p className="p">
            Adj hozzá egy megosztó állítást, majd tippeld meg, ki mondta, és jelöld: egyetértesz vagy nem.
          </p>
        </div>
        {game && (
          <div className="row">
            <div className="badge">Kód: {game.code}</div>
            <button className="btn danger" onClick={resetGame}>
              Kilépés
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="panel" style={{ borderColor: "rgba(239,68,68,0.5)", marginBottom: 16 }}>
          <div style={{ color: "#ef4444" }}>{error}</div>
          <button className="btn" onClick={() => setError(null)} style={{ marginTop: 8 }}>
            Bezárás
          </button>
        </div>
      )}

      {screen === "home" && (
        <div className="panel">
          <div className="grid two">
            <div>
              <div className="badge">Új játék létrehozása</div>
              <div className="hr" />

              <label>A neved</label>
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Pl.: Anna"
              />

              <div className="hr" />
              <button
                className="btn primary"
                onClick={createGame}
                disabled={loading || !clampName(playerName)}
              >
                {loading ? "Létrehozás..." : "Játék létrehozása"}
              </button>
            </div>

            <div>
              <div className="badge">Csatlakozás meglévő játékhoz</div>
              <div className="hr" />

              <label>A neved</label>
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Pl.: Anna"
              />

              <label style={{ marginTop: 12 }}>Játék kódja</label>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Pl.: ABC123"
                maxLength={6}
              />

              <div className="hr" />
              <button
                className="btn primary"
                onClick={joinGame}
                disabled={loading || !clampName(playerName) || joinCode.length < 4}
              >
                {loading ? "Csatlakozás..." : "Csatlakozás"}
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "lobby" && game?.phase === "lobby" && (
        <div className="panel">
          <div className="grid two">
            <div>
              <div className="badge">Váróterem</div>
              <div className="hr" />

              <div style={{ fontWeight: 750, fontSize: 18, marginBottom: 8 }}>
                Játék kódja: <span style={{ color: "#7c3aed" }}>{game.code}</span>
              </div>
              <div className="small">Oszd meg ezt a kódot a többi játékossal!</div>

              <div className="hr" />
              {isHost && (
                <button
                  className="btn primary"
                  onClick={startOpinionsPhase}
                  disabled={players.length < 2}
                >
                  Játék indítása ({players.length} játékos)
                </button>
              )}
              {!isHost && (
                <div className="small">Várakozás a házigazdára, hogy elindítsa a játékot...</div>
              )}
            </div>

            <div>
              <div className="badge">Játékosok: {players.length}</div>
              <div className="hr" />
              <div className="grid">
                {sortedPlayers.map((p) => (
                  <div key={p.id} className="panel" style={{ padding: 12 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 750 }}>
                        {p.name} {p.id === myPlayerId && "(te)"} {p.is_host && "👑"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {game?.phase === "opinions" && (
        <div className="panel">
          <div className="badge">2. lépés — Állítások</div>
          <div className="hr" />

          <div className="grid two">
            <div>
              {!myOpinion ? (
                <>
                  <div style={{ fontWeight: 750, marginBottom: 6 }}>
                    Írj egy megosztó állítást!
                  </div>
                  <div className="small">Tipp: legyen rövid, de provokatív. (Max 220 karakter.)</div>
                  <div className="hr" />

                  <label>Állítás</label>
                  <textarea
                    value={opinionDraft}
                    onChange={(e) => setOpinionDraft(e.target.value)}
                    placeholder="Pl.: A pizza ananásszal teljesen rendben van."
                  />

                  <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                    <button
                      className="btn primary"
                      onClick={submitOpinion}
                      disabled={loading || !clampOpinion(opinionDraft)}
                    >
                      {loading ? "Küldés..." : "Beküldés"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 750, marginBottom: 6 }}>
                    ✓ Beküldted az állításodat!
                  </div>
                  <div className="panel" style={{ padding: 12, whiteSpace: "pre-wrap" }}>
                    {myOpinion.text}
                  </div>
                  <div className="hr" />
                  <div className="small">Várakozás a többi játékosra...</div>
                </>
              )}
            </div>

            <div>
              <div className="badge">Haladás: {opinions.length}/{players.length}</div>
              <div className="hr" />
              <div className="grid">
                {sortedPlayers.map((p) => {
                  const hasOpinion = opinions.some((o) => o.player_id === p.id);
                  return (
                    <div key={p.id} className="panel" style={{ padding: 12 }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div style={{ fontWeight: 750 }}>
                          {p.name} {p.id === myPlayerId && "(te)"}
                        </div>
                        <div className="badge">{hasOpinion ? "✓ Kész" : "⏳ Vár"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isHost && allPlayersSubmittedOpinions && (
                <>
                  <div className="hr" />
                  <button className="btn primary" onClick={startPlayPhase}>
                    Tovább a szavazásra
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {game?.phase === "play" && currentOpinion && (
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="badge">3. lépés — Szavazás</div>
            <div className="badge">
              Állítás: {(game.current_opinion_index ?? 0) + 1}/{sortedOpinions.length}
            </div>
          </div>
          <div className="hr" />

          <div className="grid two">
            <div>
              <div className="small">Állítás:</div>
              <div className="panel" style={{ padding: 12, whiteSpace: "pre-wrap", fontSize: 18 }}>
                {currentOpinion.text}
              </div>

              {!myVoteForCurrentOpinion ? (
                <>
                  <div className="hr" />
                  <div className="small">Te mit gondolsz?</div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button
                      className="btn"
                      onClick={() => setAgreeDraft(true)}
                      style={{ borderColor: agreeDraft === true ? "rgba(34,197,94,0.8)" : undefined }}
                    >
                      Egyetértek
                    </button>
                    <button
                      className="btn"
                      onClick={() => setAgreeDraft(false)}
                      style={{ borderColor: agreeDraft === false ? "rgba(239,68,68,0.8)" : undefined }}
                    >
                      Nem értek egyet
                    </button>
                  </div>

                  <div className="hr" />
                  <label>Szerinted ki mondta?</label>
                  <select value={guessDraft} onChange={(e) => setGuessDraft(e.target.value)}>
                    <option value="">Válassz játékost…</option>
                    {sortedPlayers
                      .filter((p) => p.id !== myPlayerId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>

                  <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                    <button
                      className="btn primary"
                      onClick={submitVote}
                      disabled={loading || agreeDraft === null || !guessDraft}
                    >
                      {loading ? "Küldés..." : "Szavazok"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="hr" />
                  <div style={{ fontWeight: 750 }}>✓ Szavaztál erre az állításra!</div>
                  <div className="small">Várakozás a többi játékosra...</div>
                </>
              )}
            </div>

            <div>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>Ki szavazott már?</div>
              <div className="hr" />
              <div className="grid">
                {sortedPlayers.map((p) => {
                  const hasVoted = votes.some(
                    (v) => v.opinion_id === currentOpinion.id && v.voter_player_id === p.id
                  );
                  return (
                    <div key={p.id} className="panel" style={{ padding: 12 }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div style={{ fontWeight: 750 }}>
                          {p.name} {p.id === myPlayerId && "(te)"}
                        </div>
                        <div className="badge">{hasVoted ? "✓ Szavazott" : "⏳ Vár"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hr" />
              <div className="kpi">
                <div className="small">Összesen szavazatok</div>
                <div className="v">{completedTurns}/{totalTurns}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {game?.phase === "results" && (
        <div className="panel">
          <div className="badge">4. lépés — Eredmények</div>
          <div className="hr" />

          <div className="grid two">
            <div>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>Pontok (tippelés)</div>
              <div className="small">Minden helyes "ki mondta?" tipp +1 pont.</div>
              <div className="hr" />
              <div className="grid">
                {players
                  .map((p) => ({
                    player: p,
                    score: scores[p.id]?.correctGuesses ?? 0,
                    total: scores[p.id]?.totalGuesses ?? 0,
                  }))
                  .sort((a, b) => b.score - a.score)
                  .map(({ player, score, total }, idx) => (
                    <div key={player.id} className="panel" style={{ padding: 12 }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div style={{ fontWeight: 800 }}>
                          {idx === 0 && "🏆 "}{player.name} {player.id === myPlayerId && "(te)"}
                        </div>
                        <div className="badge">
                          {score}/{total}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              <div className="hr" />
              <button className="btn primary" onClick={resetGame}>
                Új játék
              </button>
            </div>

            <div>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>Állítások összesítve</div>
              <div className="small">Itt már látszik, ki írta és mennyien értettek egyet.</div>
              <div className="hr" />

              <div className="grid">
                {sortedOpinions.map((o, idx) => {
                  const author = players.find((p) => p.id === o.player_id);
                  const s = opinionStats[o.id] ?? { agree: 0, disagree: 0 };
                  return (
                    <div key={o.id} className="panel" style={{ padding: 12 }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div className="badge">#{idx + 1}</div>
                        <div className="badge">Szerző: {author?.name ?? "?"}</div>
                      </div>
                      <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{o.text}</div>
                      <div className="hr" />
                      <div className="row">
                        <div className="badge">Egyetért: {s.agree}</div>
                        <div className="badge">Nem ért egyet: {s.disagree}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 18 }} />
      <div className="small">
        Többjátékos mód — minden játékos a saját böngészőjéből játszik.
      </div>
    </div>
  );
}
