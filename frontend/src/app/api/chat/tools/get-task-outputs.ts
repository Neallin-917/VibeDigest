import { z } from 'zod';
import { tool } from 'ai';
import { getTaskOutputsToolContextSchema } from './context';

export const taskOutputsSchema = z.object({
    taskId: z.string().describe('The ID of the task'),
    kinds: z
        .array(z.enum(['script', 'summary', 'audio']))
        .optional()
        .describe('Specific output kinds to retrieve. If not provided, returns all completed outputs.'),
});

export const getTaskOutputsTool = tool({
    description: 'Get the processed content (transcript, summary) for a specific task',
    inputSchema: taskOutputsSchema,
    contextSchema: getTaskOutputsToolContextSchema,
    execute: async ({ taskId, kinds }: z.infer<typeof taskOutputsSchema>, { context }) => {
            const { supabase, user } = context;
            const { data: task, error: taskError } = await supabase
                .from('tasks')
                .select('user_id, is_demo')
                .eq('id', taskId)
                .single();

            if (taskError || !task) {
                return { error: 'Task not found', taskId };
            }
            if (task.user_id !== user?.id && !task.is_demo) {
                return { error: 'Access denied', taskId };
            }

            let query = supabase
                .from('task_outputs')
                .select('*')
                .eq('task_id', taskId)
                .eq('status', 'completed');

            if (kinds && kinds.length > 0) {
                query = query.in('kind', kinds);
            }

            const { data, error } = await query;
            if (error) {
                return { error: 'Failed to fetch outputs', taskId, details: error.message };
            }
            return {
                taskId,
                outputs: data || [],
                count: data?.length || 0,
            };
    },
});
