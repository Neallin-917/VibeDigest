import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/threads[?taskId=xxx]
 * List the authenticated user's threads, optionally scoped to one task.
 */
export async function GET(req: NextRequest) {
    const taskId = req.nextUrl.searchParams.get('taskId');

    const supabase = await createClient();

    // Verify auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let query = supabase
        .from('chat_threads')
        .select('id, title, task_id, status, created_at, updated_at')
        .eq('user_id', user.id)

    if (taskId) {
        query = query.eq('task_id', taskId)
    }

    const { data: threads, error } = await query
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
    const body = await req.json().catch(() => null) as {
        taskId?: unknown;
        title?: unknown;
    } | null;
    const taskId = typeof body?.taskId === 'string' ? body.taskId.trim() : '';
    const title = typeof body?.title === 'string' ? body.title.trim() : '';

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
