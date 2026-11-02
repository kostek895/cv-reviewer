import "./cv.css";

export const metadata = { title: "CV" };

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
