import { describe, expect, it, vi } from 'vitest'

import { buildRagContext } from './rag'

const validSummary = JSON.stringify({
  version: 4,
  language: 'en',
  tl_dr: 'Fast take.',
  overview: 'Detailed overview.',
  keypoints: [{ title: 'Point', detail: 'Detail', evidence: 'Evidence' }],
})

function createSupabaseMock(taskOutputs: Array<Record<string, unknown>>) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  video_title: 'Test Video',
                  video_url: 'https://example.com/video',
                  status: 'completed',
                  progress: 100,
                },
              }),
            }),
          }),
        }
      }

      if (table === 'task_outputs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: taskOutputs,
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe('buildRagContext', () => {
  it('includes markdown generated from a valid V4 summary', async () => {
    const supabase = createSupabaseMock([
      {
        kind: 'summary',
        status: 'completed',
        locale: null,
        content: validSummary,
      },
    ])

    const result = await buildRagContext('task-123', supabase as never)

    expect(result).toContain('Video Title: Test Video')
    expect(result).toContain('## Summary')
    expect(result).toContain('## In Brief')
    expect(result).toContain('Detailed overview.')
  })

  it('skips invalid legacy summaries', async () => {
    const supabase = createSupabaseMock([
      {
        kind: 'summary',
        status: 'completed',
        locale: null,
        content: 'legacy text summary',
      },
    ])

    const result = await buildRagContext('task-123', supabase as never)

    expect(result).toContain('Video Title: Test Video')
    expect(result).not.toContain('## Summary')
    expect(result).not.toContain('legacy text summary')
  })
})
