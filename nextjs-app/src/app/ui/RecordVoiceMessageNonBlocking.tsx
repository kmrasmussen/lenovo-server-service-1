'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { TranscribePostDto } from '@/app/types/routeDtos';

type RecordVoiceMessageNonBlockingProps = {
  fetchDumpList: () => void;
  awaitingTranscript: (uuid: string) => void;
  startRecordingCallback: (uuid: string) => void;
  receivedTranscriptCallback: (result: TranscribePostDto, uuid: string) => void;
}

const RecordVoiceMessageNonBlocking = ({ fetchDumpList, awaitingTranscript, startRecordingCallback, receivedTranscriptCallback }: RecordVoiceMessageNonBlockingProps) => {
  const [isHeld, setIsHeld] = useState(false);
  const holdStartTime = useRef<number>(0.);
  const holdTimer = useRef<NodeJS.Timeout | null>(null);
  const currentRecordingUuid = useRef<string | null>(null);

  useEffect(() => {
    if (isHeld) {
      holdStartTime.current = Date.now();
    } else {
      if (holdTimer.current) {
        clearInterval(holdTimer.current);
        holdTimer.current = null;
      }
    }

    return () => {
      if (holdTimer.current) {
        clearInterval(holdTimer.current);
      }
    }
  }, [isHeld]);

  const sendAudioToBackend = useCallback(async (audioBlob: Blob, uuid: string) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    try {
      const response = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData
        });
      const result = await response.json();
      console.log('transcription', result); 
      receivedTranscriptCallback(result, uuid);
      fetchDumpList()
      console.log('updated i hope?');
    } catch(error) {
      console.log('error in sendaudiotobackend', error);
    }
  }, [fetchDumpList, receivedTranscriptCallback]);
  
  const stopRecording = useCallback(() => {
    console.log('stop recording');
    if (!mediaRecorderRef.current || !currentRecordingUuid.current) {
      console.log('media recorder not ready, skipping stop');
      return;
    }

    const recordingUuid = currentRecordingUuid.current;

    if (mediaRecorderRef.current) {
      console.log('there was a mediarecorderref.current');
      mediaRecorderRef.current.stop();

      mediaRecorderRef.current.onstop = async () => {
        console.log('final chunksRef.current', chunksRef.current);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        console.log('created blob', blob)
        awaitingTranscript(recordingUuid);
        await sendAudioToBackend(blob, recordingUuid);
      };
    }
  }, [sendAudioToBackend, awaitingTranscript]);



  useEffect(() => {
      if (holdTimer.current) {
        clearInterval(holdTimer.current);
      }
  }, [])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = useCallback(async () => {
    const uuid = uuidv4();
    currentRecordingUuid.current = uuid;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('got position', position);
      }
    );

    console.log('starting to record');
    startRecordingCallback(uuid);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (event) => {
      console.log('got data from mediarecorder', event.data);
      chunksRef.current.push(event.data);
    }

    mediaRecorder.start();
  }, [startRecordingCallback]);

  const handleHoldStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      setIsHeld(true);
      startRecording();

      const handleGlobalEnd = () => {
        setIsHeld(false);
        stopRecording();
        document.removeEventListener('mouseup', handleGlobalEnd);
        document.removeEventListener('touchend', handleGlobalEnd);
        document.removeEventListener('touchcancel', handleGlobalEnd);
        window.removeEventListener('blur', handleGlobalEnd);
        document.removeEventListener('visibilitychange', handleGlobalEnd);
      };

      document.addEventListener('mouseup', handleGlobalEnd);
      document.addEventListener('touchend', handleGlobalEnd);
      document.addEventListener('touchcancel', handleGlobalEnd);
      window.addEventListener('blur', handleGlobalEnd);
      document.addEventListener('visibilitychange', handleGlobalEnd);
    },
    [stopRecording, startRecording]
  );

  const getIcon = () => {
    if (isHeld) return <Square className="h4 w-4" />
    return <Mic className="h-4 w-4" />
  }

  return (<Button
    onMouseDown={handleHoldStart}
    onTouchStart={handleHoldStart}
    variant={isHeld ? 'destructive' : 'default'}
    className={`transition-all duration-200 select-none touch-none ${isHeld ? 'bg-red-500 hover:bg-red-600 animate-pulse' : '' }`}>
    {getIcon()}
  </Button>
  )
};

export default RecordVoiceMessageNonBlocking;
