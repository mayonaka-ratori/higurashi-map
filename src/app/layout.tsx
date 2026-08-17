import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ひぐらしのなくところに",
  description:
    "今日、カナカナが聞こえる場所。ヒグラシを聞きたい人のための匿名リアルタイム共有マップ。",
  // ホーム画面に置いたときの名前・アイコン・起動のしかた
  manifest: "/manifest.webmanifest",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "ひぐらし" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  // ヘッダーと同じ濃緑。metadata の themeColor はこのNextでは非推奨
  themeColor: "#073024",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <head>
        {/* 本文フォント。読めないときは端末のゴシックに落ちる（globals.cssの指定順） */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap"
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
