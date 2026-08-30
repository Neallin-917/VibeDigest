
import { createClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { buildTaskSlug } from "@/lib/task-path";

// Only need ID for this redirect page
type Props = {
    params: Promise<{
        lang: string;
        id: string;
    }>
}

async function getTask(id: string) {
    const supabase = await createClient()
    const { data: task } = await supabase
        .from('tasks')
        .select('video_title')
        .eq('id', id)
        .single()
    return task
}

export default async function TaskRedirectPage(props: Props) {
    const params = await props.params;
    const { id, lang } = params;
    const task = await getTask(id);

    if (!task) {
        notFound()
    }

    const slug = buildTaskSlug(task.video_title);
    redirect(`/${lang}/tasks/${id}/${slug}`);
}
