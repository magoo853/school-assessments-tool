/**
 * My Profile — tell the app who's working on this device.
 * Pick yourself from the assessor directory (photo, title, and
 * clearance come with it) or just type your name. The dashboard
 * greets you by first name. Per-device until accounts arrive.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { db, uid, type Assessor } from "@/lib/store";
import { useMode } from "@/lib/mode";
import { getProfile, setProfile, firstNameOf, type MyProfile } from "@/lib/profile";
import { useBranding, compressLogo } from "@/lib/branding";
import { Card, PageHeader, Badge, Btn, Field, inputCls } from "@/components/ui";

const CLEARANCE_LABEL: Record<Assessor["clearanceStatus"], { label: string; tone: "green" | "gray" | "red" }> = {
  current: { label: "Clearance current", tone: "green" },
  pending: { label: "Clearance pending", tone: "gray" },
  expired: { label: "Clearance expired", tone: "red" },
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ assessor, name, size = "h-12 w-12" }: { assessor?: Assessor; name: string; size?: string }) {
  if (assessor?.photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={assessor.photo}
        alt={name}
        className={`${size} shrink-0 rounded-xl border border-gray-200 object-cover`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`flex ${size} shrink-0 items-center justify-center rounded-xl bg-violet-100 font-bold text-violet-800`}
    >
      {initials(name)}
    </div>
  );
}

export default function ProfilePage() {
  const [mode] = useMode();
  const [tick, setTick] = useState(0);
  const [profile, setLocalProfile] = useState<MyProfile | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [addToDirectory, setAddToDirectory] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [branding, setBrandingState] = useBranding();
  const [company, setCompany] = useState("");
  const [logoMsg, setLogoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (branding) setCompany(branding.companyName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding?.companyName]);

  useEffect(() => {
    setLocalProfile(getProfile());
    setTick((t) => t + 1);
  }, [mode]);

  const assessors = useMemo(() => {
    void tick;
    return [...db.assessors.list()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tick]);

  const linked = profile?.assessorId
    ? assessors.find((a) => a.id === profile.assessorId)
    : undefined;

  const choose = (a: Assessor) => {
    const p: MyProfile = { name: a.name, assessorId: a.id };
    setProfile(p);
    setLocalProfile(p);
    setMsg(`You're set as ${a.name} — the dashboard will greet you by name.`);
  };

  const saveManual = () => {
    const n = name.trim();
    if (!n) return;
    let assessorId: string | undefined;
    if (addToDirectory) {
      const rec: Assessor = {
        id: uid("asr"),
        name: n,
        title: title.trim(),
        phone: "",
        email: "",
        clearanceStatus: "pending",
        notes: "",
      };
      db.assessors.upsert(rec);
      assessorId = rec.id;
      setTick((t) => t + 1);
    }
    const p: MyProfile = { name: n, assessorId };
    setProfile(p);
    setLocalProfile(p);
    setName("");
    setTitle("");
    setMsg(
      addToDirectory
        ? `Profile saved and added to the assessor directory. Hi, ${firstNameOf(n)}!`
        : `Profile saved. Hi, ${firstNameOf(n)}!`
    );
  };

  const clear = () => {
    setProfile(null);
    setLocalProfile(null);
    setMsg("Profile cleared on this device.");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
      />

      {/* Current profile */}
      <Card>
        {profile ? (
          <div className="flex flex-wrap items-center gap-4">
            <Avatar assessor={linked} name={profile.name} size="h-16 w-16" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-slate-900">{profile.name}</p>
              <p className="text-sm text-slate-500">
                {linked
                  ? `${linked.title || "Assessor"} · linked to the assessor directory`
                  : "Not linked to the assessor directory"}
              </p>
              {linked && (
                <div className="mt-1.5">
                  <Badge tone={CLEARANCE_LABEL[linked.clearanceStatus].tone}>
                    {CLEARANCE_LABEL[linked.clearanceStatus].label}
                  </Badge>
                </div>
              )}
            </div>
            <Btn variant="ghost" onClick={clear}>
              Clear profile
            </Btn>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            No profile yet on this device. Pick yourself below — or type your
            name — and the dashboard will say hello properly.
          </p>
        )}
        {msg && <p className="mt-3 text-sm text-emerald-700">{msg}</p>}
      </Card>

      {/* Pick from directory */}
      <Card>
        <h2 className="font-semibold text-slate-900">I&apos;m in the assessor directory</h2>
        <p className="mt-1 text-sm text-slate-500">
          Tap your name — your photo, title, and clearance come with your
          profile.
        </p>
        {assessors.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            {mode === "prod"
              ? "The directory is empty in prod until the shared database is connected."
              : "No assessors in the directory yet."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {assessors.map((a) => {
              const isMe = profile?.assessorId === a.id;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => choose(a)}
                    aria-pressed={isMe}
                    className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition ${
                      isMe
                        ? "border-violet-500 bg-violet-50"
                        : "border-slate-200 bg-white hover:border-violet-300"
                    }`}
                  >
                    <Avatar assessor={a} name={a.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900">
                        {a.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {a.title || "Assessor"}
                      </span>
                    </span>
                    <Badge tone={CLEARANCE_LABEL[a.clearanceStatus].tone}>
                      {CLEARANCE_LABEL[a.clearanceStatus].label}
                    </Badge>
                    {isMe && (
                      <span className="text-sm font-bold text-violet-700">
                        ✓ That&apos;s me
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Manual entry */}
      <Card>
        <h2 className="font-semibold text-slate-900">I&apos;m not in the directory</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Your name">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paul Toups"
            />
          </Field>
          <Field label="Title (optional)">
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lead Assessor"
            />
          </Field>
        </div>
        <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-5 w-5 accent-violet-600"
            checked={addToDirectory}
            onChange={(e) => setAddToDirectory(e.target.checked)}
          />
          Also add me to the assessor directory
        </label>
        <Btn onClick={saveManual} disabled={!name.trim()} className="mt-2">
          Save my profile
        </Btn>
        <p className="mt-3 text-xs text-slate-400">
          Profiles live on this device for now. When accounts arrive with the
          shared database, your profile will follow your login instead.
        </p>
      </Card>

      {/* Report branding (white-label) */}
      <Card>
        <h2 className="font-semibold text-slate-900">Your business on reports</h2>
        <p className="mt-1 text-sm text-slate-500">
          Client-ready reports — the print view and shared HTML files — carry
          your company name and logo, so the work goes out under your brand.
        </p>
        <div className="mt-3">
          <Field label="Company name">
            <input
              className={inputCls}
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                setBrandingState({
                  companyName: e.target.value,
                  logoDataUrl: branding?.logoDataUrl,
                });
              }}
              placeholder="e.g. Red Team Solutions"
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {branding?.logoDataUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.logoDataUrl}
                alt="Your logo"
                className="h-12 max-w-[180px] rounded-lg border border-slate-200 bg-white object-contain p-1"
              />
              <Btn
                variant="ghost"
                onClick={() =>
                  setBrandingState({
                    companyName: company,
                    logoDataUrl: undefined,
                  })
                }
              >
                Remove logo
              </Btn>
            </>
          ) : (
            <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              🖼 Upload logo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    const dataUrl = await compressLogo(f);
                    setBrandingState({
                      companyName: company,
                      logoDataUrl: dataUrl,
                    });
                    setLogoMsg("Logo saved — it will appear on reports.");
                  } catch {
                    setLogoMsg("Couldn't read that image — try a PNG or JPG.");
                  }
                }}
              />
            </label>
          )}
        </div>
        {logoMsg && <p className="mt-2 text-sm text-slate-600">{logoMsg}</p>}
      </Card>
    </div>
  );
}
