export function WhoAreYou({ trip, onPick }) {
  return (
    <main class="page">
      <h1>¿Quién sos?</h1>
      <p class="muted">{trip.name} · tocá tu nombre. Lo podés cambiar después.</p>
      <div class="stack">
        {trip.members.map((m) => (
          <button key={m} class="btn big" onClick={() => onPick(m)}>{m}</button>
        ))}
      </div>
    </main>
  )
}
