export interface Product {
  asin: string;
  title: string;
  price: string;
  image?: string;
  rating?: string;
  reviewCount?: string;
  negativeReviews: string[];
  description?: string;
  url: string;
  scrapeFailed?: boolean;
}

export type StillUse = 'yes' | 'rarely' | 'no' | 'first';

export interface Answers {
  hourlyWage: string;
  lastSimilarPurchase: string;
  stillUseIt: StillUse;
  reason: string;
}

export interface Analysis {
  hoursOfWork: number | null;
  alternatives: string[];
  reviewInsights: string;
  psychologyNote: string;
  guiltScore: number;
  roast: string;
  counterArguments: string[];
  finalBlessing: string;
}

export type Step =
  | 'url-input'
  | 'loading'
  | 'questions'
  | 'analyzing'
  | 'results'
  | 'battle'
  | 'verdict';
