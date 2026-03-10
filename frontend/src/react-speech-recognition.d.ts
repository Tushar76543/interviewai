/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'react-speech-recognition' {
    export interface SpeechRecognitionOptions {
        continuous?: boolean;
        language?: string;
        interimResults?: boolean;
    }

    export interface UseSpeechRecognitionHook {
        transcript: string;
        listening: boolean;
        resetTranscript: () => void;
        browserSupportsSpeechRecognition: boolean;
        isMicrophoneAvailable?: boolean;
        finalTranscript?: string;
        interimTranscript?: string;
    }

    export function useSpeechRecognition(): UseSpeechRecognitionHook;

    export default class SpeechRecognition {
        static startListening(options?: SpeechRecognitionOptions): Promise<void>;
        static stopListening(): void;
        static abortListening(): void;
        static getRecognition(): any;
    }
}
