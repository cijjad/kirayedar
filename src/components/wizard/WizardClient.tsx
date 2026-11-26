"use client";
import dynamic from "next/dynamic";
import { Loading } from "@/components/Loading";

/**
 * The wizard reads/writes the on-device draft (localStorage), so it renders
 * on the client only. This avoids hydration mismatches.
 */
export const WizardClient = dynamic(() => import("./Wizard").then((m) => m.Wizard), { ssr: false, loading: () => <Loading /> });
