import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { data: threads, error } = await supabase
            .from('chat_threads')
            .select('*')
            .eq('user_id', user.id)
            .neq('status', 'deleted')
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Error fetching threads:', error);
            return NextResponse.json({ error: 'Failed to fetch threads' }, { status: 500 });
        }

        return NextResponse.json(threads);
    } catch (error) {
        console.error('Unexpected error fetching threads:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
