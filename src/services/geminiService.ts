import type { Transaction, MonthlyBudget, CategoryType } from "../types";

type GeminiResponse =
  | { text: string }
  | { category: string }
  | { transactions: Omit<Transaction, "id">[] }
  | { error: string; details?: string };

async function postGemini<T = any>(action: string, payload: any): Promise<T> {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });

  // Try JSON first; fall back to text
  const contentType = res.headers.get("content-type") || "";
  const body: GeminiResponse | string = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const msg =
      typeof body === "string"
        ? body
        : body && "error" in body
        ? `${body.error}${body.details ? `: ${body.details}` : ""}`
        : "Unknown Gemini API error";

    throw new Error(`Gemini API error (${res.status}): ${msg}`);
  }

  return body as T;
}

export const getBudgetInsights = async (
  transactions: Transaction[],
  monthlyBudgets: MonthlyBudget[],
  currentMonth: string
): Promise<string> => {
  try {
    const data = await postGemini<{ text: string }>("insights", {
      transactions,
      monthlyBudgets,
      currentMonth,
    });
    return data.text ?? "No insights available at the moment.";
  } catch (error) {
    console.error("AI Insight Error:", error);
    return "Failed to generate AI insights. Please try again.";
  }
};

export const categorizeDescription = async (
  description: string,
  allCategories: string[]
): Promise<CategoryType> => {
  try {
    const data = await postGemini<{ category: string }>("categorize", {
      description,
      allCategories,
    });

    // If your CategoryType is a union, this is safe-ish; otherwise adjust mapping here.
    return ((data.category ?? "Other") as CategoryType) || ("Other" as CategoryType);
  } catch (error) {
    console.error("AI Categorize Error:", error);
    return "Other" as CategoryType;
  }
};

export const parseCsvWithAi = async (
  csvText: string,
  allCategories: string[]
): Promise<Omit<Transaction, "id">[]> => {
  try {
    const data = await postGemini<{ transactions: Omit<Transaction, "id">[] }>("parseCsv", {
      csvText,
      allCategories,
    });
    return Array.isArray(data.transactions) ? data.transactions : [];
  } catch (error) {
    console.error("AI CSV Parse Error:", error);
    return [];
  }
};
