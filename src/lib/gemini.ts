import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function askHost(puzzleSurface: string, puzzleBase: string, question: string, history: { role: string, text: string }[]) {
  const systemInstruction = `
    你是一个海龟汤（Lateral Thinking Puzzle）的游戏主持人（汤主）。
    当前的汤面（题目）是：${puzzleSurface}
    当前的汤底（真相）是：${puzzleBase}
    
    玩家会向你提问，你只能回答以下四种之一：
    1. 是 (YES)
    2. 不是 (NO)
    3. 是也不是 (YES AND NO)
    4. 不重要 (IRRELEVANT)
    
    如果玩家的问题已经触及了核心真相，或者玩家请求揭晓答案，你可以给出稍微多一点的引导，或者确认他已经解开了。
    但在解开之前，严格遵守“是/不是/是也不是/不重要”的原则。
    
    如果玩家的问题不是一个是非题，请提醒玩家只能问是非题。
  `;

  const contents = history.map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.text }]
  }));

  contents.push({
    role: 'user',
    parts: [{ text: question }]
  });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents as any,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    return response.text || "不重要";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "（先知陷入了沉默...）";
  }
}
