import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Рациональное зерно — визуальная новелла",
  description:
    "Сатирическая визуальная новелла о человеке, который перепутал взаимность с задачей оптимизации.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
