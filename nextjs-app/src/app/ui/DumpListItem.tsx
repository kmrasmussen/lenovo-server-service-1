import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { User, Bot, Clock } from 'lucide-react';
import { Message } from '@/app/types/chatCompletions';

type DumpListItemProps = {
  item: Message
}

const DumpListItem = ({ item }: DumpListItemProps) => {
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
      </CardContent>
    </Card>
  </li>);
}

export default DumpListItem;
