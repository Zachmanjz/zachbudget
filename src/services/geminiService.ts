import { Transaction, MonthlyBudget, CategoryType } from "../types";

async function postGemini(action: string, payload: any) {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${text}`);
  }

  return res.json();
}

export const getBudgetInsights = async (
  transactions: Transaction[],
  monthlyBudgets: MonthlyBudget[],
  currentMonth: string
) => {
  try {
    const data = await postGemini("insights", { transactions, monthlyBudgets, currentMonth });
    return data.text as string;
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
    const data = await postGemini("categorize", { description, allCategories });
    return (data.category ?? "Other") as CategoryType;
  } catch {
    retu
