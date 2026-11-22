import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { ProfileForm } from "../../components/profile/ProfileForm";
import { LocationForm } from "../../components/profile/LocationForm";
import { PhotoManager } from "../../components/profile/PhotoManager";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";

const STEPS = [
  { id: 1, label: "About you", hint: "The basics and your interests" },
  { id: 2, label: "Your area", hint: "Where nearby means something" },
  { id: 3, label: "Photos", hint: "Put a face to the name" },
] as const;

export function OnboardingPage() {
  const { user, refresh } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [finishing, setFinishing] = useState(false);

  if (!user) return null;

  const aboutDone = Boolean(user.gender && user.birth_date && user.bio && user.tags.length > 0);
  const locationDone = Boolean(user.city);
  const photoDone = user.photos.some((photo) => photo.is_primary);
  const allDone = aboutDone && locationDone && photoDone;

  const finish = async () => {
    setFinishing(true);
    try {
      const me = await refresh();
      if (me?.complete) {
        notify("Your profile is ready. Welcome to Matcha!", "success");
        navigate("/discover", { replace: true });
      } else {
        notify("Add your details, a location, and a profile photo to finish.", "info");
      }
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="onboarding-page container">
      <header className="page-heading">
        <p className="eyebrow">Welcome to Matcha</p>
        <h1>Let's make your profile feel like you.</h1>
        <p className="lead">
          Three short steps. Everything can be changed later from your profile settings.
        </p>
      </header>

      <ol className="stepper">
        {STEPS.map((item) => {
          const done = item.id === 1 ? aboutDone : item.id === 2 ? locationDone : photoDone;
          return (
            <li key={item.id} className={`${step === item.id ? "is-current" : ""}${done ? " is-done" : ""}`}>
              <button
                type="button"
                onClick={() => setStep(item.id)}
                aria-current={step === item.id ? "step" : undefined}
              >
                <span className="stepper__number">
                  {done ? <Icon name="check" size={16} /> : item.id}
                </span>
                <span className="stepper__text">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="onboarding-panel card">
        {step === 1 ? (
          <>
            <div className="panel-heading">
              <h2>About you</h2>
              <p className="text-muted">This is what people will see first.</p>
            </div>
            <ProfileForm
              me={user}
              onSaved={refresh}
              submitLabel="Save details"
            />
            <div className="step-footer">
              <Button variant="primary" onClick={() => setStep(2)} disabled={!aboutDone}>
                Next: your area
              </Button>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="panel-heading">
              <h2>Where are you?</h2>
              <p className="text-muted">We only use an approximate area to suggest nearby people.</p>
            </div>
            <LocationForm current={user} onSaved={refresh} />
            <div className="step-footer">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!locationDone}>
                Next: photos
              </Button>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="panel-heading">
              <h2>Add your photos</h2>
              <p className="text-muted">One to five photos. Pick the one that feels most like you.</p>
            </div>
            <PhotoManager photos={user.photos} onChanged={refresh} />
            {!allDone ? (
              <div className="setup-checklist" role="status">
                <strong>Still needed before you enter:</strong>
                <span>
                  {!aboutDone ? <button type="button" className="link-button" onClick={() => setStep(1)}>Your details</button> : null}
                  {!locationDone ? <button type="button" className="link-button" onClick={() => setStep(2)}>Your area</button> : null}
                  {!photoDone ? <span>Add a profile photo</span> : null}
                </span>
              </div>
            ) : null}
            <div className="step-footer">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => void finish()} loading={finishing} disabled={!allDone}>
                Enter Matcha
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
