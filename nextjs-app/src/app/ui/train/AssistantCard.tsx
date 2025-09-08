'use client';
import RecordVoiceMessage from '@/app/ui/RecordVoiceMessage';
const AssistantCard = () => {
  const recordVoiceMessageResponseHandler = () => {
    console.log('assistantcard recordvoicemessageresponsehandler reached');
  }
  return (
          <div className="bg-gradient-to-br from-purple-50 to-violet-100 border border-purple-200 rounded-lg shadow-sm overflow-hidden">
            <div className="bg-purple-600 text-white px-4 py-3">
              <span className="font-semibold text-sm">trAIn Assistant</span>
            </div>
            
            <div className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-purple-600 rounded-full p-2">
                  <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
                    <span className="text-purple-600 text-xs font-bold">AI</span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-gray-800 font-medium">
                  there will be a message from the assitant here
                  <RecordVoiceMessage fetchDumpList={recordVoiceMessageResponseHandler} />
                  </p>
                </div>
              </div>
            </div>
          </div>
  );
}

export default AssistantCard;
