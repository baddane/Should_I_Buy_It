'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import type { Product, Answers, Analysis, Step, StillUse } from '../types';

// ─── Small helpers ─────────────────────────────────────────────────────────────

function guiltColor(score: number) {
  if (score >= 70) return 'text-red-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-green-400';
}

function guiltStroke(score: number) {
  if (score >= 70) return '#f87171';
  if (score >= 40) return '#fbbf24';
  return '#4ade80';
}

function guiltLabel(score: number) {
  if (score >= 80) return 'Achat totalement impulsif';
  if (score >= 60) return 'Achat impulsif probable';
  if (score >= 40) return 'Mérite réflexion';
  if (score >= 20) return 'Pas si irrationnel';
  return 'Achat justifié';
}

function renderBold(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="text-white font-semibold">
        {part}
      </strong>
    ) : (
      part
    )
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function GuiltScore({ score }: { score: number }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#27272a" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={guiltStroke(score)}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 1.2s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold ${guiltColor(score)}`}>{score}</span>
        <span className="text-xs text-zinc-500">/100</span>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  children,
  accent = false,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-5 border ${
        accent
          ? 'bg-red-950/30 border-red-900/40'
          : 'bg-zinc-900 border-zinc-800'
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xl">{icon}</span>
        <h3 className="font-semibold text-zinc-200 text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const LOADING_MSGS = [
  'Analyse des avis 1 étoile…',
  'Calcul de tes remords futurs…',
  'Consultation de ton historique d\'achats…',
  'Préparation du sermon…',
  'Interrogation de ta carte bancaire…',
  'Mesure du vide dans ta vie…',
];

// ─── Main Component ────────────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep] = useState<Step>('url-input');
  const [url, setUrl] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [answers, setAnswers] = useState<Answers>({
    hourlyWage: '',
    lastSimilarPurchase: '',
    stillUseIt: 'first',
    reason: '',
  });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [battleRound, setBattleRound] = useState(0);
  const [visible, setVisible] = useState(0);
  const [loadingIdx, setLoadingIdx] = useState(0);
  const [error, setError] = useState('');

  // Rotate loading messages
  useEffect(() => {
    if (step !== 'loading' && step !== 'analyzing') return;
    const id = setInterval(() => setLoadingIdx((i) => (i + 1) % LOADING_MSGS.length), 1600);
    return () => clearInterval(id);
  }, [step]);

  // Stagger results reveal
  useEffect(() => {
    if (step !== 'results') return;
    setVisible(0);
    const delays = [100, 600, 1100, 1600, 2100, 2700];
    const timers = delays.map((d, i) => setTimeout(() => setVisible(i + 1), d));
    return () => timers.forEach(clearTimeout);
  }, [step]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setStep('loading');
    setError('');
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Lien invalide.');
        setStep('url-input');
        return;
      }
      setProduct(data);
      setManualTitle('');
      setManualPrice('');
      setStep('questions');
    } catch {
      setError('Erreur de connexion. Réessaie.');
      setStep('url-input');
    }
  }

  async function handleAnalysis(e: React.FormEvent) {
    e.preventDefault();
    setStep('analyzing');
    const finalProduct: Product = product?.scrapeFailed
      ? {
          ...(product as Product),
          title: manualTitle || 'Produit Amazon',
          price: manualPrice || '?',
        }
      : (product as Product);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: finalProduct, answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Erreur d\'analyse.');
        setStep('questions');
        return;
      }
      setAnalysis(data);
      setStep('results');
    } catch {
      setError('Erreur de connexion. Réessaie.');
      setStep('questions');
    }
  }

  function startBattle() {
    setBattleRound(0);
    setStep('battle');
  }

  function nextRound() {
    if (battleRound >= 2) {
      setStep('verdict');
    } else {
      setBattleRound((r) => r + 1);
    }
  }

  function reset() {
    setStep('url-input');
    setUrl('');
    setProduct(null);
    setAnalysis(null);
    setBattleRound(0);
    setError('');
    setAnswers({ hourlyWage: '', lastSimilarPurchase: '', stillUseIt: 'first', reason: '' });
  }

  const affiliateUrl = product
    ? `${product.url}${
        process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG
          ? `?tag=${process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG}`
          : ''
      }`
    : '#';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">

        {/* ══ URL INPUT ══════════════════════════════════════════════════════ */}
        {step === 'url-input' && (
          <div className="text-center">
            <div className="text-7xl mb-6 select-none">😈</div>
            <h1 className="text-4xl font-bold mb-3 leading-tight tracking-tight">
              Tu veux vraiment<br />l'acheter&nbsp;?
            </h1>
            <p className="text-zinc-400 text-lg mb-2">
              Colle le lien Amazon. Je vais tout faire pour t'en dissuader.
            </p>
            <p className="text-zinc-600 text-sm mb-10">
              Si t'es encore convaincu après, je te donne le lien — promis.
            </p>

            <form onSubmit={handleUrlSubmit} className="flex flex-col gap-3">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.amazon.fr/dp/..."
                required
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-5 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-red-500 transition-colors text-sm"
              />
              <button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold py-4 rounded-xl transition-colors text-lg"
              >
                Analyse ce produit →
              </button>
            </form>

            {error && (
              <p className="mt-4 text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <p className="mt-8 text-zinc-700 text-xs">
              Amazon.fr · Amazon.com · lien affilié en sortie
            </p>
          </div>
        )}

        {/* ══ LOADING ════════════════════════════════════════════════════════ */}
        {step === 'loading' && (
          <div className="text-center">
            <div className="text-5xl mb-6 animate-bounce">🔍</div>
            <h2 className="text-2xl font-semibold mb-3">Inspection en cours…</h2>
            <p className="text-zinc-500 animate-pulse-slow text-sm">{LOADING_MSGS[loadingIdx]}</p>
          </div>
        )}

        {/* ══ QUESTIONS ══════════════════════════════════════════════════════ */}
        {step === 'questions' && product && (
          <div>
            {/* Product card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-8 flex gap-4 items-start">
              {product.image && !product.scrapeFailed ? (
                <div className="flex-shrink-0 w-20 h-20 bg-white rounded-lg overflow-hidden">
                  <Image
                    src={product.image}
                    alt={product.title}
                    width={80}
                    height={80}
                    className="w-full h-full object-contain p-1"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex-shrink-0 w-20 h-20 bg-zinc-800 rounded-lg flex items-center justify-center">
                  <span className="text-3xl">📦</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                {product.scrapeFailed ? (
                  <div>
                    <p className="text-amber-400 text-xs mb-3">
                      😅 Amazon nous a bloqués… aide-nous un peu&nbsp;:
                    </p>
                    <input
                      type="text"
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      placeholder="Nom du produit"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:border-red-500 transition-colors placeholder-zinc-600"
                    />
                    <input
                      type="text"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      placeholder="Prix (ex: 49.99)"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 transition-colors placeholder-zinc-600"
                    />
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-sm leading-snug line-clamp-2 mb-1">
                      {product.title}
                    </p>
                    {product.price && (
                      <p className="text-red-400 font-bold text-xl">{product.price}</p>
                    )}
                    {product.rating && (
                      <p className="text-zinc-600 text-xs mt-1">⭐ {product.rating}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <p className="text-zinc-500 text-sm mb-6 text-center">
              Quelques questions avant le verdict… 😈
            </p>

            {error && (
              <p className="mb-4 text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <form onSubmit={handleAnalysis} className="space-y-5">
              {/* Hourly wage */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Ton salaire horaire net ?{' '}
                  <span className="text-zinc-500 font-normal">(€/h — pour calculer le vrai prix)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={answers.hourlyWage}
                  onChange={(e) => setAnswers((a) => ({ ...a, hourlyWage: e.target.value }))}
                  placeholder="ex: 18"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:border-red-500 transition-colors placeholder-zinc-600 text-sm"
                />
              </div>

              {/* Last similar purchase */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  C'est quoi le dernier achat similaire que t'as fait ?
                </label>
                <input
                  type="text"
                  value={answers.lastSimilarPurchase}
                  onChange={(e) => setAnswers((a) => ({ ...a, lastSimilarPurchase: e.target.value }))}
                  placeholder="ex: un autre gadget de cuisine, des baskets…"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:border-red-500 transition-colors placeholder-zinc-600 text-sm"
                />
              </div>

              {/* Still use it */}
              {answers.lastSimilarPurchase.trim() && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-3">
                    Tu l'utilises encore ?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { val: 'yes' as StillUse, label: '✅ Régulièrement' },
                        { val: 'rarely' as StillUse, label: '🤷 Rarement' },
                        { val: 'no' as StillUse, label: '❌ Plus jamais' },
                      ] as { val: StillUse; label: string }[]
                    ).map(({ val, label }) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setAnswers((a) => ({ ...a, stillUseIt: val }))}
                        className={`py-2 px-2 rounded-xl text-xs font-medium transition-all border ${
                          answers.stillUseIt === val
                            ? 'border-red-500 bg-red-500/20 text-red-300'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Pourquoi tu penses en avoir besoin ?
                </label>
                <textarea
                  value={answers.reason}
                  onChange={(e) => setAnswers((a) => ({ ...a, reason: e.target.value }))}
                  placeholder="Sois honnête… (au moins avec toi-même)"
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:border-red-500 transition-colors resize-none placeholder-zinc-600 text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold py-4 rounded-xl text-lg transition-colors"
              >
                Laisse le diable décider 😈
              </button>
            </form>
          </div>
        )}

        {/* ══ ANALYZING ══════════════════════════════════════════════════════ */}
        {step === 'analyzing' && (
          <div className="text-center">
            <div className="text-6xl mb-6">😈</div>
            <h2 className="text-2xl font-semibold mb-3">En train de te juger…</h2>
            <p className="text-zinc-500 animate-pulse-slow text-sm">{LOADING_MSGS[loadingIdx]}</p>
            <div className="mt-8 flex justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 bg-red-500 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 180}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ══ RESULTS ════════════════════════════════════════════════════════ */}
        {step === 'results' && analysis && (
          <div>
            {/* Guilt score */}
            <div
              className="text-center mb-8"
              style={{ opacity: visible >= 1 ? 1 : 0, transition: 'opacity 0.5s ease' }}
            >
              <p className="text-zinc-600 text-xs uppercase tracking-widest mb-5">
                Verdict de culpabilité
              </p>
              <GuiltScore score={analysis.guiltScore} />
              <p className={`mt-3 font-semibold ${guiltColor(analysis.guiltScore)}`}>
                {guiltLabel(analysis.guiltScore)}
              </p>
            </div>

            <div className="space-y-3">
              {/* Hours of work */}
              {visible >= 2 && analysis.hoursOfWork && (
                <Card icon="⏰" title="Le vrai prix — ton temps de vie">
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    {renderBold(
                      `Ça représente **${analysis.hoursOfWork} heure${analysis.hoursOfWork > 1 ? 's' : ''}** de boulot. Tu échanges littéralement du temps irremplaçable contre ça.`
                    )}
                  </p>
                </Card>
              )}

              {/* Alternatives */}
              {visible >= 3 && (
                <Card icon="💸" title="Ce que tu pourrais faire avec cet argent">
                  <ul className="space-y-2">
                    {analysis.alternatives.map((alt, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                        <span className="text-zinc-600 mt-0.5 flex-shrink-0">•</span>
                        <span>{alt}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* Review insights */}
              {visible >= 4 && (
                <Card icon="😬" title="Ce que disent les acheteurs déçus">
                  <p className="text-zinc-400 text-sm leading-relaxed">{analysis.reviewInsights}</p>
                </Card>
              )}

              {/* Psychology */}
              {visible >= 5 && (
                <Card icon="🧠" title="Pourquoi ton cerveau te ment">
                  <p className="text-zinc-400 text-sm leading-relaxed">{analysis.psychologyNote}</p>
                </Card>
              )}

              {/* Roast */}
              {visible >= 6 && (
                <Card icon="😈" title="Le verdict final" accent>
                  <p className="text-zinc-300 text-sm italic leading-relaxed">
                    "{analysis.roast}"
                  </p>
                </Card>
              )}
            </div>

            {/* CTA */}
            {visible >= 6 && (
              <div className="mt-8 space-y-3">
                <button
                  onClick={startBattle}
                  className="w-full bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold py-4 rounded-xl text-lg transition-colors"
                >
                  J'en ai quand même besoin →
                </button>
                <button
                  onClick={reset}
                  className="w-full text-zinc-600 hover:text-zinc-400 py-2 text-sm transition-colors"
                >
                  Tu as raison, j'abandonne. ✌️
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ BATTLE ═════════════════════════════════════════════════════════ */}
        {step === 'battle' && analysis && (
          <div className="text-center">
            <div className="text-5xl mb-3">
              {battleRound === 0 ? '🤨' : battleRound === 1 ? '😤' : '🤬'}
            </div>

            <div className="flex items-center justify-center gap-2 mb-6">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i <= battleRound ? 'w-8 bg-red-500' : 'w-4 bg-zinc-700'
                  }`}
                />
              ))}
              <span className="text-zinc-600 text-xs ml-2">argument {battleRound + 1}/3</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 mb-8 text-left">
              <p className="text-xl leading-relaxed text-zinc-100">
                {analysis.counterArguments[battleRound]}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={nextRound}
                className="w-full bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold py-4 rounded-xl text-lg transition-colors"
              >
                {battleRound < 2
                  ? "J'en ai encore plus besoin 😤"
                  : "Je l'achète quand même 🛒"}
              </button>
              <button
                onClick={reset}
                className="w-full border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 font-medium py-3 rounded-xl text-sm transition-colors"
              >
                {battleRound < 2
                  ? 'Ok ok, tu as raison… 😮‍💨'
                  : 'J\'abandonne définitivement. 🏳️'}
              </button>
            </div>
          </div>
        )}

        {/* ══ VERDICT ════════════════════════════════════════════════════════ */}
        {step === 'verdict' && analysis && (
          <div className="text-center">
            <div className="text-6xl mb-5">🎉</div>
            <h2 className="text-3xl font-bold mb-2">Tu l'as vraiment mérité.</h2>
            <p className="text-zinc-400 mb-8">
              Tu as résisté à 3 arguments béton. C'est du sérieux. 👏
            </p>

            <div className="bg-zinc-900 border border-emerald-900/50 rounded-xl p-5 mb-8 text-left">
              <p className="text-zinc-500 text-xs mb-2 uppercase tracking-wider">
                La bénédiction finale
              </p>
              <p className="text-zinc-200 italic leading-relaxed">
                "{analysis.finalBlessing}"
              </p>
            </div>

            <a
              href={affiliateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-bold py-5 rounded-xl text-xl transition-colors mb-3"
            >
              🛒 Commander sur Amazon
            </a>

            <p className="text-zinc-700 text-xs mb-8">
              Lien affilié Amazon — même prix pour toi, petite commission pour nous 🤝
            </p>

            <button
              onClick={reset}
              className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors"
            >
              Analyser un autre produit →
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
