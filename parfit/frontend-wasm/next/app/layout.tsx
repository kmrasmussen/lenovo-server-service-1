import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "parfit-next",
  description: "temporally fine-grained human AI collaboriation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
