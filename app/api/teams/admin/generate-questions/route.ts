import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin'
}

export async function POST(request: NextRequest) {
  const isAdmin = await requireAdmin()
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { content, contentType, hasTranscript, count = 5 } = body as {
    content: string
    contentType: 'text' | 'video' | 'file'
    hasTranscript?: boolean
    count?: number
  }

  if (!content?.trim()) {
    return NextResponse.json({ error: 'Content is required to generate questions.' }, { status: 400 })
  }

  const questionCount = Math.min(Math.max(Number(count) || 5, 3), 50)

  const systemPrompt = `You are an expert training content designer creating quiz questions for intake team members at a personal injury law firm. Your questions must be multiple choice, clear, unambiguous, and directly test understanding of the provided material.

Return your response as a valid JSON object with this exact structure:
{
  "questions": [
    {
      "question_text": "string",
      "explanation": "string — shown when rep gets the answer wrong, explains why the correct answer is right",
      "options": [
        { "option_text": "string", "is_correct": true },
        { "option_text": "string", "is_correct": false },
        { "option_text": "string", "is_correct": false },
        { "option_text": "string", "is_correct": false }
      ]
    }
  ]
}

Rules:
- Exactly one option per question must have is_correct: true
- Each question must have 4 options
- Questions should vary in difficulty — mix straightforward recall with application/judgment
- Explanations should be 1–2 sentences, helpful and direct
- Do not number the questions
- Do not include options like "All of the above" or "None of the above"
- Return ONLY the JSON object, no markdown, no commentary`

  const contentLabel = contentType === 'video'
    ? (hasTranscript ? 'video transcript' : 'video topic/description')
    : contentType === 'file'
    ? 'document content'
    : 'training material'

  const userPrompt = `Generate exactly ${questionCount} multiple choice quiz questions based on this ${contentLabel}:\n\n${content}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const rawText = response.content.find((b) => b.type === 'text')?.text ?? ''

    // Strip markdown code fences if present
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let parsed: { questions: Array<{
      question_text: string
      explanation: string
      options: Array<{ option_text: string; is_correct: boolean }>
    }> }

    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('Failed to parse AI response:', rawText)
      return NextResponse.json({ error: 'AI returned an unexpected format. Please try again.' }, { status: 500 })
    }

    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return NextResponse.json({ error: 'No questions were generated. Please try again.' }, { status: 500 })
    }

    // Validate each question has exactly one correct answer
    const validatedQuestions = parsed.questions.map((q) => {
      const correctCount = q.options.filter((o) => o.is_correct).length
      if (correctCount !== 1) {
        // Fix: mark only the first correct as correct
        let fixed = false
        q.options = q.options.map((o) => {
          if (o.is_correct && !fixed) { fixed = true; return { ...o, is_correct: true } }
          return { ...o, is_correct: false }
        })
      }
      return q
    })

    return NextResponse.json({ questions: validatedQuestions })
  } catch (err: any) {
    console.error('AI generation error:', err)
    return NextResponse.json({ error: err.message ?? 'Failed to generate questions.' }, { status: 500 })
  }
}
