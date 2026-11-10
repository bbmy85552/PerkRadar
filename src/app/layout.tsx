import type { Metadata, Viewport } from "next";
import "./globals.css";

export const preferredRegion = "hkg1";

export const metadata: Metadata = {
  title: "PerkRadar · 多来源优惠线索聚合",
  description: "每两小时聚合七个公开来源的优惠线索，失败来源会标明并在下一轮重试。这是线索聚合，不是逐条认证的领取平台。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F5F7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-dvh bg-[#F5F5F7] font-sans text-[#1D1D1F] antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
