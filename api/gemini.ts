import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";

type Action = "categorize" | "insights" | "parseCsv" | "listModels";

function pickFirstAvailableModel(models: any[], preferred: string[]) {
  const names = new Set(
    models
      .map((m) => m?.name)
      .filter(Boolean)
      .map((n: string) => n.replace(/^models\//, "")) // normalize
  );

  for (const p of preferred) {
    if (names.has(p)) return p;
  }
  return null;
}

async function listModels(ai: GoogleGenAI) {
  const models: any[] = [];

  // models.list returns an async iterable in this SDK
  const pager = await ai.models.list({ pageSize: 200 });
  for await (const m of pager) models.push(m);

  // Keep only those that support generateContent
  const textModels = models.filter((m) => m?.supportedGenerationMethods?.includes("generateContent"));
  return { all: models, text: textModels };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Helpful GET response so you know the route exists
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, hint: "POST { action, payload } to this endpoint" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY (set it in Vercel env vars)" });
  }

  try {
    const { action, payload } = (req.body ?? {}) as { action?: Action; payload?: any };
    if (!action) return res.status(400).json({ error: "Missing action" });

    const ai = new GoogleGenAI({ apiKey });

    // Debug action: show exactly what models your key can access
    if (action === "listModels") {
      const { text } = await listModels(ai);
      const out = text.map((m) => ({
        name: m.name,
        displayName: m.displayName,
        supportedGenerationMethods: m.supportedGenerationMethods,
      }));
      return res.status(200).json({ count: out.length, models: out });
    }

    // Prefer newer names, but fall back based on what your key actually sees.
    // We'll dynamically choose from your available models list.
    const { text: availableTextModels } = await listModels(ai);

    const preferredFast = [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash",
    ];

    const preferredPro = [
      "gemini-2.5-pro",
      "gemini-2.0-pro",
      "gemini-1.5-pro-latest",
      "gemini-1.5-pro",
    ];

    const MODEL_FAST =
      pickFirstAvailableModel(availableTextModels, preferredFast) ??
      pickFirstAvailableModel(availableTextModels, preferredPro) ??
      "gemini-1.5-flash-latest"; // last-ditch default

    const MODEL_PRO =
      pickFirstAvailableModel(availableTextModels, preferredPro) ??
      pickFirstAvailableModel(availableTextModels, preferredFast) ??
      "gemini-1.5-pro-latest"; // last-ditch default

    if (action === "insights") {
      const { transactions, monthlyBudgets, currentMonth } = payload ?? {};

      const currentMonthTransactions = (transactions ?? []).filter((t: any) =>
        String(t.date ?? "").startsWith(currentMonth)
      );
      const currentMonthBudget = (monthlyBudgets ?? []).find((b: any) => b.month === currentMonth);

      const prompt = `
Analyze my family budget for ${currentMonth}.

Budget Plan:
${JSON.stringify(currentMonthBudget?.budgets || [])}

Actual Transactions:
${JSON.stringify(
        currentMonthTransactions.map((t: any) => ({
          category: t.category,
          amount: t.amount,
          type: t.type,
          desc: t.description,
        }))
      )}

Provide 3 concise, actionable financial tips based on this data. Focus on overspending and potential savings.
      `.trim();

      const response = await ai.models.generateContent({
        model: MODEL_PRO,
        contents: prompt,
        config: {
          systemInstruction:
            "You are a professional financial advisor specializing in family budgeting. Keep advice practical, encouraging, and brief.",
        },
      });

      return res.status(200).json({
        text: response.text || "No insights available at the moment.",
        modelUsed: MODEL_PRO,
      });
    }

    if (action === "categorize") {
      const { description, allCategories } = payload ?? {};

      const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: `Categorize this transaction description into one of these: ${(allCategories ?? []).join(
          ", "
        )}. Description: "${description}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { category: { type: Type.STRING } },
            required: ["category"],
          },
        },
      });

      const text = response.text?.trim() || '{"category":"Other"}';
      const parsed = JSON.parse(text);

      return res.status(200).json({
        category: parsed.category ?? "Other",
        modelUsed: MODEL_FAST,
      });
    }

    if (action === "parseCsv") {
      const { csvText, allCategories } = payload ?? {};

      const response = await ai.models.generateContent({
        model: MODEL_PRO,
        contents: `
The following is raw text from a bank CSV file. Parse it into structured transactions.

RULES:
- date: YYYY-MM-DD
- amount: positive decimal
- type: 'expense' or 'income'
- category: one of: ${(allCategories ?? []).join(", ")}

CSV:
${String(csvText ?? "").substring(0, 8000)}
        `.trim(),
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                description: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                type: { type: Type.STRING, enum: ["expense", "income"] },
                category: { type: Type.STRING },
              },
              required: ["date", "description", "amount", "type", "category"],
            },
          },
        },
      });

      const text = response.text?.trim() || "[]";
      return res.status(200).json({
        transactions: JSON.parse(text),
        modelUsed: MODEL_PRO,
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: any) {
    console.error("Gemini API error:", err);
    return res.status(500).json({
      error: "Gemini request failed",
      details: String(err?.message ?? err),
    });
  }
}
