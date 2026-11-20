"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import { Textarea } from "@actiontokens/ui/components/textarea";
import { Field } from "@actiontokens/ui/patterns/form-page";
import { slugFromName } from "@actiontokens/utils/slug";

import { api, type RouterOutputs } from "~/trpc/react";

import { FAN_APP_URL } from "../shell/links";

import { SettingsSection } from "./settings-section";

type Profile = RouterOutputs["profile"]["overview"];

const NAME_MAX = 98;
const BIO_MAX = 200;
const host = FAN_APP_URL.replace(/^https?:\/\//, "");
const CARD = "bg-surface grid gap-5 rounded-[1.4rem] border-2 p-5 sm:p-6";

/**
 * Name, bio and links. The page address follows the name; the old address
 * keeps working and sends fans to the new one.
 */
export function ProfileForm({ profile }: { profile: Profile }) {
  const utils = api.useUtils();
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [website, setWebsite] = useState(profile.website ?? "");
  const [twitter, setTwitter] = useState(profile.twitter ? `@${profile.twitter}` : "");
  const [instagram, setInstagram] = useState(profile.instagram ? `@${profile.instagram}` : "");
  const [saved, setSaved] = useState(false);
  const current = { name, bio, website, twitter, instagram };
  // What was last saved, as typed: the server tidies values (adds https://, drops @),
  // so comparing with the reloaded profile would always look "changed".
  const [base, setBase] = useState(current);

  const save = api.profile.update.useMutation({
    onSuccess: async (_result, input) => {
      setBase(input);
      setSaved(true);
      await Promise.all([
        utils.profile.overview.invalidate(),
        utils.portal.status.invalidate(),
        utils.account.me.invalidate(),
      ]);
    },
  });

  const slug = slugFromName(name.trim());
  const moves = slug !== profile.slug && slug.length > 0;
  const changed = (Object.keys(current) as (keyof typeof current)[]).some(
    (key) => current[key] !== base[key],
  );
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setSaved(false);
    };

  return (
    <form
      className="grid gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(current);
      }}
    >
      <SettingsSection
        title="Name and bio"
        description="Fans see these on your page, your pins and everything you sell."
      >
        <div className={CARD}>
          <Field
            label="Artist name"
            htmlFor="profile-name"
            required
            hint={
              moves ? (
                <>
                  Your page moves to{" "}
                  <b>
                    {host}/artist/{slug}
                  </b>
                  . The old address keeps working.
                </>
              ) : (
                <>
                  Your page: {host}/artist/{profile.slug}
                </>
              )
            }
          >
            <Input
              id="profile-name"
              value={name}
              maxLength={NAME_MAX}
              onChange={(event) => edit(setName)(event.target.value)}
            />
          </Field>

          <Field label="Bio" htmlFor="profile-bio" hint={`${bio.length} / ${BIO_MAX}`}>
            <Textarea
              id="profile-bio"
              value={bio}
              rows={3}
              maxLength={BIO_MAX}
              placeholder="A line or two about you and your music"
              onChange={(event) => edit(setBio)(event.target.value)}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Links"
        description="Shown on your page so fans can find you elsewhere."
      >
        <div className={CARD}>
          <Field label="Website" htmlFor="profile-website">
            <Input
              id="profile-website"
              value={website}
              placeholder="yoursite.com"
              onChange={(event) => edit(setWebsite)(event.target.value)}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="X (Twitter)" htmlFor="profile-twitter">
              <Input
                id="profile-twitter"
                value={twitter}
                placeholder="@yourname"
                onChange={(event) => edit(setTwitter)(event.target.value)}
              />
            </Field>
            <Field label="Instagram" htmlFor="profile-instagram">
              <Input
                id="profile-instagram"
                value={instagram}
                placeholder="@yourname"
                onChange={(event) => edit(setInstagram)(event.target.value)}
              />
            </Field>
          </div>
        </div>
      </SettingsSection>

      <div className="flex flex-wrap items-center gap-3 lg:pl-[calc(15rem+2.5rem)]">
        <Button type="submit" disabled={!changed || save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />} Save changes
        </Button>
        {save.error ? (
          <p role="alert" className="text-danger text-sm">
            {save.error.message}
          </p>
        ) : saved && !changed ? (
          <p className="text-success text-sm">Saved.</p>
        ) : (
          changed && <p className="text-fg-muted text-sm">You have unsaved changes.</p>
        )}
      </div>
    </form>
  );
}
