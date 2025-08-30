'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Square, Play } from 'lucide-react';

export default function RealtimeTranscription() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Check if speech recognition is supported
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsSupported(true);
      
      // Initialize speech recognition
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        setIsListening(true);
        setError('');
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognition.onerror = (event) => {
        setError(`Speech recognition error: ${event.error}`);
        setIsListening(false);
      };
      
      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimText = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript + ' ';
          } else {
            interimText += result[0].transcript;
          }
        }
        
        if (finalTranscript) {
          setTranscript(prev => prev + finalTranscript);
        }
        setInterimTranscript(interimText);
      };
      
      recognitionRef.current = recognition;
    } else {
      setError('Speech recognition is not supported in this browser');
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  const clearTranscript = () => {
    setTranscript('');
    setInterimTranscript('');
  };

  if (!isSupported) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        <div className="text-center py-12">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Speech Recognition Not Supported</h2>
          <p className="text-gray-600">
            Your browser doesn't support the Web Speech API. Try using Chrome, Edge, or Safari.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Real-time Speech Transcription</h1>
        <p className="text-gray-600">Click the microphone to start transcribing your speech</p>
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-4 mb-8">
        <button
          onClick={startListening}
          disabled={isListening}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
            isListening
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          <Mic className="w-5 h-5" />
          Start Listening
        </button>
        
        <button
          onClick={stopListening}
          disabled={!isListening}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
            !isListening
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-red-500 hover:bg-red-600 text-white'
          }`}
        >
          <MicOff className="w-5 h-5" />
          Stop Listening
        </button>
        
        <button
          onClick={clearTranscript}
          className="flex items-center gap-2 px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
        >
          <Square className="w-5 h-5" />
          Clear
        </button>
      </div>

      {/* Status */}
      <div className="flex justify-center mb-6">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
          isListening 
            ? 'bg-green-100 text-green-800' 
            : 'bg-gray-100 text-gray-600'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            isListening ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
          }`}></div>
          {isListening ? 'Listening...' : 'Not listening'}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg">
          <p className="text-red-700 font-medium">{error}</p>
        </div>
      )}

      {/* Transcription Display */}
      <div className="bg-gray-50 rounded-lg p-6 min-h-[300px] border-2 border-dashed border-gray-300">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Transcription:</h3>
        
        <div className="text-gray-700 leading-relaxed text-lg">
          {/* Final transcript */}
          <span>{transcript}</span>
          
          {/* Interim transcript (real-time, not finalized) */}
          {interimTranscript && (
            <span className="text-gray-400 italic bg-yellow-50 px-1 rounded">
              {interimTranscript}
            </span>
          )}
          
          {/* Cursor */}
          {isListening && (
            <span className="inline-block w-0.5 h-6 bg-blue-500 ml-1 animate-pulse"></span>
          )}
        </div>
        
        {!transcript && !interimTranscript && (
          <p className="text-gray-400 italic">
            Your transcribed text will appear here in real-time...
          </p>
        )}
      </div>

      {/* Word Count */}
      {transcript && (
        <div className="mt-4 text-sm text-gray-500 text-center">
          Word count: {transcript.trim().split(/\s+/).filter(word => word.length > 0).length}
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-blue-800 mb-2">Tips:</h4>
        <ul className="text-blue-700 text-sm space-y-1">
          <li>• Speak clearly and at a normal pace</li>
          <li>• Gray italicized text shows real-time interim results</li>
          <li>• Black text shows finalized transcription</li>
          <li>• Works best with Chrome or Edge browsers</li>
          <li>• May require internet connection for processing</li>
        </ul>
      </div>
    </div>
  );
}
