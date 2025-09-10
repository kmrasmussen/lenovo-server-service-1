// app/ui/DumpListItem.tsx
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Bot, Clock, Play } from 'lucide-react';
import { ToolCall } from '@/app/types/chatCompletions';
import { DisplayMessage } from '@/app/types/frontendTypes';

type DumpListItemProps = {
  item: DisplayMessage,
  handleToolRequest: (toolRequest: ToolCall) => void,
}

const DumpListItem = ({ item, handleToolRequest }: DumpListItemProps) => {
  const isUser = item.role == 'user';

  return (<li>
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback>
              {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </AvatarFallback>
          </Avatar>
          <Badge>{item.role}</Badge>
          <Clock className="h-3 w-3 text-gray-400" />
          <span className="text-xs text-gray-500">2.30 PM</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-m">{item.content}</p>
        {item.tool_calls && (
          <div className="mt-3">
            <ul className="space-y-2">
              {item.tool_calls.map((toolRequest: ToolCall) => {
                // Get the entire ToolResponseMessage object for this specific tool call.
                const toolResponse = item.associatedToolResponses?.[toolRequest.id];
                const isExecuted = !!toolResponse;

                return (
                  <li key={toolRequest.id} className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{toolRequest.function.name}</span>
                      <Badge variant={isExecuted ? "default" : "secondary"}>
                        {isExecuted ? "Executed" : "Pending"}
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-600 mb-2">{toolRequest.function.arguments}</div>

                    {isExecuted ? (
                      <div className="border-l-2 border-blue-200 pl-3 mt-2">
                        <div className="text-sm bg-white p-2 rounded border">
                          {/* Display the content from the response object */}
                          {toolResponse.content}
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToolRequest(toolRequest)}
                        className="mt-2"
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Execute
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  </li>);
}

export default DumpListItem;
