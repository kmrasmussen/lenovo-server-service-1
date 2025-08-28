import type { Metadata } from "next";
import "./globals.css";

function HttpsRedirect() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          if (typeof window !== 'undefined' && window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
            window.location.href = window.location.href.replace('http:', 'https:');
          }
        `,
      }}
    />
  );
}

export const metadata: Metadata = {
  title: "dumper app title",
  description: "dump your thoughts here",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <HttpsRedirect />
      </head>
      <body>
            {children}
      </body>
    </html>
  );
}
