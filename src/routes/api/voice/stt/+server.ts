import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ELEVENLABS_API_KEY } from '$env/static/private';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!ELEVENLABS_API_KEY) {
		return json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
	}

	try {
		const audioBlob = await request.blob();

		const formData = new FormData();
		formData.append('file', audioBlob, 'audio.webm');
		formData.append('model_id', 'scribe_v2');
		formData.append('language_code', 'en');

		const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
			method: 'POST',
			headers: {
				'xi-api-key': ELEVENLABS_API_KEY
			},
			body: formData
		});

		if (!response.ok) {
			const error = await response.text();
			console.error('ElevenLabs STT error:', error);
			return json({ error: 'Speech-to-text failed' }, { status: 502 });
		}

		const data = await response.json();
		return json({ text: data.text ?? '' });
	} catch (err) {
		console.error('STT API error:', err);
		return json({ error: 'Speech-to-text failed' }, { status: 500 });
	}
};
