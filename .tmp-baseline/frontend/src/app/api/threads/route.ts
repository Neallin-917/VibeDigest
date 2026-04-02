import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/threads?taskId=xxx
 * List all threads for a given task (excluding deleted)
 */
export async function GET(req: NextRequest) {
    const taskId = req.nextUrl.searchParams.get('taskId');

    if (!taskId) {
        return NextResponse.json({ error: 'Missing taskId parameter' }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch threads
    const { data: threads, error } = await supabase
        .from('chat_threads')
        .select('id, title, status, created_at, updated_at')
        .eq('task_id', taskId)
        .eq('user_id', user.id)
        .neq('status', 'deleted')
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('[API /threads GET] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch threads' }, { status: 500 });
    }

    return NextResponse.json(threads);
}

/**
 * POST /api/threads
 * Create a new thread for a task
 */
export async function POST(req: NextRequest) {
    const body = await req.json();
    const { taskId, title } = body as { taskId: string; title?: string };

    if (!taskId) {
        return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create thread
    const { data: thread, error } = await supabase
        .from('chat_threads')
        .insert({
            task_id: taskId,
            user_id: user.id,
            title: title || 'New Chat',
        })
        .select()
        .single();

    if (error) {
        console.error('[API /threads POST] Error:', error);
        return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 });
    }

    return NextResponse.json(thread, { status: 201 });
}
