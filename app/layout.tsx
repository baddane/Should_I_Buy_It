import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Should I Buy It? 😈 — L\'avocat du diable',
  description:
    "Colle un lien Amazon. L'outil fait tout pour t'en dissuader — et si t'es encore convaincu, il te donne le lien.",
  openGraph: {
    title: 'Should I Buy It? 😈',
    description: "L'outil qui essaie de t'empêcher d'acheter sur Amazon.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
