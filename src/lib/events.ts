type VotingEvent = { status: string; voting_closes_at: string };

/** ¿Se puede votar ahora? Exige estado «abierto» y no haber llegado a la hora de cierre. */
export function isVotingOpen(ev: VotingEvent) {
  return ev.status === "abierto" && Date.now() < new Date(ev.voting_closes_at).getTime();
}

/** ¿Ya pasó la hora de cierre? (a partir de ahí los votos de todos son visibles) */
export function hasClosed(ev: VotingEvent) {
  return Date.now() >= new Date(ev.voting_closes_at).getTime();
}
