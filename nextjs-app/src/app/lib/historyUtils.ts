// in app/lib/historyUtils.ts (or a similar utility file)

import { Message, ToolResponseMessage } from "@/app/types/chatCompletions";

/**
 * Filters out orphaned, un-executed tool calls that are duplicates of an executed intent.
 * This cleans up the history when multiple identical tool calls were generated but only one was executed.
 * @param messages The raw array of messages from the database.
 * @returns A new array of messages with orphaned tool calls removed.
 */
export const filterOrphanedToolCalls = (messages: Message[]): Message[] => {
    // First, find all "intents" (function name + arguments) that have been successfully executed.
    const executedCallIntents = new Set<string>();
    
    // Create a map of all tool responses for quick lookup.
    const toolResponseMap = new Map<string, ToolResponseMessage>();
    messages.forEach(msg => {
        if (msg.role === 'tool') {
            // After this check, we can safely cast the message to its specific type
            const toolMessage = msg as ToolResponseMessage;
            toolResponseMap.set(toolMessage.tool_call_id, toolMessage);
        }
    });

    messages.forEach(msg => {
        if (msg.role === 'assistant' && msg.tool_calls) {
            msg.tool_calls.forEach(call => {
                if (toolResponseMap.has(call.id)) {
                    const intentKey = `${call.function.name}:${call.function.arguments}`;
                    executedCallIntents.add(intentKey);
                }
            });
        }
    });

    // Now, map over the messages and filter the tool_calls array within each one.
    return messages.map(message => {
        if (message.role !== 'assistant' || !message.tool_calls) {
            return message;
        }

        const filteredToolCalls = message.tool_calls.filter(call => {
            // Keep the call if it was directly executed.
            if (toolResponseMap.has(call.id)) {
                return true;
            }
            // Keep the call if it's pending AND its intent has NOT been fulfilled by another call.
            const intentKey = `${call.function.name}:${call.function.arguments}`;
            return !executedCallIntents.has(intentKey);
        });

        // Return a new message object with the cleaned-up tool_calls.
        return {
            ...message,
            tool_calls: filteredToolCalls.length > 0 ? filteredToolCalls : null,
        };
    });
};
