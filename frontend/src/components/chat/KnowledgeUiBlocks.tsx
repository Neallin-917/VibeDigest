import type {
  BarChartBlock,
  ComparisonTableBlock,
  CurrentSummaryUiBlock,
  StepsBlock,
} from '@/lib/summary-contract'

function BlockShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/80 bg-surface-raised/80 px-5 py-4">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

function ComparisonTable({ block }: { block: ComparisonTableBlock }) {
  return (
    <BlockShell title={block.title}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] border-separate border-spacing-0 text-left text-sm">
          <thead className="text-xs font-medium text-muted-foreground">
            <tr>
              <th aria-hidden="true" className="pb-3 pr-4 font-medium" />
              {block.columns.map(column => (
                <th key={column} scope="col" className="pb-3 pr-4 font-medium last:pr-0">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map(row => (
              <tr key={row.label} className="border-t border-border/70">
                <th scope="row" className="border-t border-border/70 py-3 pr-4 font-medium text-foreground">
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td key={`${row.label}-${block.columns[index]}`} className="border-t border-border/70 py-3 pr-4 text-muted-foreground last:pr-0">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BlockShell>
  )
}

function BarChart({ block }: { block: BarChartBlock }) {
  const maxValue = Math.max(...block.values.map(item => item.value), 1)
  const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

  return (
    <BlockShell title={block.title}>
      <dl className="space-y-3" aria-label={block.title}>
        {block.values.map(item => {
          const width = `${Math.max((item.value / maxValue) * 100, 3)}%`
          const valueLabel = `${formatter.format(item.value)} ${block.unit}`

          return (
            <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
              <dt className="truncate text-sm text-foreground">{item.label}</dt>
              <dd className="text-sm tabular-nums text-muted-foreground">{valueLabel}</dd>
              <div className="col-span-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-primary/80" style={{ width }} />
              </div>
            </div>
          )
        })}
      </dl>
    </BlockShell>
  )
}

function Steps({ block }: { block: StepsBlock }) {
  return (
    <BlockShell title={block.title}>
      <ol>
        {block.steps.map((step, index) => (
          <li
            key={`${step.title}-${index}`}
            className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 border-t border-border/70 py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <span aria-hidden="true" className="pt-0.5 text-[11px] font-medium tabular-nums text-primary/80">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <p className="text-sm font-semibold leading-5 text-foreground">{step.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </BlockShell>
  )
}

export function KnowledgeUiBlocks({ blocks }: { blocks: CurrentSummaryUiBlock[] }) {
  return (
    <div className="space-y-3">
      {blocks.map(block => {
        switch (block.kind) {
          case 'comparison_table':
            return <ComparisonTable key={block.id} block={block} />
          case 'bar_chart':
            return <BarChart key={block.id} block={block} />
          case 'steps':
            return <Steps key={block.id} block={block} />
        }
      })}
    </div>
  )
}
