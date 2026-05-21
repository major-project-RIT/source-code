import process from "node:process";

const WEATHER_MODEL = process.env.OPENAI_WEATHER_SEARCH_MODEL || "gpt-5.5";

export async function fetchRealtimeWeather({ city } = {}) {
  const normalizedCity = String(city || "").trim();
  if (!normalizedCity) {
    throw new Error("city is required.");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for weather search.");
  }

  const searchResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: WEATHER_MODEL,
      tools: [
        {
          type: "web_search",
          search_context_size: "low",
        },
      ],
      tool_choice: "required",
      input: [
        {
          role: "system",
          content:
            "You fetch current weather with web search and return a concise farmer-friendly report. Include temperature, condition, rain chance or rainfall if available, wind if available, and one practical farming note. Do not invent values that are not present in search results.",
        },
        {
          role: "user",
          content: `Current weather in ${normalizedCity}.`,
        },
      ],
    }),
  });

  const payload = await searchResponse.json().catch(() => ({}));
  if (!searchResponse.ok) {
    throw new Error(payload.error?.message || JSON.stringify(payload));
  }

  return {
    ok: true,
    city: normalizedCity,
    model: WEATHER_MODEL,
    weather: extractOutputText(payload),
    sources: extractSources(payload),
  };
}

function extractOutputText(payload) {
  if (payload.output_text) {
    return payload.output_text;
  }

  return (payload.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("")
    .trim();
}

function extractSources(payload) {
  const sources = [];

  for (const item of payload.output || []) {
    if (Array.isArray(item.sources)) {
      sources.push(...item.sources);
    }

    for (const part of item.content || []) {
      for (const annotation of part.annotations || []) {
        if (annotation.type === "url_citation") {
          sources.push({
            title: annotation.title,
            url: annotation.url,
          });
        }
      }
    }
  }

  return sources;
}
