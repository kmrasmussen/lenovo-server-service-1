import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, Square, X, Timer } from 'lucide-react';

type CountdownTimerProps = {
  duration?: number;
  label?: string;
  onRemove?: () => void;
  widgetId?: number;
  registerWidget?: (id: number, commands: Record<string, () => void>) => void;
  unregisterWidget?: (id: number) => void;
};

const CountdownTimer = ({ 
  duration = 60, 
  label = 'Timer',
  onRemove,
  widgetId,
  registerWidget,
  unregisterWidget
}: CountdownTimerProps) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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
          setIsRunning(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        },
        pause: () => {
          setIsRunning(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        },
        start: () => {
          if (timeLeft > 0 && !isFinished) {
            setIsRunning(true);
          }
        },
        reset: () => {
          setIsRunning(false);
          setTimeLeft(duration);
          setIsFinished(false);
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
  }, [widgetId, registerWidget, unregisterWidget, timeLeft, isFinished, duration]);

  // Timer logic
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsRunning(false);
            setIsFinished(true);
            return 0;
          }
          return prev - 1;
        });
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
  }, [isRunning, timeLeft]);

  const handleStart = () => {
    if (timeLeft > 0 && !isFinished) {
      setIsRunning(true);
    }
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleStop = () => {
    setIsRunning(false);
    setTimeLeft(duration);
    setIsFinished(false);
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
