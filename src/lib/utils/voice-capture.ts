// Shared microphone capture → speech-to-text.
//
// Extracted from the prompt bar in src/routes/+layout.svelte so surfaces other
// than the AI dock (onboarding, for one) get identical recording behaviour:
// the same mime-type fallback chain, the same silence detection, and the same
// /api/voice/stt (ElevenLabs) transcription.
//
// The layout's dock uses this to drive a continuous voice *conversation*
// (transcript → AI → spoken reply). Onboarding uses it for plain dictation —
// transcript goes straight into the current answer. This module only covers
// the shared half: record until the speaker stops, then return the text.

const SILENCE_THRESHOLD = 15;
const SILENCE_FRAMES_TO_STOP = 12; // ~1.5s at 125ms intervals
const FRAME_INTERVAL_MS = 125;
const LEVEL_INTERVAL_MS = 60;
const LEVEL_NOISE_FLOOR = 0.01;

/** Strip non-speech artifacts like [music playing] or (background noise). */
export function cleanTranscript(raw: string | null | undefined): string {
	if (!raw) return '';
	return raw.replace(/\[.*?\]|\(.*?\)/g, '').trim();
}

/** Pick a MediaRecorder mime type the browser actually supports. */
export function pickMimeType(): string {
	if (typeof MediaRecorder === 'undefined') return '';
	const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
	for (const type of candidates) {
		if (MediaRecorder.isTypeSupported(type)) return type;
	}
	return '';
}

/** RMS loudness (0–1) of one frame of time-domain samples (128 = silence). */
export function levelFromTimeDomain(data: Uint8Array): number {
	if (data.length === 0) return 0;
	let sum = 0;
	for (const v of data) {
		const n = (v - 128) / 128;
		sum += n * n;
	}
	return Math.sqrt(sum / data.length);
}

/**
 * Map a loudness level to a waveform bar height in px. Room noise under the
 * floor stays a dot (`min`); the curve is square-rooted so normal speech
 * fills the range instead of only shouting.
 */
export function levelToBarHeight(level: number, min = 2, max = 24): number {
	const gated = Math.max(0, level - LEVEL_NOISE_FLOOR);
	return Math.round(min + (max - min) * Math.min(1, Math.sqrt(gated * 5)));
}

export type VoiceCaptureState = 'listening' | 'processing';

export interface VoiceCaptureHandle {
	/** Stop recording and transcribe whatever was captured. */
	stop(): void;
	/** Abandon the recording without transcribing. */
	cancel(): void;
}

export interface VoiceCaptureOptions {
	onState?: (state: VoiceCaptureState) => void;
	onResult: (text: string) => void;
	onError?: (message: string) => void;
	/** Loudness (0–1) every ~60ms while recording, for live waveforms. */
	onLevel?: (level: number) => void;
}

/**
 * Record from the mic until the speaker goes quiet (or `stop()` is called),
 * then transcribe. Resolves through `onResult`; never throws at the call site.
 */
export async function startVoiceCapture(
	opts: VoiceCaptureOptions
): Promise<VoiceCaptureHandle | null> {
	const { onState, onResult, onError, onLevel } = opts;

	let stream: MediaStream | null = null;
	let audioContext: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let recorder: MediaRecorder | null = null;
	let frameTimer: ReturnType<typeof setTimeout> | undefined;
	let levelTimer: ReturnType<typeof setInterval> | undefined;
	let cancelled = false;
	let speechDetected = false;
	const chunks: Blob[] = [];

	function teardown() {
		clearTimeout(frameTimer);
		clearInterval(levelTimer);
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
			stream = null;
		}
		if (audioContext) {
			void audioContext.close().catch(() => {});
			audioContext = null;
			analyser = null;
		}
	}

	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	} catch {
		onError?.('I need microphone access to hear you.');
		return null;
	}

	try {
		audioContext = new AudioContext();
		const source = audioContext.createMediaStreamSource(stream);
		analyser = audioContext.createAnalyser();
		analyser.fftSize = 512;
		source.connect(analyser);

		const mimeType = pickMimeType();
		recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) chunks.push(e.data);
		};

		recorder.onstop = async () => {
			teardown();
			if (cancelled) return;
			// No audible speech — don't spend an STT call on silence.
			if (chunks.length === 0 || !speechDetected) {
				onError?.("I didn't catch that.");
				return;
			}
			onState?.('processing');
			try {
				const res = await fetch('/api/voice/stt', {
					method: 'POST',
					headers: { 'Content-Type': 'audio/webm' },
					body: new Blob(chunks, { type: 'audio/webm' })
				});
				const data = await res.json();
				const text = cleanTranscript(data?.text);
				if (!text) {
					onError?.("I didn't catch that.");
					return;
				}
				onResult(text);
			} catch {
				onError?.("I couldn't transcribe that.");
			}
		};

		recorder.start(250);
		onState?.('listening');

		// Auto-stop once the speaker has said something and then gone quiet.
		const data = new Uint8Array(analyser.frequencyBinCount);
		let silentFrames = 0;
		const checkAudio = () => {
			if (cancelled || !analyser || !recorder || recorder.state !== 'recording') return;
			analyser.getByteFrequencyData(data);
			const avg = data.reduce((a, b) => a + b, 0) / data.length;
			if (avg > SILENCE_THRESHOLD) {
				speechDetected = true;
				silentFrames = 0;
			} else if (speechDetected) {
				silentFrames++;
				if (silentFrames >= SILENCE_FRAMES_TO_STOP) {
					recorder.stop();
					return;
				}
			}
			frameTimer = setTimeout(checkAudio, FRAME_INTERVAL_MS);
		};
		checkAudio();

		if (onLevel) {
			const samples = new Uint8Array(analyser.fftSize);
			levelTimer = setInterval(() => {
				if (cancelled || !analyser || !recorder || recorder.state !== 'recording') return;
				analyser.getByteTimeDomainData(samples);
				onLevel(levelFromTimeDomain(samples));
			}, LEVEL_INTERVAL_MS);
		}
	} catch {
		teardown();
		onError?.("I couldn't start recording.");
		return null;
	}

	return {
		stop() {
			if (recorder && recorder.state === 'recording') recorder.stop();
			else teardown();
		},
		cancel() {
			cancelled = true;
			if (recorder && recorder.state === 'recording') recorder.stop();
			teardown();
		}
	};
}
