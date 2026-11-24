"use client";
/* eslint-disable @next/next/no-img-element -- community pictures and token icons come from many hosts */

import {
  BadgeCheck,
  Coins,
  Eye,
  ImagePlus,
  Lock,
  PenLine,
  Plus,
  Search,
  Shield,
  Trash2,
  Unlock,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { Switch } from "@actiontokens/ui/components/switch";
import { Textarea } from "@actiontokens/ui/components/textarea";
import { cn } from "@actiontokens/ui/lib/cn";

import { api } from "~/trpc/react";

import { useImagePick } from "./parts";

type Requirement = {
  assetCode: string;
  assetIssuer: string;
  assetImageUrl: string | null;
  requiredBalance: number;
};

type Values = {
  title: string;
  description: string;
  coverUrl: string;
  profileUrl: string;
  memberListVisibility: "EVERYONE" | "MEMBERS_ONLY";
  postPermission: "ALL_MEMBERS" | "OWNER_ONLY";
  isTokenGated: boolean;
  gateLogic: "AND" | "OR";
  requirements: Requirement[];
};

type SetValue = <K extends keyof Values>(key: K, value: Values[K]) => void;

const EMPTY: Values = {
  title: "",
  description: "",
  coverUrl: "",
  profileUrl: "",
  memberListVisibility: "EVERYONE",
  postPermission: "ALL_MEMBERS",
  isTokenGated: false,
  gateLogic: "AND",
  requirements: [],
};

type Step = "details" | "gate";

const isUrl = (value: string) => /^https?:\/\/\S+$/.test(value);

/** What's still missing before a step can be left. */
function missingFor(step: Step, values: Values): string[] {
  if (step === "details")
    return [
      !values.coverUrl && "a banner",
      values.coverUrl && !isUrl(values.coverUrl) && "a working banner address",
      !values.profileUrl && "a picture",
      values.profileUrl && !isUrl(values.profileUrl) && "a working picture address",
      !values.title.trim() && "a name",
      !values.description.trim() && "a description",
    ].filter(Boolean) as string[];
  if (step === "gate")
    return values.isTokenGated && values.requirements.length === 0 ? ["a token for the gate"] : [];
  return [];
}

/** Edit an existing community: loads it, then the same form. */
export function EditCommunity({ id }: { id: string }) {
  const community = api.community.byId.useQuery({ communityId: id });
  if (community.isPending) return <Skeleton className="h-96 rounded-3xl" />;
  if (!community.data?.isOwner)
    return <p className="cm-note">Only the owner can edit this community.</p>;
  const data = community.data;
  return (
    <CommunityForm
      id={id}
      initial={{
        title: data.title,
        description: data.description,
        coverUrl: data.coverUrl,
        profileUrl: data.profileUrl,
        memberListVisibility: data.memberListVisibility,
        postPermission: data.postPermission,
        isTokenGated: data.isTokenGated,
        gateLogic: data.gateLogic,
        requirements: data.requirements.map((req) => ({
          assetCode: req.assetCode,
          assetIssuer: req.assetIssuer,
          assetImageUrl: req.assetImageUrl,
          requiredBalance: Number(req.requiredBalance),
        })),
      }}
    />
  );
}

/**
 * Create or edit a community on one page: Details (banner, picture, name, what it's about),
 * Settings (who sees members, who posts) and the Token gate (tokens from a Stellar search or typed
 * in and checked, each with an amount, all or any), with a live preview beside it.
 */
export function CommunityForm({ id, initial = EMPTY }: { id?: string; initial?: Values }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [values, setValues] = useState<Values>(initial);
  const set: SetValue = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  const done = async (communityId: string) => {
    await utils.community.invalidate();
    toast.success(id ? "Saved." : "Your crew is live.");
    router.push(`/communities/${communityId}`);
  };
  const create = api.community.create.useMutation({
    onSuccess: (row) => done(row.id),
    onError: (error) => toast.error(error.message),
  });
  const update = api.community.update.useMutation({
    onSuccess: (row) => done(row.id),
    onError: (error) => toast.error(error.message),
  });
  const busy = create.isPending || update.isPending;
  const missing = [...missingFor("details", values), ...missingFor("gate", values)];

  return (
    <form
      className="cm-form-one"
      onSubmit={(event) => {
        event.preventDefault();
        if (missing.length > 0) return void toast.error(`Add ${missing.join(", ")}.`);
        const payload = {
          ...values,
          title: values.title.trim(),
          description: values.description.trim(),
          requirements: values.isTokenGated ? values.requirements : [],
        };
        if (id) update.mutate({ communityId: id, ...payload });
        else create.mutate(payload);
      }}
    >
      <div className="cm-form">
        <Details values={values} set={set} />
        <Settings values={values} set={set} />
        <GateBuilder values={values} set={set} />
      </div>
      <aside className="cm-form-side">
        <p className="cm-eyebrow">Live preview</p>
        <Preview values={values} />
        <p className="text-fg-faint text-xs">
          {missing.length > 0 ? `Still needs ${missing.join(", ")}.` : "Ready to go."}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : id ? "Save changes" : "Create crew"}
          </Button>
        </div>
      </aside>
    </form>
  );
}

