import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function parsePrice(priceStr: string): number {
  if (!priceStr || priceStr === '?') return 0;
  const cleaned = priceStr
    .replace(/[€$£\s\u00a0\u202f]/g, '')
    .replace(/\.(?=\d{3})/g, '') // Remove thousands-separator dots: 1.299,99 → 1299,99
    .replace(',', '.'); // French decimal comma → dot
  const match = cleaned.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

export async function POST(req: NextRequest) {
  const { product, answers } = await req.json();

  if (!product || !answers) {
    return NextResponse.json({ error: 'Données manquantes.' }, { status: 400 });
  }

  const priceNum = parsePrice(product.price);
  const hourlyWage = parseFloat(answers.hourlyWage) || 0;
  const hoursOfWork =
    hourlyWage > 0 && priceNum > 0
      ? parseFloat((priceNum / hourlyWage).toFixed(1))
      : null;

  const stillUseLabel =
    answers.stillUseIt === 'yes'
      ? 'Oui, régulièrement'
      : answers.stillUseIt === 'rarely'
      ? 'Rarement'
      : answers.stillUseIt === 'no'
      ? 'Non, plus jamais'
      : "Première fois dans ce domaine";

  const previousPurchaseContext = answers.lastSimilarPurchase
    ? `Dernier achat similaire: "${answers.lastSimilarPurchase}" (l'utilise encore: ${stillUseLabel})`
    : 'Aucun achat similaire mentionné';

  const prompt = `Tu es l'avocat du diable pour les achats impulsifs. Ton rôle : convaincre quelqu'un de NE PAS acheter ce produit, avec des arguments percutants, drôles, mais genuinement utiles.

PRODUIT ANALYSÉ:
- Nom: ${product.title || 'Produit Amazon'}
- Prix: ${product.price || 'inconnu'}${hoursOfWork !== null ? ` → ${hoursOfWork} heures de travail à ${hourlyWage}€/h` : ''}
- Note Amazon: ${product.rating || 'inconnue'}
- Description: ${product.description?.substring(0, 400) || 'non disponible'}
${product.negativeReviews?.length > 0 ? `- Retours négatifs: ${product.negativeReviews.slice(0, 3).join(' | ')}` : ''}

PROFIL DE L'ACHETEUR:
- ${previousPurchaseContext}
- Raison invoquée: "${answers.reason || 'non précisée'}"

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni commentaires:

{
  "hoursOfWork": ${hoursOfWork !== null ? hoursOfWork : 'null'},
  "alternatives": [
    "<chose concrète et créative à faire avec cet argent — sois précis et amusant>",
    "<alternative 2>",
    "<alternative 3>"
  ],
  "reviewInsights": "<ce que les acheteurs déçus reprochent le plus souvent à ce type de produit — sois précis, pas générique>",
  "psychologyNote": "<la vraie raison psychologique derrière cet achat — FOMO, ennui, validation sociale, illusion de productivité... sois incisif>",
  "guiltScore": <entier 0-100: 0 = achat totalement justifié, 100 = pur achat impulsif inutile>,
  "roast": "<critique drôle et un peu méchante de cette décision d'achat — 2 phrases max, ton pince-sans-rire>",
  "counterArguments": [
    "<premier obstacle: argument solide, factuel, personnalisé si possible>",
    "<deuxième obstacle: plus émotionnel, rappelle les regrets passés si pertinent>",
    "<troisième obstacle: le coup de grâce — le plus percutant, le plus personnel>"
  ],
  "finalBlessing": "<bénédiction finale pour quelqu'un qui a résisté à 3 arguments et achète quand même — sincère et légèrement ironique, 2 phrases>"
}

Langue: Français. Tutoie. Sois direct, humain, et utile — pas moralisateur.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find((c) => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text block in response');
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const analysis = JSON.parse(jsonMatch[0]);
    return NextResponse.json(analysis);
  } catch (err) {
    console.error('Analyze error:', err);
    return NextResponse.json(
      { error: 'Analyse échouée. Vérifie ta ANTHROPIC_API_KEY.' },
      { status: 500 }
    );
  }
}
