import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Navbar from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dahua Compatible Firmware Sites",
  description: "Should list most firmwares for Dahua devices",
};

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Navbar />

      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
        {children}
      </div>
    </>
  );
}
