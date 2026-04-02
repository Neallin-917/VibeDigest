import type { ToolContext } from '../types';
import { createGetTaskStatusTool } from './get-task-status';
import { createGetTaskOutputsTool } from './get-task-outputs';
import { createCreateTaskTool } from './create-task';
import { createPreviewVideoTool } from './preview-video';

export { taskStatusSchema } from './get-task-status';
export { taskOutputsSchema } from './get-task-outputs';
export { createTaskSchema } from './create-task';
export { previewVideoSchema } from './preview-video';

export type ChatToolSet = {
    get_task_status: ReturnType<typeof createGetTaskStatusTool>;
    get_task_outputs: ReturnType<typeof createGetTaskOutputsTool>;
    create_task: ReturnType<typeof createCreateTaskTool>;
    preview_video: ReturnType<typeof createPreviewVideoTool>;
};

export function buildAllTools(ctx: ToolContext): ChatToolSet {
    return {
        get_task_status: createGetTaskStatusTool(ctx),
        get_task_outputs: createGetTaskOutputsTool(ctx),
        create_task: createCreateTaskTool(ctx),
        preview_video: createPreviewVideoTool(ctx),
    };
}

/**
 * Build the tools object for streamText based on whether video tools are allowed.
 */
export function buildTools(
    allTools: ChatToolSet,
    allowVideoTools: boolean
): Pick<ChatToolSet, 'get_task_status' | 'get_task_outputs'> | ChatToolSet {
    if (allowVideoTools) {
        return allTools;
    }

    const { get_task_status, get_task_outputs } = allTools;
    return { get_task_status, get_task_outputs };
}
