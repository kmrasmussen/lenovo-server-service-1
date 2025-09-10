// app/ui/widgets/CountdownTimer.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Timer } from 'lucide-react';

type CountdownTimerProps = {
  id: string;
  label: string;
  startTime: Date;
  durationSeconds: number;
};

const CountdownTimer = ({
  id,
  label,
  startTime,
  durationSeconds,
}: CountdownTimerProps) => {

  // THIS IS THE CORE FIX:
  // We use a lazy initializer function for useState. This function runs only ONCE
  // on the initial render to calculate the CORRECT starting value for timeLeft,
  // preventing the buggy initial state of (duration -> 0).
  const getInitialTimeLeft = () => {
    const elapsedMs = Date.now() - startTime.getTime();
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    return Math.max(0, durationSeconds - elapsedSeconds);
  };

  const [timeLeft, setTimeLeft] = useState(getInitialTimeLeft);
  const prevTimeLeft = useRef(timeLeft); // Initialize ref with the correct starting time
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // This effect now correctly handles the interval, starting it only if necessary.
  useEffect(() => {
    // Only set up an interval if the timer is still running.
    if (timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        // We can reuse the initializer function to keep the timer synced.
        setTimeLeft(getInitialTimeLeft());
      }, 1000);
    }

    // Cleanup interval on unmount or when props change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [id, startTime, durationSeconds, timeLeft]); // timeLeft is added to dependency array

  // This effect now correctly detects the transition from running to finished.
  useEffect(() => {
    // Because the initial state is now correct, this condition will only be true
    // when the timer ticks from 1 to 0 in real-time.
    if (prevTimeLeft.current > 0 && timeLeft <= 0) {
      const audio = new Audio('/sounds/bell1.wav');
      audio.play().catch(error => {
        console.log("Timer sound playback was prevented by browser policy:", error);
      });
    }
    // Update the ref to the current value for the next render cycle.
    prevTimeLeft.current = timeLeft;
  }, [timeLeft]);

  const isFinished = timeLeft <= 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getCardClassName = () => {
    if (isFinished) return "border-green-500 bg-green-50";
    return "border-blue-500 bg-blue-50";
  };

  return (
    <Card className={`w-64 ${getCardClassName()}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4" />
            <span className="font-medium text-sm">{label}</span>
          </div>
          {isFinished ? (
            <Badge variant="secondary" className="bg-green-100 text-green-800">Finished!</Badge>
          ) : (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">Running</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="text-center pb-3">
        <div className={`text-5xl font-mono ${isFinished && 'text-green-600'}`}>
          {formatTime(timeLeft)}
        </div>
        <div className="text-xs text-gray-400 mt-1">ID: {id.substring(0, 8)}...</div>
      </CardContent>
    </Card>
  );
};

export default CountdownTimer;
