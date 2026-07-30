import { describe, expect, it, vi } from 'vitest';
import {
  deriveThreadTitle,
  restoreArchivedThreadIfNeeded,
  upsertChatState,
} from './persistence';

describe('deriveThreadTitle', () => {
  it('uses the first user text without calling a model', () => {
    expect(
      deriveThreadTitle('  请帮我总结这个视频的三个核心观点  ')
    ).toBe('请帮我总结这个视频的三个核心观点');
  });

  it('uses a stable platform and video identifier for URL-only submissions', () => {
    expect(
      deriveThreadTitle(
        'https://www.youtube.com/watch?v=hyqLNX3VExQ',
        'https://www.youtube.com/watch?v=hyqLNX3VExQ'
      )
    ).toBe('YouTube · hyqLNX3VExQ');
  });

  it('prefers descriptive text when a message also contains a URL', () => {
    expect(
      deriveThreadTitle(
        '请总结这期访谈 https://youtu.be/hyqLNX3VExQ',
        'https://youtu.be/hyqLNX3VExQ'
      )
    ).toBe('请总结这期访谈');
  });

  it('caps long titles without splitting Unicode code points', () => {
    const title = deriveThreadTitle('产品体验优化'.repeat(12));

    expect(Array.from(title)).toHaveLength(48);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('restoreArchivedThreadIfNeeded', () => {
  it('scopes archived thread lookup and restore to the authenticated user', async () => {
    const selectSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'thread-1',
        title: 'Archived thread',
        status: 'archived',
      },
      error: null,
    });
    const selectEqUserMock = vi.fn().mockReturnValue({ single: selectSingleMock });
    const selectEqIdMock = vi.fn().mockReturnValue({
      eq: selectEqUserMock,
      single: selectSingleMock,
    });

    const updateEqUserMock = vi.fn().mockResolvedValue({ error: null });
    const updateEqIdMock = vi.fn().mockReturnValue({ eq: updateEqUserMock });
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqIdMock });

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: selectEqIdMock }),
        update: updateMock,
      }),
    };

    await restoreArchivedThreadIfNeeded({
      threadId: 'thread-1',
      userId: 'user-1',
      supabase: supabase as never,
    });

    expect(selectEqIdMock).toHaveBeenCalledWith('id', 'thread-1');
    expect(selectEqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(updateEqIdMock).toHaveBeenCalledWith('id', 'thread-1');
    expect(updateEqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
  });
});

describe('upsertChatState', () => {
  it('scopes thread lookup and update to the authenticated user', async () => {
    const selectSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'thread-1',
        status: 'active',
      },
      error: null,
    });
    const selectEqUserMock = vi.fn().mockReturnValue({ single: selectSingleMock });
    const selectEqIdMock = vi.fn().mockReturnValue({ eq: selectEqUserMock });

    const updateEqUserMock = vi.fn().mockResolvedValue({ error: null });
    const updateEqIdMock = vi.fn().mockReturnValue({ eq: updateEqUserMock });
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqIdMock });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'chat_threads') {
          return {
            select: vi.fn().mockReturnValue({ eq: selectEqIdMock }),
            update: updateMock,
          };
        }

        if (table === 'chat_messages') {
          return {
            upsert: upsertMock,
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    await upsertChatState({
      threadId: 'thread-1',
      user: { id: 'user-1' },
      supabase: supabase as never,
      messages: [
        {
          id: 'message-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        },
      ],
    });

    expect(selectEqIdMock).toHaveBeenCalledWith('id', 'thread-1');
    expect(selectEqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(updateEqIdMock).toHaveBeenCalledWith('id', 'thread-1');
    expect(updateEqUserMock).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('persists a derived title with the same thread update', async () => {
    const selectSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'thread-1',
        status: 'active',
      },
      error: null,
    });
    const selectEqUserMock = vi.fn().mockReturnValue({ single: selectSingleMock });
    const selectEqIdMock = vi.fn().mockReturnValue({ eq: selectEqUserMock });
    const updateEqUserMock = vi.fn().mockResolvedValue({ error: null });
    const updateEqIdMock = vi.fn().mockReturnValue({ eq: updateEqUserMock });
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqIdMock });
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'chat_threads') {
          return {
            select: vi.fn().mockReturnValue({ eq: selectEqIdMock }),
            update: updateMock,
          };
        }
        if (table === 'chat_messages') {
          return { upsert: upsertMock };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    await upsertChatState({
      threadId: 'thread-1',
      user: { id: 'user-1' },
      supabase: supabase as never,
      messages: [
        {
          id: 'message-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        },
      ],
      threadTitle: 'Hello',
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Hello',
        status: 'active',
      })
    );
  });
});
