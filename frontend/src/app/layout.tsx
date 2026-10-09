import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import QueryProvider from '@/components/QueryProvider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'AegisLog AI — Anomaly Detection for System Logs',
  description:
    'AI-powered security operations platform that detects anomalous behavior in system logs using Isolation Forest machine learning.',
  keywords: 'security, anomaly detection, SIEM, SOC, machine learning, cybersecurity',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-950 text-gray-100 antialiased min-h-screen">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