function Details({ values, set }: { values: Values; set: SetValue }) {
  const fail = (message: string) => toast.error(message);
  const cover = useImagePick((url) => set("coverUrl", url), fail);
  const profile = useImagePick((url) => set("profileUrl", url), fail);
  return (
    <section className="cm-form-sec cm-form-sec--pics">
      <div className="cm-hero-cover cm-form-cover">
        {isUrl(values.coverUrl) && <img src={values.coverUrl} alt="" />}
        <button
          type="button"
          className="cm-pic-btn"
          onClick={cover.open}
          disabled={cover.uploading}
        >
          <ImagePlus className="size-4" />{" "}
          {cover.uploading ? "Uploading…" : values.coverUrl ? "Change banner" : "Add banner"}
        </button>
        <input {...cover.inputProps} />
      </div>
      <div className="cm-form-pic-row">
        <button
          type="button"
          className="cm-hero-pic cm-form-pic"
          onClick={profile.open}
          disabled={profile.uploading}
          aria-label="Change picture"
        >
          {isUrl(values.profileUrl) ? (
            <img src={values.profileUrl} alt="" />
          ) : (
            <Users className="size-8" />
          )}
          <span>{profile.uploading ? "…" : <ImagePlus className="size-4" />}</span>
        </button>
        <input {...profile.inputProps} />
        <div className="grid min-w-0 flex-1 gap-2">
          <Input
            value={values.coverUrl}
            onChange={(event) => set("coverUrl", event.target.value.trim())}
            placeholder="…or paste a banner address (https://)"
            aria-label="Banner address"
          />
          <Input
            value={values.profileUrl}
            onChange={(event) => set("profileUrl", event.target.value.trim())}
            placeholder="…or paste a picture address (https://)"
            aria-label="Picture address"
          />
        </div>
      </div>
      <div className="grid gap-4 px-5">
        <label className="cm-field">
          <span>Name</span>
          <Input
            value={values.title}
            maxLength={100}
            onChange={(event) => set("title", event.target.value)}
            placeholder="Night Shift Crew"
          />
        </label>
        <label className="cm-field">
          <span>
            What it&apos;s about <em className="cm-count">{values.description.length}/2000</em>
          </span>
          <Textarea
            value={values.description}
            maxLength={2000}
            rows={4}
            onChange={(event) => set("description", event.target.value)}
            placeholder="Late-night street ops. Drops at 00:00."
          />
        </label>
      </div>
    </section>
  );
}

function Settings({ values, set }: { values: Values; set: SetValue }) {
  return (
    <section className="cm-form-sec">
      <h2 className="cm-form-h">Settings</h2>
      <Option
        icon={<Eye className="size-4" />}
        label="Who can see the member list?"
        value={values.memberListVisibility}
        options={[
          ["EVERYONE", "Everyone", "Anyone visiting sees who's in."],
          ["MEMBERS_ONLY", "Members only", "Only people inside the crew see the list."],
        ]}
        onChange={(value) => set("memberListVisibility", value)}
      />
      <Option
        icon={<PenLine className="size-4" />}
        label="Who can post?"
        value={values.postPermission}
        options={[
          ["ALL_MEMBERS", "Every member", "Anyone in the crew can start a post."],
          ["OWNER_ONLY", "Only me", "You post, members like and comment."],
        ]}
        onChange={(value) => set("postPermission", value)}
      />
    </section>
  );
}

