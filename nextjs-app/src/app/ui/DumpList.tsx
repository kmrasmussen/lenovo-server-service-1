'use client';

import DumpListItem from '@/app/ui/DumpListItem';
import { Message } from '@/app/types/chatCompletions';

type DumpListProps = {
  dumpList: Message[];
}
const DumpList = (props: DumpListProps) => {
  return (
	<ul className="space-y-2 p-0">
	  {
	    props?.dumpList?.map((item, idx) => (<DumpListItem key={idx} item={item} />)) 
	  }
	</ul>
  );
}

export default DumpList;
