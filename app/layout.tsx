import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hlasování Gutovka",
  description: "Přijdeš na fotbal?",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              !function(b,e,t,r){
                b[t]=b[t]||function(...args){(b[t].q=b[t].q||[]).push(args)};
                b[t].l=+new Date;
                var s=e.createElement('script'); s.async=1; s.crossOrigin='anonymous';
                s.src='https://betterstack.net/b.js?t='+r;
                (e.head||e.getElementsByTagName('head')[0]).appendChild(s);
              }(window,document,'betterstack','A2q9aFSoHHvEzAjShz6b5unQ');
              betterstack('init', { environment: 'production' });
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
