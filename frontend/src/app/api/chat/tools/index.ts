import { getTaskStatusTool } from './get-task-status';
import { getTaskOutputsTool } from './get-task-outputs';
export { createChatToolsContext, type ChatToolsContext } from './context';

export { taskStatusSchema } from './get-task-status';
export { taskOutputsSchema } from './get-task-outputs';

export const chatTools = {
    get_task_status: getTaskStatusTool,
    get_task_outputs: getTaskOutputsTool,
};

export type ChatToolSet = typeof chatTools;

export const ACTIVE_CHAT_TOOLS: Array<keyof ChatToolSet> = [
    'get_task_status',
    'get_task_outputs',
];
