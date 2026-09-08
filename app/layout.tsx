import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Рациональное зерно — визуальная новелла",
  description:
    "Сатирическая визуальная новелла о человеке, который перепутал взаимность с задачей оптимизации.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
