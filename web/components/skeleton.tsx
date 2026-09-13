/**
 * What a page looks like before its data arrives: the same shapes at the same places, in a
 * quiet shimmer, so the eye has somewhere to rest and nothing jumps when the real rows land.
 */
export function TodaySkeleton() {
  return (
    <div className="today" role="status" aria-busy="true" aria-label="Loading">
      <section className="today-main">
        <div className="skeleton daybar-skeleton">
          <span className="sk sk-line" style={{ width: '32%' }} />
          <div className="sk-track">
            <span className="sk sk-seg" style={{ flex: 5 }} />
            <span className="sk sk-seg" style={{ flex: 1 }} />
            <span className="sk sk-seg" style={{ flex: 3 }} />
            <span className="sk sk-seg" style={{ flex: 1 }} />
          </div>
        </div>
        <div className="skeleton sk-panel">
          <span className="sk sk-line" style={{ width: '18%' }} />
          <div className="sk-grid">
            <span className="sk sk-button" />
            <span className="sk sk-button" />
            <span className="sk sk-button" />
            <span className="sk sk-button" />
          </div>
        </div>
        <RowsSkeleton rows={5} />
      </section>
    </div>
  )
}

export function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="skeleton sk-rows">
      <span className="sk sk-line" style={{ width: '12%' }} />
      <ol className="sk-list">
        {Array.from({ length: rows }, (_, i) => (
          <li key={`sk-${i.toString()}`} className="sk-row">
            <span className="sk sk-tile" />
            <span className="sk-main">
              <span className="sk sk-line" style={{ width: `${52 - (i % 3) * 9}%` }} />
              <span className="sk sk-line sk-thin" style={{ width: `${30 + (i % 2) * 8}%` }} />
            </span>
            <span className="sk sk-line sk-thin" style={{ width: '5rem' }} />
            <span className="sk sk-chip" />
          </li>
        ))}
      </ol>
    </div>
  )
}

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="page-column" role="status" aria-busy="true" aria-label="Loading">
      <div className="skeleton">
        <span className="sk sk-title" />
        <span className="sk sk-line" style={{ width: '40%' }} />
      </div>
      <RowsSkeleton rows={rows} />
    </div>
  )
}

export function BoardSkeleton() {
  return (
    <div className="board-skeleton" role="status" aria-busy="true" aria-label="Loading">
      <span className="sk sk-hub" />
      <div className="sk-groups">
        <span className="sk sk-group" />
        <span className="sk sk-group" style={{ height: '140px' }} />
        <span className="sk sk-group" style={{ height: '260px' }} />
        <span className="sk sk-group" style={{ height: '120px' }} />
      </div>
    </div>
  )
}
