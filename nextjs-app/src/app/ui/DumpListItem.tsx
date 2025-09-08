import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Bot, Clock, Play } from 'lucide-react';
import { Message, ToolRequest } from '@/app/types/chatCompletions';

type DumpListItemProps = {
  item: Message,
  handleToolRequest: (toolRequest: ToolRequest) => void, 
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
         {item.toolRequests.length > 0 && (
           <div className="mt-3">
             <ul className="space-y-2">
               {item.toolRequests.map((toolRequest, index) => (
                 <li key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                   <span className="text-sm">{toolRequest.name}: {toolRequest.args}</span>
                   <Button 
                     size="sm" 
                     variant="outline"
                     onClick={() => handleToolRequest(toolRequest)}
                   >
                     <Play className="w-3 h-3 mr-1" />
                     Execute
                   </Button>
                 </li>
               ))}
             </ul>
           </div>
         )}
        </CardContent>
      </Card>
    </li>);
}

export default DumpListItem;
