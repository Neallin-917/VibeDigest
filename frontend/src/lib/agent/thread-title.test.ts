import { describe, expect, it } from 'vitest'
import { deriveThreadTitle } from './thread-title'

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
