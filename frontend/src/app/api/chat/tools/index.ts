import { getTaskStatusTool } from './get-task-status';
import { getTaskOutputsTool } from './get-task-outputs';
import { createTaskTool } from './create-task';
import { previewVideoTool } from './preview-video';
export { createChatToolsContext, type ChatToolsContext } from './context';

export { taskStatusSchema } from './get-task-status';
export { taskOutputsSchema } from './get-task-outputs';
export { createTaskSchema } from './create-task';
export { previewVideoSchema } from './preview-video';

export const chatTools = {
    get_task_status: getTaskStatusTool,
    get_task_outputs: getTaskOutputsTool,
    create_task: createTaskTool,
    preview_video: previewVideoTool,
};

export type ChatToolSet = typeof chatTools;

/**
 * Restrict video side-effect tools unless the latest user message includes a URL.
 */
export function getActiveChatTools(allowVideoTools: boolean): Array<keyof ChatToolSet> {
    return allowVideoTools
        ? ['get_task_status', 'get_task_outputs', 'create_task', 'preview_video']
        : ['get_task_status', 'get_task_outputs'];
}
