import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type Gender, type Me, type ProfilePatch } from "../../api";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { GENDERS, maxBirthDate, normalizeTag, parseTags, validateBirthDate, validateName } from "../../utils/validation";

interface ProfileFormProps {
  me: Me;
  onSaved: () => void | Promise<unknown>;
  submitLabel?: string;
}

export function ProfileForm({ me, onSaved, submitLabel = "Save profile" }: ProfileFormProps) {
  const [firstName, setFirstName] = useState(me.first_name ?? "");
  const [lastName, setLastName] = useState(me.last_name ?? "");
  const [birthDate, setBirthDate] = useState(me.birth_date ?? "");
  const [gender, setGender] = useState<Gender | "">(me.gender ?? "");
  const [seeks, setSeeks] = useState<Gender[]>(me.seeks ?? []);
  const [bio, setBio] = useState(me.bio ?? "");
  const [tags, setTags] = useState<string[]>(me.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const suggestionTimer = useRef<number | null>(null);

  useEffect(() => {
    setFirstName(me.first_name ?? "");
    setLastName(me.last_name ?? "");
    setBirthDate(me.birth_date ?? "");
    setGender(me.gender ?? "");
    setSeeks(me.seeks ?? []);
    setBio(me.bio ?? "");
    setTags(me.tags ?? []);
  }, [me.id, me.first_name, me.last_name, me.birth_date, me.gender, me.seeks, me.bio, me.tags]);

  useEffect(
    () => () => {
      if (suggestionTimer.current) window.clearTimeout(suggestionTimer.current);
    },
    [],
  );

  const searchTags = (value: string) => {
    const query = normalizeTag(value);
    if (suggestionTimer.current) window.clearTimeout(suggestionTimer.current);
    if (!query) {
      setSuggestions([]);
      return;
    }
    suggestionTimer.current = window.setTimeout(() => {
      void api.profile
        .tags(query)
        .then((result) => setSuggestions(result.tags.filter((tag) => !tags.includes(tag)).slice(0, 8)))
        .catch(() => setSuggestions([]));
    }, 220);
  };

  const addTags = (raw: string) => {
    const parsed = parseTags(raw);
    if (parsed.length === 0) return;
    setTags((current) => [...new Set([...current, ...parsed])].slice(0, 15));
    setTagInput("");
    setSuggestions([]);
    setErrors((current) => ({ ...current, tags: "" }));
  };

  const toggleSeeks = (value: Gender) => {
    setSeeks((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const firstError = validateName(firstName, "First name");
    if (firstError) next.first_name = firstError;
    const lastError = validateName(lastName, "Last name");
    if (lastError) next.last_name = lastError;
    const birthError = validateBirthDate(birthDate);
    if (birthError) next.birth_date = birthError;
    if (!gender) next.gender = "Choose your gender.";
    if (!bio.trim()) next.bio = "Tell people a little about yourself.";
    else if (bio.length > 1500) next.bio = "Keep your bio under 1,500 characters.";
    if (tags.length === 0) next.tags = "Add at least one interest.";
    setErrors(next);
    if (Object.values(next).some(Boolean) || !gender) return;

    const patch: ProfilePatch = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      birth_date: birthDate,
      gender,
      seeks: seeks.length > 0 ? seeks : null,
      bio: bio.trim(),
      tags,
    };

    setBusy(true);
    setFormError(null);
    setSaved(false);
    try {
      await api.profile.update(patch);
      await onSaved();
      setSaved(true);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Unable to save your profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="profile-form" onSubmit={(event) => void submit(event)} noValidate>
      {formError ? <div className="error-banner" role="alert">{formError}</div> : null}
      {saved ? <div className="notice notice--success" role="status">Your details were saved.</div> : null}

      <div className="form-grid">
        <Field label="First name" htmlFor="profile-first" error={errors.first_name} required>
          <input
            id="profile-first"
            className="input"
            value={firstName}
            maxLength={80}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </Field>
        <Field label="Last name" htmlFor="profile-last" error={errors.last_name} required>
          <input
            id="profile-last"
            className="input"
            value={lastName}
            maxLength={80}
            onChange={(event) => setLastName(event.target.value)}
          />
        </Field>
      </div>

      <div className="form-grid">
        <Field label="Date of birth" htmlFor="profile-birth" error={errors.birth_date} required>
          <input
            id="profile-birth"
            className="input"
            type="date"
            max={maxBirthDate()}
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
          />
        </Field>
        <Field label="I am a" htmlFor="profile-gender" error={errors.gender} required>
          <select
            id="profile-gender"
            className="input"
            value={gender}
            onChange={(event) => setGender(event.target.value as Gender | "")}
          >
            <option value="">Select…</option>
            {GENDERS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="I'm interested in"
        hint="Leave everything unchecked to be open to everyone."
      >
        <div className="checkbox-row">
          {GENDERS.map((option) => (
            <label key={option.value} className="checkbox-pill">
              <input
                type="checkbox"
                checked={seeks.includes(option.value)}
                onChange={() => toggleSeeks(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="About me" htmlFor="profile-bio" error={errors.bio} required>
        <textarea
          id="profile-bio"
          className="input textarea"
          rows={5}
          maxLength={1500}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          placeholder="What makes you smile? What are you looking for?"
        />
        <span className="char-count">{bio.length}/1500</span>
      </Field>

      <Field label="Interests" error={errors.tags} hint="Press Enter or comma to add a tag. Up to 15.">
        <div className="tag-editor">
          {tags.map((tag) => (
            <span key={tag} className="tag-editor__tag">
              #{tag}
              <button
                type="button"
                onClick={() => setTags((current) => current.filter((entry) => entry !== tag))}
                aria-label={`Remove ${tag}`}
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
          <input
            className="tag-editor__input"
            value={tagInput}
            maxLength={40}
            placeholder={tags.length >= 15 ? "Maximum reached" : "Add an interest…"}
            disabled={tags.length >= 15}
            onChange={(event) => {
              setTagInput(event.target.value);
              searchTags(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addTags(tagInput);
              }
            }}
            onBlur={(event) => {
              if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest(".tag-suggestions")) return;
              if (tagInput.trim()) addTags(tagInput);
            }}
          />
        </div>
        {suggestions.length > 0 && tagInput.trim() ? (
          <div className="tag-suggestions">
            {suggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addTags(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        ) : null}
      </Field>

      <div className="form-actions">
        <Button type="submit" size="lg" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}
