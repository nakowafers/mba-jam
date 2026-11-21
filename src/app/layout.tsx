import type { Metadata } from 'next';
import './globals.css';
import { HttpSleeperGateway } from '@/lib/gateway/http-sleeper-gateway';
import { MBA_LEAGUE_ID_2026 } from '@/lib/types/mba';
import { MbaLeagueProvider } from '@/components/providers/mba-league-provider';
import { TopNavBar } from '@/components/nav/top-nav-bar';

export const metadata: Metadata = {
  title: 'MBA Jam — Sleeper NBA Dynasty Lock-In & Trade Companion',
  description:
    'Companion web app for the 10-team MBA Sleeper NBA Dynasty League (1344293979830640640). Custom MBA scoring, weekly Lock-In lineup optimization, and non-linear dynasty trade analysis.',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gateway = new HttpSleeperGateway(MBA_LEAGUE_ID_2026);
  const initialBundle = await gateway.fetchLeagueBundle();

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <MbaLeagueProvider initialBundle={initialBundle}>
          <div className="flex min-h-screen flex-col">
            <TopNavBar />
            <main className="flex-1">{children}</main>
          </div>
        </MbaLeagueProvider>
      </body>
    </html>
  );
}
