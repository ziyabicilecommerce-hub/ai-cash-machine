async function callClaude(bodyText) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return { status: 500, data: { error: 'API key not configured' } };
  }

  const body = JSON.parse(bodyText);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  return { status: response.status, data };
}

// Netlify Functions format (event/context, returns {statusCode, body})
exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  try {
    const { status, data } = await callClaude(event.body);
    return {
      statusCode: status,
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

// Vercel Serverless Function format (req/res)
exports.default = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const bodyText = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const { status, data } = await callClaude(bodyText);
    res.status(status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
