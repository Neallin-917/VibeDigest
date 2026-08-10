import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { KnowledgeUiBlocks } from '../KnowledgeUiBlocks'

describe('KnowledgeUiBlocks', () => {
  it('renders the approved table and chart block shapes', () => {
    render(
      <KnowledgeUiBlocks
        blocks={[
          {
            kind: 'comparison_table',
            id: 'comparison-1',
            title: 'Decision trade-offs',
            columns: ['Option A', 'Option B'],
            rows: [
              { label: 'Cost', values: ['Lower', 'Higher'], evidence: 'Cost source.' },
              { label: 'Speed', values: ['Faster', 'Slower'], evidence: 'Speed source.' },
            ],
          },
          {
            kind: 'bar_chart',
            id: 'chart-1',
            title: 'Verified measures',
            unit: 'items',
            values: [
              { label: 'First', value: 2, evidence: 'First source.' },
              { label: 'Second', value: 4, evidence: 'Second source.' },
              { label: 'Third', value: 6, evidence: 'Third source.' },
            ],
          },
        ]}
      />
    )

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Decision trade-offs')).toBeInTheDocument()
    expect(screen.getByText('6 items')).toBeInTheDocument()
  })

  it('renders a sequential block when the source has an ordered process', () => {
    render(
      <KnowledgeUiBlocks
        blocks={[
          {
            kind: 'steps',
            id: 'steps-1',
            title: 'Source sequence',
            steps: [
              { title: 'Observe', detail: 'Notice the signal.', evidence: 'First step source.' },
              { title: 'Decide', detail: 'Choose the response.', evidence: 'Second step source.' },
              { title: 'Act', detail: 'Make the next move.', evidence: 'Third step source.' },
            ],
          },
        ]}
      />
    )

    expect(screen.getByRole('list')).toHaveTextContent('Observe')
  })
})
