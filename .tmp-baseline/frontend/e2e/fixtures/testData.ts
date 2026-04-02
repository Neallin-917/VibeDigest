/**
 * Test Data Factory for E2E tests.
 * Centralizes mock data creation to ensure consistency and type safety.
 */

export interface Task {
  id: string;
  user_id: string;
  video_url: string;
  video_title: string;
  thumbnail_url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  created_at: string;
  updated_at?: string;
}

/**
 * Creates a mock task object.
 * @param overrides - Optional properties to override default values.
 * @returns A Task object.
 */
export const createMockTask = (overrides?: Partial<Task>): Task => {
  return {
    id: 'mock-task-123',
    user_id: 'test-user-id',
    video_url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
    video_title: 'Never Gonna Give You Up',
    thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    status: 'processing',
    progress: 45,
    created_at: new Date().toISOString(),
    ...overrides
  };
};

/**
 * Creates a mock user object (Supabase auth format).
 * @param overrides - Optional properties to override.
 * @returns A User object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createMockUser = (overrides?: any) => {
  return {
    id: 'test-user-id',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'tester@vibedigest.io',
    user_metadata: { full_name: 'Test User' },
    ...overrides
  };
};

/**
 * Creates a mock task output object.
 * @param kind - The type of output (summary, script, etc.)
 * @param content - The content (string or object)
 * @param overrides - Optional overrides
 * @returns A TaskOutput object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createMockTaskOutput = (kind: 'summary' | 'script' | 'blog' | 'tweets', content: any, overrides?: any) => {
    return {
        kind,
        content: typeof content === 'string' ? content : JSON.stringify(content),
        status: 'completed',
        created_at: new Date().toISOString(),
        ...overrides
    }
}
