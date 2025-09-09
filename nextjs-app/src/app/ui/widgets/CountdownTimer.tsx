import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, Square, X, Timer } from 'lucide-react';

type TimerState = {
  timeLeft: number;
  isRunning: boolean;
  isFinished: boolean;
  duration: number;
}

type CountdownTimerProps = {
  duration?: number;
  label?: string;
  onRemove?: () => void;
  widgetId?: number;
  timerState?: TimerState;
  updateTimerState?: (id: number, updates: Partial<TimerState>) => void;
  registerWidget?: (id: number, commands: Record<string, () => void>) => void;
  unregisterWidget?: (id: number) => void;
};

const CountdownTimer = ({ 
  duration = 60, 
  label = 'Timer',
  onRemove,
  widgetId,
  timerState,
  updateTimerState,
  registerWidget,
  unregisterWidget
}: CountdownTimerProps) => {
  // Use external state if provided, otherwise fall back to internal state
  const [internalTimeLeft, setInternalTimeLeft] = useState(duration);
  const [internalIsRunning, setInternalIsRunning] = useState(false);
  const [internalIsFinished, setInternalIsFinished] = useState(false);
  
  const timeLeft = timerState?.timeLeft ?? internalTimeLeft;
  const isRunning = timerState?.isRunning ?? internalIsRunning;
  const isFinished = timerState?.isFinished ?? internalIsFinished;
  const timerDuration = timerState?.duration ?? duration;
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update state function that works with both internal and external state
  const updateState = useCallback((updates: Partial<TimerState>) => {
    if (widgetId && updateTimerState && timerState) {
      updateTimerState(widgetId, updates);
    } else {
      if (updates.timeLeft !== undefined) setInternalTimeLeft(updates.timeLeft);
      if (updates.isRunning !== undefined) setInternalIsRunning(updates.isRunning);
      if (updates.isFinished !== undefined) setInternalIsFinished(updates.isFinished);
    }
  }, [timerState, updateTimerState, widgetId]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Register widget commands when component mounts
  useEffect(() => {
    if (widgetId && registerWidget) {
      const commands = {
        stop: () => {
          updateState({ isRunning: false, timeLeft: timerDuration, isFinished: false });
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        },
        pause: () => {
          updateState({ isRunning: false });
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        },
        start: () => {
          if (timeLeft > 0 && !isFinished) {
            updateState({ isRunning: true });
          }
        },
        reset: () => {
          updateState({ 
            isRunning: false, 
            timeLeft: timerDuration, 
            isFinished: false 
          });
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      };
      
      registerWidget(widgetId, commands);
    }

    return () => {
      if (widgetId && unregisterWidget) {
        unregisterWidget(widgetId);
      }
    };
  }, [widgetId, updateState, registerWidget, unregisterWidget, timeLeft, isFinished, timerDuration]);

  // Timer logic
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        const newTimeLeft = timeLeft - 1;
        if (newTimeLeft <= 0) {
          updateState({
            timeLeft: 0,
            isRunning: false,
            isFinished: true
          });
        } else {
          updateState({ timeLeft: newTimeLeft });
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timeLeft, updateState]);

  const handleStart = () => {
    if (timeLeft > 0 && !isFinished) {
      updateState({ isRunning: true });
    }
  };

  const handlePause = () => {
    updateState({ isRunning: false });
  };

  const handleStop = () => {
    updateState({
      isRunning: false,
      timeLeft: timerDuration,
      isFinished: false
    });
  };

  const getCardClassName = () => {
    if (isFinished) return "border-green-500 bg-green-50";
    if (isRunning) return "border-blue-500 bg-blue-50";
    return "border-gray-200";
  };

  const getTimeClassName = () => {
    if (isFinished) return "text-green-600";
    if (timeLeft <= 10 && isRunning) return "text-red-600 font-bold";
    if (isRunning) return "text-blue-600";
    return "text-gray-900";
  };

  return (
    <Card className={`w-64 ${getCardClassName()}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4" />
            <span className="font-medium text-sm">{label}</span>
          </div>
          <div className="flex items-center gap-2">
            {isFinished && <Badge variant="secondary" className="bg-green-100 text-green-800">Finished!</Badge>}
            {isRunning && <Badge variant="secondary" className="bg-blue-100 text-blue-800">Running</Badge>}
            {onRemove && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onRemove}
                className="h-6 w-6 p-0"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="text-center pb-3">
        <div className={`text-3xl font-mono ${getTimeClassName()}`}>
          {formatTime(timeLeft)}
        </div>
        {widgetId && (
          <div className="text-xs text-gray-500 mt-1">
            ID: {widgetId}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="pt-0">
        <div className="flex gap-2 w-full">
          {!isRunning ? (
            <Button 
              onClick={handleStart} 
              disabled={timeLeft === 0 || isFinished}
              size="sm"
              className="flex-1"
            >
              <Play className="w-3 h-3 mr-1" />
              Start
            </Button>
          ) : (
            <Button 
              onClick={handlePause} 
              variant="outline"
              size="sm"
              className="flex-1"
            >
              <Pause className="w-3 h-3 mr-1" />
              Pause
            </Button>
          )}
          
          <Button 
            onClick={handleStop} 
            variant="outline"
            size="sm"
            className="flex-1"
          >
            <Square className="w-3 h-3 mr-1" />
            Reset
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default CountdownTimer;
