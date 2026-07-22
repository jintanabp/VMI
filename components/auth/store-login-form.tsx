"use client";

import { appPath } from "@/lib/paths";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Lock, Clock, ShieldX, KeyRound, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Step = "email" | "set-password" | "login" | "pending" | "rejected";

export function StoreLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  // สมัครใหม่: ให้เลือก VDA ของร้าน
  const [needVda, setNeedVda] = useState(false);
  const [vdaCode, setVdaCode] = useState("");
  const [vdaOptions, setVdaOptions] = useState<string[]>([]);

  async function loadVdaOptions() {
    try {
      const res = await fetch(appPath("/api/vda"));
      const data = await res.json();
      setVdaOptions(Array.isArray(data.sources) ? data.sources : []);
    } catch {
      setVdaOptions([]);
    }
  }

  function reset(toStep: Step) {
    setPassword("");
    setConfirm("");
    setError("");
    setNeedVda(false);
    setVdaCode("");
    setStep(toStep);
  }

  async function submitEmail(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.trim()) return;
    if (needVda && !vdaCode) {
      setError("กรุณาเลือก VDA ของร้านค้า");
      return;
    }
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(appPath("/api/auth/store/request"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, vdaCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        // บัญชีใหม่ — ต้องเลือก VDA ก่อนส่งคำขอ
        if (data.needVda) {
          setNeedVda(true);
          await loadVdaOptions();
          setError("");
          setInfo("ร้านค้าใหม่ — กรุณาเลือก VDA ของร้านเพื่อส่งคำขอ");
          return;
        }
        setError(data.error ?? "เกิดข้อผิดพลาด");
        return;
      }
      reset(data.step as Step);
      if (data.step === "pending" && data.message) setInfo(data.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitSetPassword(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }
    if (password !== confirm) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(appPath("/api/auth/store/set-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "ตั้งรหัสไม่สำเร็จ");
        return;
      }
      router.push("/stock");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function submitLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(appPath("/api/auth/store/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.step) reset(data.step as Step);
        setError(data.error ?? "เข้าสู่ระบบไม่สำเร็จ");
        return;
      }
      router.push("/stock");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function requestReset() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(appPath("/api/auth/store/request-reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setInfo(data.message ?? "ส่งคำขอรีเซ็ตรหัสแล้ว");
    } finally {
      setLoading(false);
    }
  }

  const errorBox = error && (
    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
      {error}
    </p>
  );
  const infoBox = info && (
    <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-200">
      {info}
    </p>
  );

  if (step === "pending") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-8 text-center dark:border-amber-800/50 dark:bg-amber-950/30">
          <Clock className="h-10 w-10 text-amber-500" />
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            บัญชีของคุณรอการอนุมัติจากแอดมิน
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
            {email}
          </p>
        </div>
        {infoBox}
        <Button variant="outline" className="w-full" onClick={() => reset("email")}>
          ใช้อีเมลอื่น
        </Button>
      </div>
    );
  }

  if (step === "rejected") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-8 text-center dark:border-red-900/50 dark:bg-red-950/30">
          <ShieldX className="h-10 w-10 text-red-500" />
          <p className="text-sm font-medium text-red-900 dark:text-red-200">
            บัญชีนี้ไม่ได้รับสิทธิเข้าใช้งาน
          </p>
          <p className="text-xs text-red-800/80 dark:text-red-300/80">
            โปรดติดต่อแอดมิน
          </p>
        </div>
        <Button variant="outline" className="w-full" onClick={() => reset("email")}>
          ใช้อีเมลอื่น
        </Button>
      </div>
    );
  }

  if (step === "set-password") {
    return (
      <form onSubmit={submitSetPassword} className="space-y-4">
        <div className="rounded-xl border border-teal-200 bg-teal-50/80 px-3 py-2 text-xs text-teal-800 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-200">
          ยินดีต้อนรับ {email} — ตั้งรหัสผ่านสำหรับเข้าใช้งานครั้งต่อไป
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="password"
            className="pl-9"
            placeholder="ตั้งรหัสผ่านใหม่"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="password"
            className="pl-9"
            placeholder="ยืนยันรหัสผ่าน"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {errorBox}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "ตั้งรหัสและเข้าสู่ระบบ"}
        </Button>
      </form>
    );
  }

  if (step === "login") {
    return (
      <form onSubmit={submitLogin} className="space-y-4">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" value={email} disabled />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="password"
            className="pl-9"
            placeholder="รหัสผ่าน"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        {errorBox}
        {infoBox}
        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "เข้าสู่ระบบ"}
        </Button>
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-400"
            onClick={() => reset("email")}
          >
            ใช้อีเมลอื่น
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-400"
            onClick={requestReset}
            disabled={loading}
          >
            <KeyRound className="h-3.5 w-3.5" />
            ลืมรหัสผ่าน?
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitEmail} className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        กรอกอีเมลของทางร้านค้าเพื่อเข้าสู่ระบบ
      </p>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="email"
          className="pl-9"
          placeholder="อีเมลร้านค้า"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
      </div>
      {needVda && (
        <div className="relative">
          <Warehouse className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            value={vdaCode}
            onChange={(e) => setVdaCode(e.target.value)}
          >
            <option value="">— เลือก VDA ของร้านค้า —</option>
            {vdaOptions.map((v) => (
              <option key={v} value={v}>
                {v.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      )}
      {errorBox}
      {infoBox}
      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={loading || !email.trim() || (needVda && !vdaCode)}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : needVda ? (
          "ส่งคำขอใช้งาน"
        ) : (
          "ถัดไป"
        )}
      </Button>
    </form>
  );
}