/** A labelled pair of big choice tiles. */
function Option<T extends string>({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: T;
  options: [T, string, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div className="cm-field">
      <span className="flex items-center gap-2">
        {icon} {label}
      </span>
      <div className="cm-options" role="radiogroup" aria-label={label}>
        {options.map(([key, title, hint]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            onClick={() => onChange(key)}
          >
            <b>{title}</b>
            <span>{hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Tokens people must hold to join: search Stellar assets, or type a code and issuer and check it
 * on the network. Each gets an amount (0 means holding a trustline is enough); all or any.
 */
function GateBuilder({ values, set }: { values: Values; set: SetValue }) {
  const [mode, setMode] = useState<"search" | "manual">("search");
  const has = (code: string, issuer: string) =>
    values.requirements.some((r) => r.assetCode === code && r.assetIssuer === issuer);
  const add = (req: Requirement) => {
    if (has(req.assetCode, req.assetIssuer))
      return toast.error("That token is already on the list.");
    if (values.requirements.length >= 10) return toast.error("Up to 10 tokens.");
    set("requirements", [...values.requirements, req]);
  };
  return (
    <section className="cm-form-sec">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="cm-form-h">Token gate</h2>
          <p className="text-fg-muted text-sm">Only people holding the right tokens get in.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          {values.isTokenGated ? <Lock className="size-4" /> : <Unlock className="size-4" />}
          {values.isTokenGated ? "Gated" : "Open to all"}
          <Switch
            checked={values.isTokenGated}
            onCheckedChange={(on) => set("isTokenGated", on)}
            aria-label="Token gate"
          />
        </label>
      </div>
      {values.isTokenGated && (
        <>
          <Option
            icon={<Shield className="size-4" />}
            label="People need"
            value={values.gateLogic}
            options={[
              ["AND", "All of the tokens", "Every token on the list, each at its amount."],
              ["OR", "Any one of them", "One token from the list is enough."],
            ]}
            onChange={(value) => set("gateLogic", value)}
          />
          {values.requirements.length > 0 && (
            <ul className="grid gap-2">
              {values.requirements.map((req, index) => (
                <li key={`${req.assetCode}-${req.assetIssuer}`} className="cm-req">
                  <TokenIcon code={req.assetCode} image={req.assetImageUrl} />
                  <span className="min-w-0 flex-1">
                    <b className="block">${req.assetCode}</b>
                    <span className="text-fg-faint block truncate font-mono text-[10px]">
                      {req.assetIssuer}
                    </span>
                  </span>
                  <label className="flex items-center gap-2 text-xs">
                    At least
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      className="h-9 w-24"
                      value={req.requiredBalance}
                      onChange={(event) =>
                        set(
                          "requirements",
                          values.requirements.map((r, i) =>
                            i === index
                              ? {
                                  ...r,
                                  requiredBalance: Math.max(0, Number(event.target.value) || 0),
                                }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${req.assetCode}`}
                    onClick={() =>
                      set(
                        "requirements",
                        values.requirements.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="cm-tabs cm-tabs--small self-start" role="group" aria-label="Add a token">
            <button
              type="button"
              aria-pressed={mode === "search"}
              onClick={() => setMode("search")}
            >
              Search
            </button>
            <button
              type="button"
              aria-pressed={mode === "manual"}
              onClick={() => setMode("manual")}
            >
              Type it in
            </button>
          </div>
          {mode === "search" ? <AssetSearch onPick={add} /> : <ManualAsset onAdd={add} />}
          <p className="text-fg-faint text-xs">
            Up to 10 tokens. An amount of 0 means a trustline to the token is enough.
          </p>
        </>
      )}
    </section>
  );
}

function TokenIcon({ code, image }: { code: string; image: string | null }) {
  return (
    <span className="cm-req-icon">{image ? <img src={image} alt="" /> : code.slice(0, 2)}</span>
  );
}

function AssetSearch({ onPick }: { onPick: (req: Requirement) => void }) {
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(typed.trim()), 350);
    return () => window.clearTimeout(id);
  }, [typed]);
  const hits = api.community.searchAssets.useQuery({ search }, { enabled: search.length > 0 });
  return (
    <div className="relative">
      <label className="cm-search">
        <Search className="size-4 shrink-0" />
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Search by token code, e.g. ACTION or USDC"
          aria-label="Find a token"
        />
      </label>
      {search && (
        <ul className="cm-hits">
          {hits.isPending ? (
            <li className="text-fg-faint p-3 text-sm">Searching…</li>
          ) : (hits.data ?? []).length === 0 ? (
            <li className="text-fg-faint p-3 text-sm">
              No tokens found. Try &ldquo;Type it in&rdquo; with the issuer.
            </li>
          ) : (
            hits.data!.map((hit) => (
              <li key={`${hit.assetCode}-${hit.assetIssuer}`}>
                <button
                  type="button"
                  onClick={() => {
                    onPick({
                      assetCode: hit.assetCode,
                      assetIssuer: hit.assetIssuer,
                      assetImageUrl: hit.assetImageUrl,
                      requiredBalance: 1,
                    });
                    setTyped("");
                    setSearch("");
                  }}
                >
                  <TokenIcon code={hit.assetCode} image={hit.assetImageUrl} />
                  <span className="min-w-0 flex-1 text-left">
                    <b className="block">
                      ${hit.assetCode}{" "}
                      {hit.name && <span className="text-fg-muted font-normal">· {hit.name}</span>}
                    </b>
                    <span className="text-fg-faint block truncate text-xs">
                      {hit.org ?? `${hit.assetIssuer.slice(0, 8)}…`} ·{" "}
                      {hit.trustlines.toLocaleString("en-US")} holders
                    </span>
                  </span>
                  <Plus className="size-4" />
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** A token typed in by code and issuer, checked on the network before it can be added. */
function ManualAsset({ onAdd }: { onAdd: (req: Requirement) => void }) {
  const [code, setCode] = useState("");
  const [issuer, setIssuer] = useState("");
  const [amount, setAmount] = useState(0);
  const [asked, setAsked] = useState<{ assetCode: string; assetIssuer: string } | null>(null);
  const valid = /^[A-Za-z0-9]{1,12}$/.test(code.trim()) && /^G[A-Z2-7]{55}$/.test(issuer.trim());
  const check = api.community.checkAsset.useQuery(asked ?? { assetCode: "", assetIssuer: "" }, {
    enabled: asked !== null,
    retry: false,
  });
  const verified =
    asked?.assetCode === code.trim() && asked.assetIssuer === issuer.trim() && check.data?.exists;
  return (
    <div className="cm-manual">
      <label className="cm-field">
        <span>Token code</span>
        <Input
          value={code}
          maxLength={12}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. ACTION"
        />
      </label>
      <label className="cm-field">
        <span>Issuer</span>
        <Input
          value={issuer}
          onChange={(e) => setIssuer(e.target.value.toUpperCase())}
          placeholder="Stellar address, 56 characters (G…)"
          className="font-mono text-xs"
          spellCheck={false}
        />
      </label>
      <label className="cm-field">
        <span>At least</span>
        <Input
          type="number"
          min={0}
          step="any"
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
          placeholder="0 = trustline only"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!valid || check.isFetching}
          onClick={() => setAsked({ assetCode: code.trim(), assetIssuer: issuer.trim() })}
        >
          {check.isFetching ? "Checking…" : "Check on Stellar"}
        </Button>
        <Button
          type="button"
          disabled={!verified}
          onClick={() => {
            onAdd({
              assetCode: code.trim(),
              assetIssuer: issuer.trim(),
              assetImageUrl: null,
              requiredBalance: amount,
            });
            setCode("");
            setIssuer("");
            setAmount(0);
            setAsked(null);
          }}
        >
          <Plus /> Add token
        </Button>
        {asked && !check.isFetching && check.data && (
          <span className={cn("text-sm", check.data.exists ? "text-primary-text" : "text-danger")}>
            {check.data.exists ? (
              <span className="inline-flex items-center gap-1">
                <BadgeCheck className="size-4" /> Found on the network
              </span>
            ) : (
              "Not found on the network"
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** The community as people will see it, before publishing. */
function Preview({ values }: { values: Values }) {
  const gated = values.isTokenGated && values.requirements.length > 0;
  return (
    <section className="cm-hero">
      <div className="cm-hero-cover" aria-hidden>
        {isUrl(values.coverUrl) && <img src={values.coverUrl} alt="" />}
      </div>
      <div className="cm-hero-body">
        <span className="cm-hero-pic">
          {isUrl(values.profileUrl) ? (
            <img src={values.profileUrl} alt="" />
          ) : (
            <Users className="size-9" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="cm-eyebrow">{gated ? "Token-gated crew" : "Open crew"}</p>
          <h2 className="cm-hero-title">{values.title || "Community name"}</h2>
        </div>
      </div>
      <p className="cm-hero-desc">{values.description || "What it's about…"}</p>
      <div className="flex flex-wrap gap-2 px-[clamp(16px,3vw,28px)] pb-5">
        <span className="cm-gate cm-gate--open">
          <Eye className="size-3" />
          {values.memberListVisibility === "EVERYONE" ? "Public member list" : "Members-only list"}
        </span>
        <span className="cm-gate cm-gate--open">
          <PenLine className="size-3" />
          {values.postPermission === "ALL_MEMBERS" ? "Every member posts" : "Only the owner posts"}
        </span>
        {gated && (
          <span className="cm-gate">
            <Shield className="size-3" />
            {values.gateLogic === "AND" ? "All tokens required" : "Any token required"}
          </span>
        )}
      </div>
      {gated && (
        <ul className="grid gap-2 px-[clamp(16px,3vw,28px)] pb-6">
          {values.requirements.map((req) => (
            <li key={`${req.assetCode}-${req.assetIssuer}`} className="cm-req">
              <TokenIcon code={req.assetCode} image={req.assetImageUrl} />
              <b className="flex-1">
                {req.requiredBalance > 0
                  ? `${req.requiredBalance.toLocaleString("en-US")} $${req.assetCode}`
                  : `$${req.assetCode} (trustline only)`}
              </b>
              <Coins className="text-fg-faint size-4" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
