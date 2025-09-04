'use client';
import React, { useState } from 'react';
import { Dumbbell, Clock, Target, CheckCircle, X, Plus, Minus, Play } from 'lucide-react';

const WorkoutCommitmentQuestionCard = () => {
  const [isCommitted, setIsCommitted] = useState(false);
  const [weight, setWeight] = useState(5);
  const [setStarted, setSetStarted] = useState(false);
  const [isResting, setIsResting] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [completedSets, setCompletedSets] = useState(0);
  const [restTimeLeft, setRestTimeLeft] = useState(120);
  const [repsCompleted, setRepsCompleted] = useState(5);

  const handleCommit = () => {
    setIsCommitted(true);
  };

  const handleDecline = () => {
    console.log('User declined commitment');
  };

  const increaseWeight = () => {
    setWeight(prev => prev + 2.5);
  };

  const decreaseWeight = () => {
    setWeight(prev => Math.max(2.5, prev - 2.5));
  };

  const increaseReps = () => {
    setRepsCompleted(prev => prev + 1);
  };

  const decreaseReps = () => {
    setRepsCompleted(prev => Math.max(0, prev - 1));
  };

  const handleStartSet = () => {
    setSetStarted(true);
    setIsFailed(false);
  };

  const handleSetComplete = () => {
    setCompletedSets(prev => prev + 1);
    setIsResting(true);
    setRestTimeLeft(120);
    
    const timer = setInterval(() => {
      setRestTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsResting(false);
          return 120;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const addRestTime = () => {
    setRestTimeLeft(prev => prev + 60);
  };

  const subtractRestTime = () => {
    setRestTimeLeft(prev => Math.max(0, prev - 60));
  };

  const handleSetFailed = () => {
    setIsFailed(true);
  };

  const confirmFailedSet = () => {
    setCompletedSets(prev => prev + 1);
    setIsResting(true);
    setIsFailed(false);
    setRestTimeLeft(120);
    setRepsCompleted(5); // Reset for next set
    
    const timer = setInterval(() => {
      setRestTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsResting(false);
          return 120;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isCommitted) {
    if (setStarted) {
      return (
        <div className="max-w-md mx-auto space-y-4">
          {/* Commitment Confirmation Card */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200 rounded-lg shadow-sm overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Dumbbell className="w-5 h-5" />
                  <span className="font-semibold text-sm">Workout In Progress</span>
                </div>
                <div className="flex items-center gap-1 text-blue-100">
                  <Clock className="w-3 h-3" />
                  <span className="text-xs">2:30 PM</span>
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-blue-600 rounded-full p-2">
                  <Target className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Barbell Curls</h3>
                  <p className="text-blue-600 font-semibold">5 Sets Committed</p>
                </div>
              </div>

              {/* Set Progress Boxes */}
              <div className="flex gap-2 mb-3">
                {[1, 2, 3, 4, 5].map((setNum) => (
                  <div 
                    key={setNum}
                    className={`flex-1 h-8 rounded border-2 flex items-center justify-center text-sm font-medium ${
                      setNum <= completedSets 
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : 'bg-white text-gray-400 border-gray-300'
                    }`}
                  >
                    {setNum <= completedSets ? `${weight} kg` : setNum}
                  </div>
                ))}
              </div>

              <div className="mt-3 text-center">
                <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  Let us crush this workout!
                </span>
              </div>
            </div>
          </div>

          {/* Current Set/Rest Card */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200 rounded-lg shadow-sm overflow-hidden">
            <div className="bg-green-600 text-white px-4 py-3">
              <span className="font-semibold text-sm">
                {isResting ? `${completedSets === 1 ? 'First' : 'Second'} Rest` : `${completedSets === 0 ? 'First' : 'Second'} Set`}
              </span>
            </div>
            
            <div className="p-4">
              {isResting ? (
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-800 mb-4">
                    Rest Time
                  </p>
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <button 
                      onClick={subtractRestTime}
                      className="bg-gray-200 hover:bg-gray-300 rounded-full p-2 transition-colors"
                    >
                      <Minus className="w-4 h-4 text-gray-600" />
                    </button>
                    <p className="text-3xl font-bold text-green-600">
                      {formatTime(restTimeLeft)}
                    </p>
                    <button 
                      onClick={addRestTime}
                      className="bg-gray-200 hover:bg-gray-300 rounded-full p-2 transition-colors"
                    >
                      <Plus className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-600">
                    Take your time to recover
                  </p>
                </div>
              ) : isFailed ? (
                <>
                  <div className="text-center mb-4">
                    <p className="text-lg font-semibold text-gray-800 mb-2">
                      How many reps did you complete?
                    </p>
                    <p className="text-sm text-gray-600">
                      with {weight} kg
                    </p>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <span className="font-medium text-gray-700">Reps completed:</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={decreaseReps}
                        className="bg-gray-200 hover:bg-gray-300 rounded-full p-1 transition-colors"
                      >
                        <Minus className="w-4 h-4 text-gray-600" />
                      </button>
                      <span className="font-bold text-xl text-gray-800 min-w-12 text-center">
                        {repsCompleted}
                      </span>
                      <button 
                        onClick={increaseReps}
                        className="bg-gray-200 hover:bg-gray-300 rounded-full p-1 transition-colors"
                      >
                        <Plus className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={confirmFailedSet}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Confirm Reps
                  </button>
                </>
              ) : (
                <>
                  <div className="text-center mb-4">
                    <p className="text-lg font-semibold text-gray-800 mb-2">
                      Do 10 clean reps
                    </p>
                    <p className="text-sm text-gray-600">
                      with {weight} kg
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button 
                      onClick={handleSetComplete}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Done!
                    </button>
                    <button 
                      onClick={handleSetFailed}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Failed Early
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* AI Assistant Recommendation */}
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
                    {isResting 
                      ? "Well done, we take breaks between sets. Try to just relax."
                      : isFailed
                      ? "No worries! Even incomplete sets help build strength. Just track what you completed."
                      : "When doing the 10 clean reps, try to focus on how your biceps feel. Move slowly and keep your elbow in the same position."
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-md mx-auto space-y-4">
        {/* Commitment Confirmation Card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-blue-600 text-white px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Dumbbell className="w-5 h-5" />
                <span className="font-semibold text-sm">Workout Started</span>
              </div>
              <div className="flex items-center gap-1 text-blue-100">
                <Clock className="w-3 h-3" />
                <span className="text-xs">2:30 PM</span>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-blue-600 rounded-full p-2">
                <Target className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-lg">Barbell Curls</h3>
                <p className="text-blue-600 font-semibold">5 Sets Committed</p>
              </div>
            </div>

            <div className="mt-3 text-center">
              <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                <CheckCircle className="w-3 h-3" />
                Lets crush this workout!
              </span>
            </div>
          </div>
        </div>

        {/* Set Starter Card */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-green-600 text-white px-4 py-2">
            <span className="font-semibold text-sm">First Set</span>
          </div>
          
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="font-medium text-gray-700">Weight:</span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={decreaseWeight}
                  className="bg-gray-200 hover:bg-gray-300 rounded-full p-1 transition-colors"
                >
                  <Minus className="w-4 h-4 text-gray-600" />
                </button>
                <span className="font-bold text-xl text-gray-800 min-w-16 text-center">
                  {weight} kg
                </span>
                <button 
                  onClick={increaseWeight}
                  className="bg-gray-200 hover:bg-gray-300 rounded-full p-1 transition-colors"
                >
                  <Plus className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>

            <button 
              onClick={handleStartSet}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              Start Set
            </button>
          </div>
        </div>

        {/* AI Assistant Recommendation */}
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
                  We recommend you start with 5 kg if you have not tried barbell curls before. Click start set when ready!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-gradient-to-br from-yellow-50 to-orange-100 border border-orange-200 rounded-lg shadow-sm overflow-hidden">
      <div className="bg-orange-500 text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5" />
            <span className="font-semibold text-sm">Ready to commit?</span>
          </div>
          <div className="flex items-center gap-1 text-orange-100">
            <Clock className="w-3 h-3" />
            <span className="text-xs">2:30 PM</span>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-orange-500 rounded-full p-2">
            <Target className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-lg">Barbell Curls</h3>
            <p className="text-orange-600 font-medium">Do you want to commit to 5 sets?</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={handleCommit}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Yes, Let us Go!
          </button>
          <button 
            onClick={handleDecline}
            className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkoutCommitmentQuestionCard;
