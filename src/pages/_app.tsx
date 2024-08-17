import type { Metadata, NextComponentType } from "next";
import { Inter } from "next/font/google";
import Layout from "@/components/Layout";
import {AppProps} from "next/app";

export default function MyApp({Component, pageProps}: AppProps) {
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
