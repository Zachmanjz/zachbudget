import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY (set it in Vercel env vars)" });
  }

  try {
    const { action, payload } = (req.body ?? {}) as { action?: string; payload?: any };
    if (!action) return res.status(400).json({ error: "Missing action" });

    const ai = new GoogleGenAI({ apiKey });

    // Use stable models (avoid preview names that often 404)
    const MODEL_PRO = "gemini-1.5-pro";
    const MODEL_FLASH = "gemini-1.5-flash";

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
      `;

      const response = await ai.models.generateContent({
        model: MODEL_PRO,
        contents: prompt,
        config: {
          systemInstruction:
            "You are a professional financial advisor specializing in family budgeting. Keep advice practical, encouraging, and brief.",
        },
      });

      return res.status(200).json({ text: response.text || "No insights available at the moment." });
    }

    if (action === "categorize") {
      const { description, allCategories } = payload ?? {};

      const response = await ai.models.generateContent({
        model: MODEL_FLASH,
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
      return res.status(200).json({ category: parsed.category ?? "Other" });
    }

    if (action === "parseCsv") {
      const { csvText, allCategories } = payload ?? {};

      const response = await ai.models.generateContent({
        model: MODEL_PRO,
        contents: `
The following is a raw text from a bank CSV file. Parse it accurately into structured transactions.

STRICT RULES:
1. Date: Convert to YYYY-MM-DD. If format is ambiguous (e.g. 01/02/2024), assume MM/DD/YYYY.
2. Amount: Must be a positive decimal.
3. Type: 'expense' for money out, 'income' for money in.
4. Category: Map to one of: ${(allCategories ?? []).join(", ")}.
5. Smart Mapping:
   - Look for 'Description', 'Payee', or 'Memo' for the description.
   - Look for 'Amount', 'Debit', 'Credit', 'Value' for the price.
   - If there's a 'Debit' and 'Credit' column, use whichever has a value.
6. Filtering: Ignore pending transactions or those with zero value.

CSV Data Snippet:
${String(csvText ?? "").substring(0, 8000)}
        `,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING, description: "YYYY-MM-DD format" },
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
      return res.status(200).json({ transactions: JSON.parse(text) });
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
