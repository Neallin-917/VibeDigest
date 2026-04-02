
import { createClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";

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

function generateSlug(title: string): string {
    if (!title) return "video";
    // Replace spaces with - and remove special chars (keep unicode)
    // Or just simple encoding
    return encodeURIComponent(title.trim().replace(/\s+/g, '-'));
}

export default async function TaskRedirectPage(props: Props) {
    const params = await props.params;
    const { id, lang } = params;
    const task = await getTask(id);

    if (!task) {
        notFound()
    }

    const slug = generateSlug(task.video_title || "video");
    redirect(`/${lang}/tasks/${id}/${slug}`);
}
