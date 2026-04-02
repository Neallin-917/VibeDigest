import { createClient } from '@/lib/supabase/server';
import { env } from '@/env';

export type AuthResult = {
    supabase: Awaited<ReturnType<typeof createClient>>;
    user: { id: string; email?: string };
    accessToken: string | undefined;
};

export type AuthError = {
    response: Response;
};

/**
 * Verify authentication via Supabase.
 * Supports E2E mock bypass when NEXT_PUBLIC_E2E_MOCK is set.
 */
export async function verifyAuth(): Promise<AuthResult | AuthError> {
    const supabase = await createClient();

    if (env.NEXT_PUBLIC_E2E_MOCK === '1') {
        return {
            supabase,
            user: { id: 'test-user-id', email: 'tester@vibedigest.io' },
            accessToken: 'mock-access-token',
        };
    }

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
        console.error('[API/Chat] Auth Error:', authError);
        return {
            response: new Response(
                JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            ),
        };
    }

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
        console.error(
            '[API/Chat] Auth: user verified but session has no access_token. ' +
            'This typically means the session cookie is stale. ' +
            'Ensure proxy.ts calls updateSession() for /api/* routes.'
        );
        return {
            response: new Response(
                JSON.stringify({
                    error: 'Session expired',
                    details: 'Your session cookie is stale. Please refresh the page and try again.',
                }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            ),
        };
    }

    return {
        supabase,
        user: authUser,
        accessToken,
    };
}

export function isAuthError(result: AuthResult | AuthError): result is AuthError {
    return 'response' in result;
}
