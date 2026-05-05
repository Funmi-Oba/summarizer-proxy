
// This is the proxy server
// It lives on Vercel and holds the API key safely
// The extension calls this server instead of Groq directly

export default async function handler(req, res) {

  // Only allow POST requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the page data from the extension
  const { title, text, url } = req.body;

  // Make sure we received content
  if (!text || !title) {
    return res.status(400).json({ error: 'Missing page content' });
  }

  // Get API key from Vercel environment variables
  const API_KEY = process.env.GROQ_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  // Build the prompt
  const prompt = `
You are a smart reading assistant.
Analyze the following webpage content and respond in this EXACT JSON format:
{
  "summary": ["bullet point 1", "bullet point 2", "bullet point 3", "bullet point 4", "bullet point 5"],
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "readingTime": 5
}

Rules:
- summary must have exactly 5 bullet points
- keyInsights must have exactly 3 points
- readingTime is a number (minutes)
- Respond ONLY with the JSON. No extra text. No markdown.

Page Title: ${title}

Page Content:
${text}
  `.trim();

  try {

    // Call Groq API from the server
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 600
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Groq API request failed');
    }

    const data = await response.json();
    const rawText = data.choices[0].message.content.trim();

    // Clean the response
    const cleaned = rawText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    // Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('AI returned unexpected response');
    }

    // Send summary back to extension
    return res.status(200).json({ success: true, result: parsed });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Something went wrong'
    });
  }
}