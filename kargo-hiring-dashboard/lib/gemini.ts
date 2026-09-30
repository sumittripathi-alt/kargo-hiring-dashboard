// Thin Gemini REST client with structured JSON output and 429/5xx retry.
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiOpts = {
  system?: string;
  prompt: string;
  schema: unknown;
  model?: string;
  temperature?: number;
  inlineFile?: { mimeType: string; dataBase64: string };
  deadline?: number; // epoch ms
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function geminiJson<T = any>(o: GeminiOpts): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const model = o.model || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const parts: any[] = [];
  if (o.inlineFile) parts.push({ inlineData: { mimeType: o.inlineFile.mimeType, data: o.inlineFile.dataBase64 } });
  parts.push({ text: o.prompt });
  const body: any = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: o.temperature ?? 0,
      responseMimeType: 'application/json',
      responseSchema: o.schema,
    },
  };
  if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };

  let lastErr = '';
  for (let attempt = 0; attempt < 7; attempt++) {
    if (o.deadline && Date.now() > o.deadline) throw new Error('Out of time budget: ' + lastErr);
    const res = await fetch(`${BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const j = await res.json();
      const text = (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
      if (!text) {
        lastErr = 'empty response: ' + JSON.stringify(j.promptFeedback || j.candidates?.[0]?.finishReason || '');
        await sleep(1500);
        continue;
      }
      try {
        return JSON.parse(text.replace(/^```json\s*|```$/g, '').trim()) as T;
      } catch {
        lastErr = 'invalid JSON from model';
        await sleep(1000);
        continue;
      }
    }
    const errText = await res.text();
    lastErr = `${res.status} ${errText.slice(0, 300)}`;
    if (res.status === 429 || res.status >= 500) {
      const m = errText.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
      const wait = m ? Math.min(65, Math.ceil(parseFloat(m[1])) + 1) * 1000 : Math.min(30000, 2000 * 2 ** attempt);
      await sleep(wait);
      continue;
    }
    throw new Error('Gemini error ' + lastErr); // 4xx (bad key, bad request): no point retrying
  }
  throw new Error('Gemini failed after retries: ' + lastErr);
}

export const S = {
  str: { type: 'STRING' },
  int: { type: 'INTEGER' },
  obj: (properties: Record<string, unknown>, required?: string[]) => ({
    type: 'OBJECT',
    properties,
    required: required || Object.keys(properties),
  }),
  arr: (items: unknown) => ({ type: 'ARRAY', items }),
};
