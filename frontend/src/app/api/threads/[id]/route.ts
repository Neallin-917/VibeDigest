import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
    params: Promise<{ id: string }>;
}

type MutableThreadStatus = 'active' | 'archived';

function isMutableThreadStatus(value: unknown): value is MutableThreadStatus {
    return value === 'active' || value === 'archived';
}

/**
 * GET /api/threads/[id]
 * Fetch a single thread by ID (includes task_id for association restoration)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    const { id: threadId } = await params;

    const supabase = await createClient();

    // Verify auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch thread with ownership check
    const { data: thread, error } = await supabase
        .from('chat_threads')
        .select('id, title, task_id, status, created_at, updated_at')
        .eq('id', threadId)
        .eq('user_id', user.id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
        }
        console.error('[API /threads/[id] GET] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch thread' }, { status: 500 });
    }

    if (!thread) {
        return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    return NextResponse.json(thread);
}

/**
 * PATCH /api/threads/[id]
 * Update a thread status between active and archived
 */
export async function PATCH(req: Request, { params }: RouteParams) {
    const { id: threadId } = await params;
    const body = await req.json().catch(() => null) as { status?: unknown } | null;
    const nextStatus = body?.status;

    if (!isMutableThreadStatus(nextStatus)) {
        return NextResponse.json({ error: 'Invalid thread status' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: thread, error } = await supabase
        .from('chat_threads')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', threadId)
        .eq('user_id', user.id)
        .select('id, title, task_id, status, created_at, updated_at')
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
        }
        console.error('[API /threads/[id] PATCH] Error:', error);
        return NextResponse.json({ error: 'Failed to update thread' }, { status: 500 });
    }

    return NextResponse.json(thread);
}

/**
 * DELETE /api/threads/[id]
 * Soft delete a thread
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    const { id: threadId } = await params;

    const supabase = await createClient();

    // Verify auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify thread ownership and soft delete
    const { error } = await supabase
        .from('chat_threads')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('id', threadId)
        .eq('user_id', user.id);

    if (error) {
        console.error('[API /threads/[id] DELETE] Error:', error);
        return NextResponse.json({ error: 'Failed to delete thread' }, { status: 500 });
    }

    return new NextResponse(null, { status: 200 });
}
