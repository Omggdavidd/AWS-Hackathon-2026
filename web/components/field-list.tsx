/** Label-and-value rows. Skips a row with nothing in it rather than printing an empty label. */
export function FieldList({ rows }: { rows: [string, string | undefined][] }) {
  const present = rows.filter((row): row is [string, string] => Boolean(row[1]))
  if (present.length === 0) return null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {present.map(([label, value]) => (
        <div key={label} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
