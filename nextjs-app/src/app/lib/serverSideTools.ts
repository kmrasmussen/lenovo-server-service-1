export const start_timerTool = (args: string): string => {
  try {
    const args_parsed = JSON.parse(args);
    const minutes = args_parsed.minutes || 0;
    const seconds = args_parsed.seconds || 0;
    return `Successfully started a ${minutes} minute and ${seconds} second timer for ${args_parsed.label || 'general purpose'}`;
  } catch (e) {
    console.error("Error parsing start_timer arguments:", e);
    return "Error starting timer: invalid arguments.";
  }
};

export const tools = {
    'start_timer': start_timerTool,
};
