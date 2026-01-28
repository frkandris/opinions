"use client";

import { useMemo, useState } from "react";

type Player = {
  id: string;
  name: string;
};

type Opinion = {
  id: string;
  text: string;
  authorPlayerId: string;
};

type Vote = {
  voterPlayerId: string;
  opinionId: string;
  agree: boolean;
  guessedAuthorPlayerId: string;
};

type Phase =
  | "players"
  | "opinions"
  | "play"
  | "results";

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function clampName(name: string) {
  return name.trim().slice(0, 24);
}

function clampOpinion(text: string) {
  return text.trim().slice(0, 220);
}

export default function Page() {
  const [phase, setPhase] = useState<Phase>("players");

  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState<string>("");

  const [opinions, setOpinions] = useState<Opinion[]>([]);
  const [opinionDraft, setOpinionDraft] = useState<string>("");
  const [opinionPlayerIndex, setOpinionPlayerIndex] = useState<number>(0);

  const [playOpinionIndex, setPlayOpinionIndex] = useState<number>(0);
  const [playVoterIndex, setPlayVoterIndex] = useState<number>(0);

  const [agreeDraft, setAgreeDraft] = useState<boolean | null>(null);
  const [guessDraft, setGuessDraft] = useState<string>("");

  const [votes, setVotes] = useState<Vote[]>([]);

  const canStartOpinions = players.length >= 2;
  const opinionsComplete = opinions.length === players.length && players.length > 0;

  const shuffledOpinions = useMemo(() => {
    // Stabil sorrend az adott játék során: az opinion létrehozáskor fixáljuk.
    // Itt nem keverjük újra renderenként.
    return opinions;
  }, [opinions]);

  const currentOpinion = shuffledOpinions[playOpinionIndex];
  const currentVoter = players[playVoterIndex];

  const totalTurns = useMemo(() => {
    return opinions.length * players.length;
  }, [opinions.length, players.length]);

  const completedTurns = useMemo(() => {
    return playOpinionIndex * players.length + playVoterIndex;
  }, [playOpinionIndex, playVoterIndex, players.length]);

  function resetAll() {
    setPhase("players");
    setPlayers([]);
    setNewPlayerName("");
    setOpinions([]);
    setOpinionDraft("");
    setOpinionPlayerIndex(0);
    setPlayOpinionIndex(0);
    setPlayVoterIndex(0);
    setAgreeDraft(null);
    setGuessDraft("");
    setVotes([]);
  }

  function addPlayer() {
    const name = clampName(newPlayerName);
    if (!name) return;
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return;
    setPlayers((prev) => [...prev, { id: uid(), name }]);
    setNewPlayerName("");
  }

  function removePlayer(id: string) {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  }

  function startOpinions() {
    if (!canStartOpinions) return;
    setPhase("opinions");
    setOpinions([]);
    setOpinionDraft("");
    setOpinionPlayerIndex(0);
  }

  function submitOpinion() {
    const text = clampOpinion(opinionDraft);
    const player = players[opinionPlayerIndex];
    if (!player) return;
    if (!text) return;

    setOpinions((prev) => [
      ...prev,
      {
        id: uid(),
        text,
        authorPlayerId: player.id,
      },
    ]);

    setOpinionDraft("");

    const nextIndex = opinionPlayerIndex + 1;
    if (nextIndex >= players.length) {
      setPhase("play");
      setPlayOpinionIndex(0);
      setPlayVoterIndex(0);
      setAgreeDraft(null);
      setGuessDraft("");
      setVotes([]);
      return;
    }

    setOpinionPlayerIndex(nextIndex);
  }

  function submitTurn() {
    if (!currentOpinion || !currentVoter) return;
    if (agreeDraft === null) return;
    if (!guessDraft) return;

    const vote: Vote = {
      voterPlayerId: currentVoter.id,
      opinionId: currentOpinion.id,
      agree: agreeDraft,
      guessedAuthorPlayerId: guessDraft,
    };

    setVotes((prev) => [...prev, vote]);

    setAgreeDraft(null);
    setGuessDraft("");

    const nextVoterIndex = playVoterIndex + 1;
    if (nextVoterIndex < players.length) {
      setPlayVoterIndex(nextVoterIndex);
      return;
    }

    const nextOpinionIndex = playOpinionIndex + 1;
    if (nextOpinionIndex < shuffledOpinions.length) {
      setPlayOpinionIndex(nextOpinionIndex);
      setPlayVoterIndex(0);
      return;
    }

    setPhase("results");
  }

  const scores = useMemo(() => {
    const byPlayer: Record<string, { correctGuesses: number; totalGuesses: number }> = {};
    for (const p of players) {
      byPlayer[p.id] = { correctGuesses: 0, totalGuesses: 0 };
    }

    for (const v of votes) {
      const opinion = opinions.find((o) => o.id === v.opinionId);
      if (!opinion) continue;
      if (!byPlayer[v.voterPlayerId]) continue;
      byPlayer[v.voterPlayerId].totalGuesses += 1;
      if (v.guessedAuthorPlayerId === opinion.authorPlayerId) {
        byPlayer[v.voterPlayerId].correctGuesses += 1;
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
      const s = stats[v.opinionId];
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
        <div className="row">
          <button className="btn danger" onClick={resetAll}>
            Új játék
          </button>
        </div>
      </div>

      {phase === "players" && (
        <div className="panel">
          <div className="grid two">
            <div>
              <div className="badge">1. lépés — Játékosok</div>
              <div className="hr" />

              <label>Játékos neve</label>
              <div className="row">
                <input
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Pl.: Anna"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addPlayer();
                  }}
                />
                <button className="btn primary" onClick={addPlayer} disabled={!clampName(newPlayerName)}>
                  Hozzáadás
                </button>
              </div>

              <p className="small">Minimum 2 játékos.</p>

              <div className="hr" />
              <button className="btn primary" onClick={startOpinions} disabled={!canStartOpinions}>
                Tovább: állítások
              </button>
            </div>

            <div>
              <div className="badge">Aktív játékosok: {players.length}</div>
              <div className="hr" />
              <div className="grid">
                {players.map((p) => (
                  <div key={p.id} className="panel" style={{ padding: 12 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 750 }}>{p.name}</div>
                      <button className="btn" onClick={() => removePlayer(p.id)}>
                        Törlés
                      </button>
                    </div>
                  </div>
                ))}
                {players.length === 0 && <div className="small">Még nincs játékos hozzáadva.</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === "opinions" && (
        <div className="panel">
          <div className="badge">2. lépés — Állítások</div>
          <div className="hr" />

          <div className="grid two">
            <div>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>
                Most {players[opinionPlayerIndex]?.name} írjon egy megosztó állítást
              </div>
              <div className="small">Tipp: legyen rövid, de provokatív. (Max 220 karakter.)</div>
              <div className="hr" />

              <label>Állítás</label>
              <textarea
                value={opinionDraft}
                onChange={(e) => setOpinionDraft(e.target.value)}
                placeholder="Pl.: A pizza ananásszal teljesen rendben van."
              />

              <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
                <div className="badge">
                  {opinions.length}/{players.length} kész
                </div>
                <button className="btn primary" onClick={submitOpinion} disabled={!clampOpinion(opinionDraft)}>
                  Mentés
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>Beadott állítások</div>
              <div className="small">Itt még nem mutatjuk, ki írta — csak a szervezéshez.</div>
              <div className="hr" />
              <div className="grid">
                {opinions.map((o, idx) => (
                  <div key={o.id} className="panel" style={{ padding: 12 }}>
                    <div className="small">#{idx + 1}</div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{o.text}</div>
                  </div>
                ))}
                {!opinionsComplete && opinions.length === 0 && (
                  <div className="small">Még nincs állítás.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === "play" && currentOpinion && currentVoter && (
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="badge">3. lépés — Játék</div>
            <div className="badge">
              Haladás: {completedTurns}/{totalTurns}
            </div>
          </div>
          <div className="hr" />

          <div className="grid two">
            <div>
              <div className="small">Játékos soron:</div>
              <div style={{ fontWeight: 850, fontSize: 20 }}>{currentVoter.name}</div>

              <div className="hr" />
              <div className="small">Állítás:</div>
              <div className="panel" style={{ padding: 12, whiteSpace: "pre-wrap" }}>
                {currentOpinion.text}
              </div>

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
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                <button
                  className="btn primary"
                  onClick={submitTurn}
                  disabled={agreeDraft === null || !guessDraft}
                >
                  Következő
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>Gyors infó</div>
              <div className="hr" />

              <div className="grid">
                <div className="kpi">
                  <div className="small">Aktuális állítás</div>
                  <div className="v">{playOpinionIndex + 1}/{opinions.length}</div>
                </div>
                <div className="kpi">
                  <div className="small">Aktuális játékos</div>
                  <div className="v">{playVoterIndex + 1}/{players.length}</div>
                </div>
                <div className="kpi">
                  <div className="small">Tipp</div>
                  <div className="v">+1 pont</div>
                  <div className="small">ha eltalálod, ki írta.</div>
                </div>
              </div>

              <div className="hr" />
              <div className="small">
                Tipp: ha “telefonon körbeadjátok”, mindenki csak akkor nézzen ide, amikor ő van soron.
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === "results" && (
        <div className="panel">
          <div className="badge">4. lépés — Eredmények</div>
          <div className="hr" />

          <div className="grid two">
            <div>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>Pontok (tippelés)</div>
              <div className="small">Minden helyes “ki mondta?” tipp +1 pont.</div>
              <div className="hr" />
              <div className="grid">
                {players
                  .map((p) => ({
                    player: p,
                    score: scores[p.id]?.correctGuesses ?? 0,
                    total: scores[p.id]?.totalGuesses ?? 0,
                  }))
                  .sort((a, b) => b.score - a.score)
                  .map(({ player, score, total }) => (
                    <div key={player.id} className="panel" style={{ padding: 12 }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div style={{ fontWeight: 800 }}>{player.name}</div>
                        <div className="badge">
                          {score}/{total}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              <div className="hr" />
              <button className="btn primary" onClick={resetAll}>
                Új játék indítása
              </button>
            </div>

            <div>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>Állítások összesítve</div>
              <div className="small">Itt már látszik, ki írta és mennyien értettek egyet.</div>
              <div className="hr" />

              <div className="grid">
                {opinions.map((o, idx) => {
                  const author = players.find((p) => p.id === o.authorPlayerId);
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
        Megjegyzés: ez a demo verzió mindent a böngésző memóriájában tart. Frissítésnél az állapot elveszik.
      </div>
    </div>
  );
}
