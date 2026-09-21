
import { createClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { buildTaskPath } from "@/lib/task-path";
import { buildTaskReturnSuffix, type TaskReturnState } from "@/lib/task-navigation";
import { isLocale } from "@/lib/i18n";

// Only need ID for this redirect page
type Props = {
    params: Promise<{
        lang: string;
        id: string;
    }>
    searchParams: Promise<TaskReturnState>
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

    const returnState = await props.searchParams;
    const locale = isLocale(lang) ? lang : "en";
    redirect(`/${lang}${buildTaskPath({ ...task, id })}${buildTaskReturnSuffix(returnState, locale)}`);
}
