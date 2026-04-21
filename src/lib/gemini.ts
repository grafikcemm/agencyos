import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GOOGLE_GEMINI_API_KEY || ''

let genAI: GoogleGenerativeAI | null = null

function getGenAI() {
  if (!genAI && apiKey) {
    genAI = new GoogleGenerativeAI(apiKey)
  }
  return genAI
}

export const GEMINI_FAST = 'gemini-2.0-flash-lite'
export const GEMINI_STANDARD = 'gemini-3-flash-preview'

export async function generateResponse(prompt: string, systemPrompt?: string, modelId: string = GEMINI_STANDARD): Promise<string> {
  const ai = getGenAI()
  if (!ai) {
    return '// HATA: Gemini API anahtarı yapılandırılmamış.'
  }

  const model = ai.getGenerativeModel({
    model: modelId,
    systemInstruction: systemPrompt,
  })

  try {
    const result = await model.generateContent(prompt)
    return result.response.text()
  } catch (error: any) {
    console.error('Gemini API Error:', error.message || error)
    return `// SİSTEM MESAJI: AI API kotası aşıldı veya bir hata oluştu. Lütfen API anahtarınızı kontrol edin.`
  }
}

export async function testGeminiConnection(): Promise<boolean> {
  try {
    const ai = getGenAI()
    if (!ai) return false
    const model = ai.getGenerativeModel({ model: GEMINI_FAST })
    await model.generateContent('test')
    return true
  } catch {
    return false
  }
}
