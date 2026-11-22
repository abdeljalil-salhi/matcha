import type { CityLocationSuggestion } from "../../api/types";
import { Button } from "../ui/Button";

interface Props {
  suggestion: CityLocationSuggestion;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Present a city-only result without saving until the user confirms. */
export function CityLocationConfirmation({ suggestion, busy, onConfirm, onCancel }: Props) {
  return (
    <div className="notice notice--info city-location-confirmation" role="status">
      <p>We found {suggestion.city} ({suggestion.country_code}), but couldn’t identify a neighborhood.</p>
      <p>You can save this city as your manually confirmed approximate location.</p>
      <Button loading={busy} onClick={onConfirm}>
        Use {suggestion.city} as my approximate location
      </Button>{" "}
      <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
    </div>
  );
}
