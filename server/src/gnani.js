
const DEFAULT_STT_URL = 'https://api.vachana.ai/stt/v3';

const EXTENSION_BY_MIME_TYPE = {
  'audio/webm': 'webm',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac'
};

export async function transcribeWithGnani(
  audioBuffer,
  mimeType,
  languageCode = 'hi-IN'
) {
  const apiKey = process.env.GNANI_API_KEY;
  const url = process.env.GNANI_STT_URL || DEFAULT_STT_URL;

  if (!apiKey) {
    const error = new Error(
      'Gnani API key is missing from server/.env.'
    );
    error.status = 503;
    throw error;
  }

  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    const error = new Error('Please upload a valid audio recording.');
    error.status = 400;
    throw error;
  }

  const supportedLanguages = new Set([
    'hi-IN',
    'mr-IN',
    'en-IN',
    'indic-auto'
  ]);

  if (!supportedLanguages.has(languageCode)) {
    languageCode = 'indic-auto';
  }

  const incomingMimeType = String(mimeType || 'application/octet-stream')
    .split(';')[0]
    .trim()
    .toLowerCase();

  const isWav =
    audioBuffer.length >= 12 &&
    audioBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    audioBuffer.subarray(8, 12).toString('ascii') === 'WAVE';

  const normalizedMimeType = isWav
    ? 'audio/wav'
    : incomingMimeType;

  const extension = EXTENSION_BY_MIME_TYPE[normalizedMimeType];

  if (!extension) {
    const error = new Error(
      `Unsupported audio format: ${normalizedMimeType}.`
    );
    error.status = 400;
    throw error;
  }

  console.error('JeevSetu audio diagnostic:', {
    incomingMimeType,
    normalizedMimeType,
    filename: `recording.${extension}`,
    sizeBytes: audioBuffer.length,
    riffHeader: audioBuffer.subarray(0, 4).toString('ascii'),
    waveHeader: audioBuffer.subarray(8, 12).toString('ascii')
  });

  const form = new FormData();

  form.append(
    'audio_file',
    new Blob([audioBuffer], {
      type: normalizedMimeType
    }),
    `recording.${extension}`
  );
  form.append('model', 'prisma-v3.0');

  if (languageCode === 'indic-auto') {
    form.append('language_code', 'indic-auto');
    form.append('multi_lang_codes', 'hi-IN,en-IN');
    form.append('format', 'codemix');
  } else {
    form.append('language_code', languageCode);
    form.append('format', 'transcribe');
  }

  let response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-Key-ID': apiKey
      },
      body: form,
      signal: AbortSignal.timeout(60000)
    });
  } catch (cause) {
    console.error('Gnani connection error:', cause.message);

    const error = new Error(
      'Could not connect to Gnani AI. Check the URL and internet connection.'
    );
    error.status = 502;
    throw error;
  }

  const responseText = await response.text();

  console.log('Gnani HTTP status:', response.status);
  console.log(
    'Gnani error message (full):',
    responseText.slice(-4000)
  );

  let result;

  try {
    result = JSON.parse(responseText);
  } catch {
    result = null;
  }

  if (!response.ok) {
    const error = new Error(
      response.status === 401 || response.status === 403
        ? 'Gnani authentication failed. Check the API credentials and permissions.'
        : response.status === 429
          ? 'Gnani rate limit reached. Please try again later.'
          : `Gnani request failed with HTTP ${response.status}. Check the backend terminal.`
    );

    error.status = 502;
    throw error;
  }

  const transcript =
    typeof result?.transcript === 'string'
      ? result.transcript.trim()
      : '';

  if (!transcript) {
    console.error(
      'Gnani returned no transcript. Check its response format.'
    );

    const error = new Error(
      'Gnani returned no transcript. Check the backend terminal for its response.'
    );
    error.status = 502;
    throw error;
  }

  return transcript;
}
