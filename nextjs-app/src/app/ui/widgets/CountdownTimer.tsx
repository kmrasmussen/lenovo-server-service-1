// app/ui/widgets/CountdownTimer.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Timer } from 'lucide-react';

// THIS IS THE KEY FIX: Add 'onFinish' to the type definition.
type CountdownTimerProps = {
  id: string;
  label: string;
  startTime: Date;
  durationSeconds: number;
  onFinish?: () => void; // A timer can optionally have a finish callback
};

const CountdownTimer = ({
  id,
  label,
  startTime,
  durationSeconds,
  onFinish, // The function to call when the timer completes
}: CountdownTimerProps) => {

  const getInitialTimeLeft = useCallback(() => {
    const elapsedMs = Date.now() - startTime.getTime();
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    return Math.max(0, durationSeconds - elapsedSeconds);
  }, [durationSeconds, startTime]);

  const [timeLeft, setTimeLeft] = useState(getInitialTimeLeft);
  const prevTimeLeft = useRef(timeLeft);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(getInitialTimeLeft());
      }, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [id, startTime, durationSeconds, timeLeft, getInitialTimeLeft]);

  // This effect now correctly calls the onFinish callback.
  useEffect(() => {
    if (prevTimeLeft.current > 0 && timeLeft <= 0) {
      // If the onFinish prop was provided, call it.
      if (onFinish) {
        onFinish();
      }
    }
    prevTimeLeft.current = timeLeft;
  }, [timeLeft, onFinish]);

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
