export const threadKeys = {
    all: ['threads'] as const,
    payload: (id: string) => ['thread-payload', id] as const,
}
