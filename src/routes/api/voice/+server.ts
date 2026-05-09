import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ELEVENLABS_API_KEY } from '$env/static/private';

const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah — natural conversational voice

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { text, voiceId } = await request.json();
	const VOICE_ID = voiceId || DEFAULT_VOICE_ID;

	if (!text || typeof text !== 'string') {
		return json({ error: 'Text is required' }, { status: 400 });
	}

	if (!ELEVENLABS_API_KEY) {
		return json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
	}

	try {
		const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'xi-api-key': ELEVENLABS_API_KEY
			},
			body: JSON.stringify({
				text,
				model_id: 'eleven_turbo_v2_5',
				voice_settings: {
					stability: 0.5,
					similarity_boost: 0.75,
					style: 0.0,
					use_speaker_boost: true
				}
			})
		});

		if (!response.ok) {
			const error = await response.text();
			console.error('ElevenLabs API error:', error);
			return json({ error: 'Voice synthesis failed' }, { status: 502 });
		}

		return new Response(response.body, {
			headers: {
				'Content-Type': 'audio/mpeg',
				'Transfer-Encoding': 'chunked'
			}
		});
	} catch (err) {
		console.error('Voice API error:', err);
		return json({ error: 'Voice synthesis failed' }, { status: 500 });
	}
};
