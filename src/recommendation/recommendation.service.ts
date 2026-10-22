import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { OfferStatus } from '@prisma/client'
import { AI_CLASSIFICATION_PROVIDER, AiUnavailableError, type AiTextProvider } from '../ai/ai-provider'
import { PUBLIC_COMPANY } from '../company/public-company'
import { PrismaService } from '../prisma/prisma.service'
import { MAX_EXPLAINED, buildExplainPrompt, parseExplanations } from './recommendation-explain'
import { documentTerms } from './text-normalize'
import { type TermVector, buildIdf, cosine, meanVector, topSharedTerms, vectorize } from './tfidf'

const MAX_MATCHED_TERMS = 3

/**
 * Ranking por similitud TF-IDF. El perfil del estudiante es el promedio de sus ofertas postuladas,
 * y cada oferta publicada se compara con ese perfil por coseno. Sin postulaciones el perfil queda
 * vacío: todos los scores valen 0 y el orden es el de publicación, más reciente primero.
 *
 * El modelo (MiniMax) solo se usa con `explain`, para narrar las primeras MAX_EXPLAINED ofertas.
 * Nunca cambia el orden ni añade ofertas.
 */
@Injectable()
export class RecommendationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_CLASSIFICATION_PROVIDER) private readonly provider: AiTextProvider,
  ) {}

  async forStudent(studentId: number, limit: number, explain = false) {
    const applications = await this.prisma.application.findMany({
      where: { studentId },
      select: { offerId: true },
    })
    const appliedIds = new Set(applications.map((a) => a.offerId))

    // Las ofertas postuladas entran en el corpus (para el IDF) aunque ya no estén publicadas.
    const offers = await this.prisma.offer.findMany({
      where: { OR: [{ status: OfferStatus.PUBLISHED }, { id: { in: [...appliedIds] } }] },
      include: { company: PUBLIC_COMPANY },
    })

    const termsById = new Map(offers.map((offer) => [offer.id, documentTerms(offer)]))
    const idf = buildIdf([...termsById.values()])
    const vectorById = new Map<number, TermVector>(
      [...termsById].map(([id, terms]) => [id, vectorize(terms, idf)]),
    )

    const profile = meanVector(
      [...appliedIds].filter((id) => vectorById.has(id)).map((id) => vectorById.get(id) as TermVector),
    )

    const ranked = offers
      .filter((offer) => offer.status === OfferStatus.PUBLISHED && !appliedIds.has(offer.id))
      .map((offer) => {
        const vector = vectorById.get(offer.id) as TermVector
        const score = cosine(profile, vector)
        return {
          ...offer,
          score: Math.round(score * 1000) / 1000,
          matchedTerms: score > 0 ? topSharedTerms(profile, vector, MAX_MATCHED_TERMS) : [],
          explanation: null as string | null,
        }
      })
      .sort((a, b) => b.score - a.score || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
      .slice(0, limit)

    if (!explain || ranked.length === 0) return ranked

    const top = ranked.slice(0, MAX_EXPLAINED)
    const appliedTitles = offers.filter((offer) => appliedIds.has(offer.id)).map((offer) => offer.title)
    const explanations = await this.explain(appliedTitles, top)
    return ranked.map((offer) => ({ ...offer, explanation: explanations.get(offer.id) ?? null }))
  }

  private async explain(
    appliedTitles: string[],
    top: { id: number; title: string; matchedTerms: string[] }[],
  ): Promise<Map<number, string>> {
    const candidates = top.map(({ id, title, matchedTerms }) => ({ id, title, matchedTerms }))
    try {
      const raw = await this.provider.generateText(buildExplainPrompt(appliedTitles, candidates))
      return parseExplanations(raw, candidates.map((c) => c.id))
    } catch (error) {
      if (error instanceof AiUnavailableError) throw new ServiceUnavailableException(error.message)
      throw error
    }
  }
}
