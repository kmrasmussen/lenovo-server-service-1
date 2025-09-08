'use client';

import DumpListItem from '@/app/ui/DumpListItem';
import { Message, ToolRequest } from '@/app/types/chatCompletions';

type DumpListProps = {
  dumpList: Message[],
  handleToolRequest: (toolRequest: ToolRequest) => void,
}
const DumpList = (props: DumpListProps) => {
  return (
	<ul className="space-y-2 p-0">
	  {
	    props?.dumpList?.map((item, idx) => (<DumpListItem
        handleToolRequest={props.handleToolRequest} key={idx} item={item} />)) 
	  }
	</ul>
  );
}

export default DumpList;
