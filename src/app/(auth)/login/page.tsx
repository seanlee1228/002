"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card as HCard,
  CardBody as HCardBody,
  CardHeader as HCardHeader,
  Input as HInput,
  Button as HButton,
} from "@heroui/react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(t("error"));
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-blue-950 dark:to-indigo-950 p-4 relative overflow-hidden">
      {/* Ambient glow orbs */}
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-blue-400/10 dark:bg-blue-600/15 rounded-full blur-[120px]" />
      <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-purple-400/10 dark:bg-purple-600/15 rounded-full blur-[120px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-400/8 dark:bg-indigo-500/10 rounded-full blur-[120px]" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.08) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <HCard
        isBlurred
        className="w-full max-w-md relative z-10 border border-v-border bg-v-input backdrop-blur-xl rounded-3xl shadow-[0_8px_60px_-12px_rgba(59,130,246,0.25),0_0_80px_-20px_rgba(99,102,241,0.2)]"
      >
        <HCardHeader className="flex flex-col items-center gap-2 pt-10 pb-2">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-2 shadow-lg shadow-blue-500/25">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="w-8 h-8 text-white"
            >
              <path
                d="M12.45 16h2.09L9.43 3H7.57L2.46 16h2.09l1.12-3h5.64l1.14 3zm-6.02-5L8.5 5.48L10.57 11H6.43zm15.16.59l-8.09 8.09L9.83 16l-1.41 1.41l5.09 5.09L23 13l-1.41-1.41z"
                fill="currentColor"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-v-text1">Sign In</h1>
          <p className="text-sm text-v-text3">Please enter your credentials</p>
        </HCardHeader>

        <HCardBody className="px-8 pb-8 pt-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <HInput
              placeholder={t("username")}
              value={username}
              onValueChange={setUsername}
              isRequired
              variant="bordered"
              classNames={{
                input: "text-v-text1 placeholder:text-v-text3",
                inputWrapper:
                  "border-v-border-input hover:border-v-border-hover bg-v-input group-data-[focus=true]:border-blue-500",
              }}
            />
            <HInput
              placeholder={t("password")}
              type="password"
              value={password}
              onValueChange={setPassword}
              isRequired
              variant="bordered"
              classNames={{
                input: "text-v-text1 placeholder:text-v-text3",
                inputWrapper:
                  "border-v-border-input hover:border-v-border-hover bg-v-input group-data-[focus=true]:border-blue-500",
              }}
            />

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl">
                {error}
              </div>
            )}

            <HButton
              type="submit"
              isLoading={loading}
              spinner={<Loader2 className="h-4 w-4 animate-spin" />}
              className="w-full h-11 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-shadow"
            >
              {loading ? t("submitting") : t("submit")}
            </HButton>
          </form>

        </HCardBody>
      </HCard>
    </div>
  );
}
